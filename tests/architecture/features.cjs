const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parse, stringify } = require("./yaml.cjs");
const { parseTables } = require("./toml.cjs");
const { owners } = require("./owners.cjs");

const REGISTRY = "tests/native/features.toml";
const VOCABULARY = "tests/architecture/vocabulary.yaml";
const GROUPS = "architecture/atlas-features.yaml";
const MAP = "architecture/features.yaml";
const PAGE = "docs/features.md";
const JOURNEYS = "tests/native/src/journey.rs";
const PYTHON = "tests/native/proof_native_mod_host.py";
const VERIFY = ".agents/skills/verify/features";
const TIERS = ["behavior", "performance", "visual", "debug"];
const STATUS = new Set(["covered", "python-only", "none"]);
const FIELDS = [
  "id",
  "name",
  "path",
  "sources",
  "journeys",
  "platforms",
  "python",
  ...TIERS,
];
const RAN = /^journeys run:\s*(.*)$/gim;
const WORKFLOW = ".github/workflows/checks.yml";

class Missing extends Error {}

function read(repository, file) {
  const target = path.join(repository, file);
  if (!fs.existsSync(target))
    throw new Missing(
      `Missing input ${file}, restore it or run from a full checkout`,
    );
  return fs.readFileSync(target, "utf8");
}

function tracked(repository) {
  return execFileSync(
    "git",
    ["-C", repository, "ls-files", "-co", "--exclude-standard"],
    {
      encoding: "utf8",
    },
  )
    .split("\n")
    .filter(Boolean)
    .sort();
}

