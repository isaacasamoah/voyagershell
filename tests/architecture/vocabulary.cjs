const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("./yaml.cjs");
const { glob } = require("./snapshot.cjs");

const HERE = __dirname;
const TABLE = path.join(HERE, "vocabulary.yaml");
const KNOWN = path.join(HERE, "known-violations.yaml");
const PREFIX = "one-vocabulary: ";

function load(file = TABLE) {
  const table = parse(fs.readFileSync(file, "utf8"));
  const matchers = (list) => (list ?? []).map(glob);
  const any = (list) => (name) => list.some((regex) => regex.test(name));
  const rules = (table.rules ?? []).map((rule) => {
    for (const key of ["id", "stage", "old", "new"])
      if (rule[key] === undefined || rule[key] === null)
        throw Error(`Vocabulary rule needs ${key}: ${JSON.stringify(rule)}`);
    const files = rule.files ? any(matchers(rule.files)) : () => true;
    const skip = rule.skip ? any(matchers(rule.skip)) : () => false;
    return {
      ...rule,
      applies: (name) => files(name) && !skip(name),
      pattern: new RegExp(rule.old, rule.flags ?? "g"),
      ban: new RegExp(rule.ban ?? rule.old),
      banned: rule.ban !== false,
    };
  });
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw Error(`Duplicate vocabulary rule ${rule.id}`);
    ids.add(rule.id);
  }
  const settings = table.settings ?? {};
  return {
    rules,
    moves: table.moves ?? [],
    kinds: new Set(settings.kinds ?? []),
    skipped: any(matchers(settings.skip)),
    generated: any(matchers(settings.generated)),
  };
}

const FOREIGN = /https?:\/\/[^\s)>\]"'`]+|[\w./-]*herdr-app[\w./-]*/g;

function shield(text) {
  const held = [];
  const masked = text.replace(FOREIGN, (match) => {
    held.push(match);
    return `\u0000${held.length - 1}\u0000`;
  });
  return {
    masked,
    restore: (value) => value.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]),
  };
}

function isText(table, name) {
  return table.kinds.has(path.extname(name).slice(1));
}

function scan(table, names, read) {
  const found = new Map();
  for (const name of names) {
    if (table.skipped(name) || !isText(table, name)) continue;
    const lines = shield(read(name)).masked.split("\n");
    for (const rule of table.rules) {
      if (!rule.banned || !rule.applies(name)) continue;
      lines.forEach((text, index) => {
        if (!rule.ban.test(text)) return;
        const key = rule.group ?? rule.id;
        if (!found.has(key)) found.set(key, []);
        found
          .get(key)
          .push({ file: name, line: index + 1, text, rule: rule.id });
      });
    }
  }
  return found;
}

function scanSnapshot(table, snapshot) {
  return scan(table, snapshot.blobs.keys(), (name) => snapshot.read(name));
}

function tracked(repository) {
  return execFileSync("git", ["-C", repository, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\0")
    .filter(Boolean)
    .filter((name) => fs.lstatSync(path.join(repository, name)).isFile());
}

function move(repository, from, to) {
  const source = path.join(repository, from);
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(path.join(repository, to)), { recursive: true });
  execFileSync("git", ["-C", repository, "mv", from, to]);
  return true;
}

function segments(name, text) {
  const rust = name.endsWith(".rs");
  const character = /^'(\\.[^']*|[^'\\])'/;
  const parts = [];
  let code = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const ahead = text.slice(index, index + 12);
    let end = -1;
    if (rust && char === "r" && /^r#*"/.test(ahead)) {
      const hashes = /^r(#*)"/.exec(ahead)[1];
      const close = text.indexOf(`"${hashes}`, index + 2 + hashes.length);
      end = close < 0 ? text.length : close + 1 + hashes.length;
    } else if (char === '"' || (!rust && (char === "'" || char === "`"))) {
      end = index + 1;
      while (end < text.length && text[end] !== char)
        end += text[end] === "\\" ? 2 : 1;
      end += 1;
    } else if (rust && char === "'" && character.test(ahead)) {
      end = index + character.exec(ahead)[0].length;
    }
    if (end < 0) {
      index += 1;
      continue;
    }
    parts.push({ text: text.slice(code, index), isCode: true });
    parts.push({ text: text.slice(index, end), isCode: false });
    index = end;
    code = end;
  }
  parts.push({ text: text.slice(code), isCode: true });
  return parts;
}

function rewrite(table, stage, name, text) {
  const guarded = shield(text);
  let next = guarded.masked;
  for (const rule of table.rules) {
    if (rule.stage !== stage || !rule.applies(name)) continue;
    next = rule.code
      ? segments(name, next)
          .map((part) =>
            part.isCode ? part.text.replace(rule.pattern, rule.new) : part.text,
          )
          .join("")
      : next.replace(rule.pattern, rule.new);
  }
  return guarded.restore(next);
}

function apply(table, stage, repository) {
  const moved = table.moves
    .filter((entry) => entry.stage === stage)
    .filter((entry) => move(repository, entry.from, entry.to));
  const changed = [];
  for (const name of tracked(repository)) {
    if (table.skipped(name) || table.generated(name) || !isText(table, name))
      continue;
    const file = path.join(repository, name);
    const text = fs.readFileSync(file, "utf8");
    const next = rewrite(table, stage, name, text);
    if (next === text) continue;
    fs.writeFileSync(file, next);
    changed.push(name);
  }
  return { moved, changed };
}

function counts(found) {
  return new Map([...found].map(([id, hits]) => [id, hits.length]));
}

function sync(table, repository, known = KNOWN) {
  const found = scan(table, tracked(repository), (name) =>
    fs.readFileSync(path.join(repository, name), "utf8"),
  );
  const entries = fs.readFileSync(known, "utf8").split(/\n(?=  - id: )/);
  const kept = entries.filter(
    (entry) => !/^ {2}- id: '?one-vocabulary: /.test(entry),
  );
  const added = [...found]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([id, hits]) =>
        `  - id: '${PREFIX}${id}'\n    limit: ${hits.length}\n    owner: isaac\n    reason: 'This banned word is still in the tree. The codemod stage that renames it clears this entry.'`,
    );
  fs.writeFileSync(
    known,
    `${[...kept.map((entry) => entry.replace(/\n+$/, "")), ...added].join("\n")}\n`,
  );
  return found;
}

function report(found, table) {
  const lines = [...found]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, hits]) => `${String(hits.length).padStart(5)}  ${key}`);
  return `${lines.join("\n")}\n`;
}

function main(args) {
  const option = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const repository = path.resolve(
    option("--repository", path.join(HERE, "../..")),
  );
  const table = load(option("--table") && path.resolve(option("--table")));
  if (args.includes("--apply")) {
    const stage = Number(option("--apply"));
    const result = apply(table, stage, repository);
    process.stdout.write(
      `stage ${stage}: ${result.moved.length} moves, ${result.changed.length} files rewritten\n`,
    );
    return;
  }
  if (args.includes("--sync-known")) {
    const found = sync(table, repository);
    process.stdout.write(report(found, table));
    return;
  }
  const names = tracked(repository);
  const found = scan(table, names, (name) =>
    fs.readFileSync(path.join(repository, name), "utf8"),
  );
  process.stdout.write(report(found, table));
  const show = option("--show");
  for (const hit of found.get(show) ?? [])
    process.stdout.write(
      `${hit.file}:${hit.line}: ${hit.text.trim().slice(0, 160)}\n`,
    );
  process.exitCode = found.size ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { load, scan, scanSnapshot, apply, rewrite, sync, TABLE };
