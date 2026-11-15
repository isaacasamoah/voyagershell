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
  const files = (list) => any((list ?? []).map(glob));
  const rules = (table.rules ?? []).map((rule) => {
    for (const key of ["id", "stage", "old", "new"])
      if (rule[key] === undefined || rule[key] === null)
        throw Error(`Vocabulary rule needs ${key}: ${JSON.stringify(rule)}`);
    const include = rule.files ? files(rule.files) : () => true;
    const skip = rule.skip ? files(rule.skip) : () => false;
    return {
      ...rule,
      applies: (name) => include(name) && !skip(name),
      pattern: new RegExp(rule.old, rule.flags ?? "g"),
      ban: new RegExp(rule.ban ?? rule.old),
      banned: rule.ban !== false,
    };
  });
  const settings = table.settings ?? {};
  const retired = (table.retired ?? []).map(retiredRule);
  const ids = new Set();
  for (const rule of [...rules, ...retired]) {
    if (ids.has(rule.id)) throw Error(`Duplicate vocabulary rule ${rule.id}`);
    ids.add(rule.id);
  }
  const exceptions = table.exceptions ?? [];
  for (const entry of exceptions)
    if (!entry.text || !entry.reason)
      throw Error(
        `Vocabulary exception needs text and reason: ${JSON.stringify(entry)}`,
      );
  return {
    rules,
    retired,
    moves: table.moves ?? [],
    foreign: new RegExp(
      [
        urlPattern(settings.own ?? []),
        PATH_FOREIGN.source,
        ...exceptions.map((entry) => escape(entry.text)),
      ].join("|"),
      "g",
    ),
    skipped: files(settings.skip),
    generated: files(settings.generated),
  };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATH_FOREIGN = /[\w./-]*herdr-app[\w./-]*/;
const URL = /https?:\/\/[^\s)>\]"'`]+/;

function urlPattern(own) {
  const mine = own.map(escape).join("|");
  return mine
    ? `https?:\\/\\/(?!(?:www\\.)?(?:${mine})(?:[/#?]|$))[^\\s)>\\]"'\`]+`
    : URL.source;
}

function shield(table, text) {
  const held = [];
  const masked = text.replace(table.foreign, (match) => {
    held.push(match);
    return `\u0000${held.length - 1}\u0000`;
  });
  return {
    masked,
    restore: (value) => value.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]),
  };
}

const isText = (text) => !text.includes("\u0000");