function matcher(pattern) {
  if (/[[\]{}]/.test(pattern))
    throw new Error(`Unsupported glob ${pattern}, use only * and **`);
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const rest = pattern.slice(i);
    if (rest.startsWith("**/")) {
      source += "(?:.*/)?";
      i += 2;
    } else if (rest.startsWith("**")) {
      source += ".*";
      i += 1;
    } else if (pattern[i] === "*") source += ".*";
    else if (pattern[i] === "?") source += ".";
    else source += pattern[i].replace(/[.+^$()|\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function loadRegistry(repository) {
  const rows = parseTables(read(repository, REGISTRY), "feature");
  const problems = [];
  const seen = new Set();
  for (const row of rows) {
    const id = row.id ?? "(no id)";
    for (const field of FIELDS)
      if (!(field in row)) problems.push(`${id}: ${REGISTRY} lacks ${field}`);
    for (const field of Object.keys(row))
      if (!FIELDS.includes(field))
        problems.push(`${id}: ${REGISTRY} has unknown field ${field}`);
    if (seen.has(row.id)) problems.push(`${id}: duplicate feature id`);
    seen.add(row.id);
    for (const tier of TIERS)
      if (tier in row && !STATUS.has(row[tier]))
        problems.push(
          `${id}: ${tier} is ${row[tier]}, use covered, python-only or none`,
        );
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return rows;
}

function loadGroups(repository) {
  const document = parse(read(repository, GROUPS)) ?? {};
  const groups = document.groups ?? [];
  const problems = [];
  const ids = new Set();
  for (const group of groups) {
    if (
      !group.id ||
      !group.name ||
      !group.plain ||
      !(group.features ?? []).length
    )
      problems.push(
        `${GROUPS}: a group needs id, name, plain and features, got ${JSON.stringify(group.id)}`,
      );
    if (ids.has(group.id))
      problems.push(`${GROUPS}: duplicate group ${group.id}`);
    ids.add(group.id);
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return { groups, checks: document.checks ?? [] };
}

function nativeJourneys(repository) {
  return new Set(
    [...read(repository, JOURNEYS).matchAll(/=> "([a-z0-9-]+)" in /g)].map(
      (m) => m[1],
    ),
  );
}

function pythonJourneys(repository) {
  const text = read(repository, PYTHON);
  const choices = text.split("choices=[")[1]?.split("]")[0];
  if (choices === undefined)
    throw new Error(`Python journey choices not found in ${PYTHON}`);
  return new Set(choices.split('"').filter((_, index) => index % 2));
}

function build(repository) {
  const rows = loadRegistry(repository);
  const { groups, checks } = loadGroups(repository);
  const workflow = read(repository, WORKFLOW);
  const runs = new Set(
    [...workflow.matchAll(/^\s*- run: (.+)$/gm)].map((m) => m[1].trim()),
  );
  const vocabulary = parse(read(repository, VOCABULARY));
  const contexts = vocabulary.contexts;
  const generated = (vocabulary.settings?.generated ?? []).map(matcher);
  const files = tracked(repository);
  const native = nativeJourneys(repository);
  const python = pythonJourneys(repository);
  const problems = [];
  for (const check of checks)
    if (!rows.some((row) => row.id === check.feature) || !check.run)
      problems.push(
        `${GROUPS}: a check needs a feature in ${REGISTRY} and a run, got ${JSON.stringify(check)}`,
      );

  const groupOf = new Map();
  for (const group of groups)
    for (const id of group.features) {
      if (groupOf.has(id))
        problems.push(
          `${id} is in groups ${groupOf.get(id)} and ${group.id} in ${GROUPS}`,
        );
      groupOf.set(id, group.id);
      if (!rows.some((row) => row.id === id))
        problems.push(
          `${GROUPS}: group ${group.id} lists ${id}, which is not in ${REGISTRY}`,
        );
    }

  const features = rows.map((row) => {
    const id = row.id;
    if (!groupOf.has(id))
      problems.push(`${id} is in no group, list it under a group in ${GROUPS}`);
    const code = [
      ...new Set(
        row.sources.flatMap((pattern) => {
          const found = files.filter((file) => matcher(pattern).test(file));
          if (!found.length) problems.push(`${id}: ${pattern} matches no file`);
          return found;
        }),
      ),
    ].sort();
    const count = new Map();
    for (const file of code.filter(
      (file) => !generated.some((m) => m.test(file)),
    ))
      for (const owner of owners(contexts, file))
        count.set(owner, (count.get(owner) ?? 0) + 1);
    const ranked = [...count].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    );
    if (!ranked.length)
      problems.push(
        `${id} has no owner, put one of its files under a context in ${VOCABULARY}`,
      );
    for (const journey of row.journeys)
      if (!native.has(journey))
        problems.push(
          `${id}: native journey ${journey} does not exist in ${JOURNEYS}`,
        );
    for (const journey of row.python)
      if (!python.has(journey))
        problems.push(
          `${id}: Python journey ${journey} does not exist in ${PYTHON}`,
        );
    const own = checks.filter((check) => check.feature === id);
    for (const check of own)
      if (!runs.has(check.run))
        problems.push(
          `${id}: check "${check.run}" is not a run step in ${WORKFLOW}`,
        );
    if (!row.journeys.length && !row.python.length && !own.length)
      problems.push(
        `${id} has no journey, name one in ${REGISTRY} or a CI check in ${GROUPS}`,
      );
    const proof = row.journeys.length
      ? "native"
      : row.python.length
        ? "python-only"
        : "ci-check";
    const docs = new Set();
    for (const [owner] of ranked) {
      const guide = contexts.find((context) => context.id === owner)?.guide;
      if (guide) docs.add(guide);
    }
    for (const file of code) if (/^docs\/.*\.md$/.test(file)) docs.add(file);
    const verify = `${VERIFY}/${id}.md`;
    if (files.includes(verify)) docs.add(verify);
    for (const doc of docs)
      if (!files.includes(doc))
        problems.push(`${id}: doc ${doc} does not exist`);
    const entry = {
      id,
      name: row.name,
      summary: row.path,
      group: groupOf.get(id),
      owner: ranked[0]?.[0],
    };
    if (ranked.length > 1)
      entry.shared_with = ranked.slice(1).map(([owner]) => owner);
    return {
      ...entry,
      proof,
      state: Object.fromEntries(TIERS.map((tier) => [tier, row[tier]])),
      platforms: row.platforms,
      checks: own.map((check) => check.run),
      native_journeys: row.journeys,
      python_journeys: row.python,
      docs: [...docs].sort(),
      sources: row.sources,
      code,
    };
  });
  if (problems.length) throw new Error([...new Set(problems)].join("\n"));
  return { features, groups };
}

function mapText(model) {
  return stringify({ features: model.features });
}

function pageText(model) {
  const link = (doc) => `[${doc}](${path.posix.relative("docs", doc)})`;
  const rows = model.features.map((feature) =>
    [
      feature.name,
      model.groups.find((group) => group.id === feature.group).name,
      feature.owner,
      feature.proof,
      feature.native_journeys.join(", ") || "-",
      feature.python_journeys.join(", ") || "-",
      feature.docs.map(link).join(", ") || "-",
    ].join(" | "),
  );
  return `# Feature map

Generated from \`${REGISTRY}\`, \`${GROUPS}\` and the context owners in \`${VOCABULARY}\` by \`npm run features:generate\`. Edit those inputs, then regenerate. The complete map with code paths and state is \`${MAP}\`.

\`proof\` is \`native\` when a native journey covers the feature, \`python-only\` when only a retained Python journey does, and \`ci-check\` when it has no journey and a CI step named in \`${GROUPS}\` is its proof.

## The change gate

On a pull request, \`npm run features:check -- --base <base>\` fails when a change touches a feature's source paths with no change to its map entry and no recorded run. Record the run by adding a line \`Journeys run: <journey>, <journey>\` to the PR description, then push a new commit, because editing the description does not rerun CI. Every such line counts. A feature needs all of its native journeys, or one Python journey when it has no native journey. Another way through is to change the feature's entry in \`${REGISTRY}\` and run \`npm run features:generate\`. A feature whose proof is a \`ci-check\` needs no record, because that CI step runs on the same pull request.

| Feature | Group | Owner | Proof | Native journeys | Python journeys | Docs |
| --- | --- | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${row} |`).join("\n")}
`;
}

function git(repository, args) {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function baseMap(repository, base) {
  try {
    return parse(git(repository, ["show", `${base}:${MAP}`])).features ?? null;
  } catch {
    return null;
  }
}

function recorded(argument, environment) {
  let text = argument ?? "";
  const event = environment.GITHUB_EVENT_PATH;
  if (!text && environment.GITHUB_EVENT_NAME === "pull_request" && event) {
    const body =
      JSON.parse(fs.readFileSync(event, "utf8")).pull_request?.body ?? "";
    text = [...body.matchAll(RAN)].map((m) => m[1]).join(",");
  }
  return new Set(text.split(/[\s,]+/).filter(Boolean));
}

function changedCode(repository, base, ran) {
  const previous = baseMap(repository, base);
  if (!previous)
    return { problems: [], note: `${base} has no ${MAP}, change gate skipped` };
  const head = parse(read(repository, MAP)).features;
  const changed = git(repository, ["diff", "--name-only", base, "HEAD"])
    .split("\n")
    .filter(Boolean);
  const before = new Map(
    previous.map((entry) => [entry.id, JSON.stringify(entry)]),
  );
  const problems = [];
  for (const feature of head) {
    const hit = changed.filter((file) =>
      feature.sources.some((pattern) => matcher(pattern).test(file)),
    );
    if (
      !hit.length ||
      feature.checks.length ||
      before.get(feature.id) !== JSON.stringify(feature)
    )
      continue;
    const named = feature.native_journeys.length
      ? feature.native_journeys
      : feature.python_journeys;
    const proved = feature.native_journeys.length
      ? named.every((journey) => ran.has(journey))
      : named.some((journey) => ran.has(journey));
    if (!proved)
      problems.push(
        `${feature.name} (${feature.id}) changed in ${hit.slice(0, 3).join(", ")} with no map change and no recorded run, add "Journeys run: ${named.join(", ")}" to the PR description and push again, or change its entry in ${REGISTRY} and run npm run features:generate`,
      );
  }
  return { problems, note: null };
}

function main(argv, environment = process.env) {
  const option = (name) => {
    const at = argv.indexOf(name);
    return at < 0 ? undefined : argv[at + 1];
  };
  const repository = path.resolve(
    option("--repository") ?? path.join(__dirname, "../.."),
  );
  const write = argv.includes("--write");
  const out = (text) => process.stdout.write(`${text}\n`);
  let model;
  try {
    model = build(repository);
  } catch (error) {
    out(`FAIL ${error.message}`);
    return 1;
  }
  const wanted = [
    [MAP, mapText(model)],
    [PAGE, pageText(model)],
  ];
  if (write) {
    for (const [file, text] of wanted)
      fs.writeFileSync(path.join(repository, file), text);
    out(`wrote ${MAP} and ${PAGE} for ${model.features.length} features`);
    return 0;
  }
  const problems = [];
  for (const [file, text] of wanted) {
    const target = path.join(repository, file);
    if (!fs.existsSync(target))
      problems.push(`${file} is missing, run npm run features:generate`);
    else if (fs.readFileSync(target, "utf8") !== text)
      problems.push(
        `${file} differs from its inputs${file === MAP ? drift(fs.readFileSync(target, "utf8"), model) : ""}, run npm run features:generate`,
      );
  }
  const base = option("--base");
  let note = null;
  if (base) {
    const result = changedCode(
      repository,
      base,
      recorded(option("--ran"), environment),
    );
    problems.push(...result.problems);
    note = result.note;
  }
  for (const problem of problems) out(`FAIL ${problem}`);
  if (note) out(note);
  out(
    problems.length
      ? "FAIL"
      : `PASS ${model.features.length} features, ${model.features.filter((f) => f.proof === "ci-check").length} proved by a CI check`,
  );
  return problems.length ? 1 : 0;
}

function drift(have, model) {
  let old;
  try {
    old = new Map(
      parse(have).features.map((entry) => [entry.id, JSON.stringify(entry)]),
    );
  } catch {
    return "";
  }
  const now = new Map(
    model.features.map((entry) => [entry.id, JSON.stringify(entry)]),
  );
  const names = [
    ...[...now].filter(([id, text]) => old.get(id) !== text).map(([id]) => id),
    ...[...old.keys()].filter((id) => !now.has(id)),
  ];
  return names.length ? ` for ${names.join(", ")}` : "";
}

module.exports = {
  build,
  mapText,
  pageText,
  matcher,
  main,
  MAP,
  PAGE,
  GROUPS,
  REGISTRY,
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