const PARTS = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g;
const JOINER = /^(?:[ \t_-]|\r?\n[ \t]*(?:(?:\/\/[/!]?|#+|\*+|>+)[ \t]*)?)*$/;

function retiredRule(entry) {
  for (const key of ["id", "group", "words", "term"])
    if (!entry[key])
      throw Error(`Retired word needs ${key}: ${JSON.stringify(entry)}`);
  const words = String(entry.words).toLowerCase().split(" ");
  const swap = entry.swap ? String(entry.swap).split(" ") : null;
  if (swap && swap.length !== words.length)
    throw Error(`Retired swap needs ${words.length} words: ${entry.id}`);
  return {
    ...entry,
    words,
    swap,
    allow: (entry.allow ?? []).map((item) => ({
      pattern: new RegExp(item.pattern ?? item, "g"),
      applies: item.files ? any(item.files.map(glob)) : () => true,
    })),
    skipped: any((entry.skip ?? []).map(glob)),
  };
}

function any(matchers) {
  return (name) => matchers.some((regex) => regex.test(name));
}

function tokens(text) {
  const found = [];
  for (const run of text.matchAll(/[A-Za-z]+/g))
    for (const part of run[0].matchAll(PARTS))
      found.push({
        raw: part[0],
        word: part[0].toLowerCase(),
        start: run.index + part.index,
        end: run.index + part.index + part[0].length,
      });
  return found;
}

function unallowed(rule, name, text) {
  return rule.allow
    .filter((item) => item.applies(name))
    .reduce(
      (kept, item) =>
        kept.replace(item.pattern, (match) =>
          match.replace(/[^\n]/g, "\u0001"),
        ),
      text,
    );
}

function phrases(rule, name, text) {
  const list = tokens(unallowed(rule, name, text));
  const last = rule.words.length - 1;
  const hits = [];
  for (let at = 0; at + last < list.length; at += 1) {
    const matched = rule.words.every((word, offset) => {
      const token = list[at + offset];
      if (
        token.word !== word &&
        !(offset === last && token.word === `${word}s`)
      )
        return false;
      return (
        offset === 0 ||
        JOINER.test(text.slice(list[at + offset - 1].end, token.start))
      );
    });
    if (matched) hits.push(list.slice(at, at + last + 1));
  }
  return hits;
}

function lineStarts(text) {
  const starts = [0];
  for (
    let index = text.indexOf("\n");
    index >= 0;
    index = text.indexOf("\n", index + 1)
  )
    starts.push(index + 1);
  return starts;
}

function lineOf(starts, position) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

function scan(table, names, read) {
  const found = new Map();
  const seen = new Set();
  const record = (key, file, line, text, rule) => {
    const mark = `${key}\0${file}\0${line}`;
    if (seen.has(mark)) return;
    seen.add(mark);
    if (!found.has(key)) found.set(key, []);
    found.get(key).push({ file, line, text, rule });
  };
  for (const name of names) {
    if (table.skipped(name)) continue;
    const source = read(name);
    if (!isText(source)) continue;
    const { masked } = shield(table, source);
    const lines = masked.split("\n");
    for (const rule of table.rules) {
      if (!rule.banned || !rule.applies(name)) continue;
      lines.forEach((text, index) => {
        if (rule.ban.test(text))
          record(rule.group ?? rule.id, name, index + 1, text, rule.id);
      });
    }
    const starts = lineStarts(masked);
    for (const rule of table.retired) {
      if (rule.skipped(name)) continue;
      for (const hit of phrases(rule, name, masked)) {
        const index = lineOf(starts, hit[0].start);
        record(rule.group, name, index + 1, lines[index], rule.id);
      }
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

function cased(raw, word) {
  if (raw.length > 1 && raw === raw.toUpperCase()) return word.toUpperCase();
  return raw[0] === raw[0].toUpperCase()
    ? word[0].toUpperCase() + word.slice(1)
    : word;
}

function swapRetired(table, stage, name, text) {
  let next = text;
  for (const rule of table.retired) {
    if (rule.stage !== stage || !rule.swap || rule.skipped(name)) continue;
    const hits = phrases(rule, name, next).reverse();
    for (const hit of hits)
      for (let offset = hit.length - 1; offset >= 0; offset -= 1) {
        const token = hit[offset];
        if (token.word !== rule.words[offset]) continue;
        next = `${next.slice(0, token.start)}${cased(token.raw, rule.swap[offset])}${next.slice(token.end)}`;
      }
  }
  return next;
}

function rewrite(table, stage, name, text) {
  const guarded = shield(table, text);
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
  return guarded.restore(swapRetired(table, stage, name, next));
}

function apply(table, stage, repository) {
  const moved = table.moves
    .filter((entry) => entry.stage === stage)
    .filter((entry) => move(repository, entry.from, entry.to));
  const changed = [];
  for (const name of tracked(repository)) {
    if (table.skipped(name) || table.generated(name)) continue;
    const file = path.join(repository, name);
    const text = fs.readFileSync(file, "utf8");
    if (!isText(text)) continue;
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
  const glossary = require("./glossary.cjs");
  const raw = glossary.load(
    option("--table") ? path.resolve(option("--table")) : TABLE,
  );
  if (args.includes("--generate")) {
    glossary.generate(raw, repository);
    process.stdout.write("glossary and context map written\n");
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
  const problems = glossary.check(raw, repository, table.retired);
  for (const problem of problems) process.stdout.write(`${problem}\n`);
  process.stdout.write(found.size || problems.length ? "FAIL\n" : "PASS\n");
  process.exitCode = found.size || problems.length ? 1 : 0;
}

module.exports = {
  load,
  scan,
  scanSnapshot,
  apply,
  rewrite,
  sync,
  phrases,
  tracked,
  isText,
  TABLE,
};

if (require.main === module) main(process.argv.slice(2));
