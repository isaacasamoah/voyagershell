const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { scratch, run, edit, expectFailure } = require("./fixture.cjs");

const STUB =
  "pub(crate) mod inner { pub(crate) fn probe() {} }\npub(crate) fn probe() {}\n";
const FAMILY_FILES = {
  worktree: "app/src/families/worktree.rs",
  content: "app/src/families/content.rs",
  structure: "app/src/families/structure.rs",
  terminal: "app/src/families/terminal.rs",
  lifecycle: "app/src/families/terminal/lifecycle.rs",
};
const PROBE = (call) => `\npub(crate) fn planted_probe() {\n    ${call};\n}\n`;

const VOCABULARY = "tests/architecture/vocabulary.yaml";

function prepared() {
  const directory = scratch();
  const root = "app/src/families.rs";
  for (const name of ["worktree", "content", "structure"])
    fs.writeFileSync(path.join(directory, FAMILY_FILES[name]), STUB);
  edit(
    directory,
    root,
    (text) =>
      `${text}pub(crate) mod worktree;\npub(crate) mod content;\npub(crate) mod structure;\n`,
  );
  edit(directory, VOCABULARY, (text) =>
    text.replace(
      "owns: [app/src/workspace.rs,",
      "owns: [app/src/families/worktree.rs, app/src/families/content.rs, app/src/families/structure.rs, app/src/workspace.rs,",
    ),
  );
  return { directory, root };
}

function inScratch(directory) {
  const own = (name) => path.join(directory, "tests/architecture", name);
  return run(directory, [
    "--rules",
    own("rules.yaml"),
    "--known",
    own("known-violations.yaml"),
    "--intended",
    own("intended.yaml"),
  ]);
}

const RULES = [
  "families-stay-apart",
  "families-not-aliased",
  "families-reach-shared-only",
  "families-no-widened-visibility",
];
const FAMILY_LINE = new RegExp(`^(NEW|STALE) (${RULES.join("|")})[: ]`);

function assertClean(result) {
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /PASS\n$/);
  assert.deepStrictEqual(
    result.out.split("\n").filter((line) => FAMILY_LINE.test(line)),
    [],
  );
}

let baseline;
function assertBaselineClean() {
  baseline ??= (() => {
    const { directory } = prepared();
    return inScratch(directory);
  })();
  assertClean(baseline);
}

function families(plant) {
  assertBaselineClean();
  const { directory, root } = prepared();
  const at = (file, change) => edit(directory, file, change);
  plant({
    directory,
    root,
    appendTo: (file, text) => at(file, (old) => old + text),
    prependTo: (file, text) => at(file, (old) => text + old),
    write: (file, text) => fs.writeFileSync(path.join(directory, file), text),
  });
  return inScratch(directory);
}

function newLines(result, rule) {
  return result.out
    .split("\n")
    .filter((line) => line.startsWith(`NEW ${rule}: `))
    .map((line) => line.replace(/ \(\S+:\d+\)$/, ""))
    .sort();
}

const FAMILIES = "rs:voyager_app::families";
const edge = (from, to) =>
  `NEW families-stay-apart: uses(${from === "" ? FAMILIES : `${FAMILIES}::${from}`},${to === "" ? FAMILIES : `${FAMILIES}::${to}`})`;

const CROSS = [
  [
    "use of a path in another family",
    (p) =>
      p.prependTo(
        FAMILY_FILES.worktree,
        "use crate::families::terminal::stop_summary as _planted;\n",
      ),
  ],
  [
    "grouped use naming another family",
    (p) =>
      p.prependTo(
        FAMILY_FILES.worktree,
        "use crate::families::{terminal::stop_summary as _s, content as _c};\n",
      ),
  ],
  [
    "glob use of another family",
    (p) =>
      p.prependTo(
        FAMILY_FILES.worktree,
        "#[allow(unused_imports)]\nuse crate::families::terminal::*;\n",
      ),
  ],
  [
    "use through super",
    (p) =>
      p.prependTo(
        FAMILY_FILES.worktree,
        "use super::terminal::stop_summary as _planted;\n",
      ),
  ],
  [
    "super path in an expression",
    (p) =>
      p.appendTo(
        FAMILY_FILES.worktree,
        PROBE('super::terminal::stop_summary("live")'),
      ),
  ],
  [
    "crate path in an expression",
    (p) =>
      p.appendTo(
        FAMILY_FILES.worktree,
        PROBE('crate::families::terminal::stop_summary("live")'),
      ),
  ],
  [
    "crate path into a submodule of another family",
    (p) =>
      p.appendTo(
        FAMILY_FILES.worktree,
        PROBE("crate::families::terminal::lifecycle::exited(&[])"),
      ),
  ],
  [
    "submodule reaching another family through super::super",
    (p) =>
      p.write(
        FAMILY_FILES.worktree,
        'pub(crate) mod inner { pub(crate) fn probe() { let _ = super::super::terminal::stop_summary("live"); } }\npub(crate) fn probe() {}\n',
      ),
  ],
  [
    "terminal family submodule using another family",
    (p) =>
      p.appendTo(
        FAMILY_FILES.lifecycle,
        PROBE("crate::families::content::probe()"),
      ),
  ],
  [
    "two non-terminal families",
    (p) => p.appendTo(FAMILY_FILES.content, PROBE("super::structure::probe()")),
  ],
  [
    "terminal family using another family",
    (p) => p.appendTo(FAMILY_FILES.terminal, PROBE("super::worktree::probe()")),
  ],
  [
    "root re-export of a family item used through super",
    (p) => {
      p.appendTo(p.root, "pub(crate) use terminal::stop_summary;\n");
      p.appendTo(FAMILY_FILES.worktree, PROBE('super::stop_summary("live")'));
    },
  ],
  [
    "root re-export of a family item used through crate",
    (p) => {
      p.appendTo(p.root, "pub(crate) use terminal::stop_summary;\n");
      p.appendTo(
        FAMILY_FILES.worktree,
        PROBE('crate::families::stop_summary("live")'),
      );
    },
  ],
  [
    "root re-export of a family item imported with use",
    (p) => {
      p.appendTo(p.root, "pub(crate) use terminal::stop_summary;\n");
      p.prependTo(
        FAMILY_FILES.worktree,
        "use crate::families::stop_summary as _planted;\n",
      );
    },
  ],
  [
    "root re-export of another family's item used by the terminal family",
    (p) => {
      p.appendTo(p.root, "pub(crate) use worktree::probe;\n");
      p.appendTo(FAMILY_FILES.terminal, PROBE("super::probe()"));
    },
  ],
  [
    "root glob re-export used through super",
    (p) => {
      p.appendTo(p.root, "pub(crate) use terminal::*;\n");
      p.appendTo(FAMILY_FILES.worktree, PROBE('super::stop_summary("live")'));
    },
  ],
  [
    "root re-export through self",
    (p) => {
      p.appendTo(p.root, "pub(crate) use self::terminal::stop_summary;\n");
      p.appendTo(FAMILY_FILES.worktree, PROBE('super::stop_summary("live")'));
    },
  ],
  [
    "glob use of the families root",
    (p) => {
      p.appendTo(p.root, "pub(crate) use terminal::stop_summary;\n");
      p.prependTo(
        FAMILY_FILES.worktree,
        "#[allow(unused_imports)]\nuse super::*;\n",
      );
    },
  ],
];

const EDGES = {
  "use of a path in another family": [["worktree", "terminal"]],
  "grouped use naming another family": [
    ["worktree", "content"],
    ["worktree", "terminal"],
  ],
  "glob use of another family": [["worktree", "terminal"]],
  "use through super": [["worktree", "terminal"]],
  "super path in an expression": [["worktree", "terminal"]],
  "crate path in an expression": [["worktree", "terminal"]],
  "crate path into a submodule of another family": [
    ["worktree", "terminal::lifecycle"],
  ],
  "submodule reaching another family through super::super": [
    ["worktree::inner", "terminal"],
  ],
  "terminal family submodule using another family": [
    ["terminal::lifecycle", "content"],
  ],
  "two non-terminal families": [["content", "structure"]],
  "terminal family using another family": [["terminal", "worktree"]],
};
const ROOT_EDGES = [
  ["", "terminal"],
  ["worktree", ""],
];
EDGES["root re-export of a family item used through super"] = ROOT_EDGES;
EDGES["root re-export of a family item used through crate"] = ROOT_EDGES;
EDGES["root re-export of a family item imported with use"] = ROOT_EDGES;
EDGES["root re-export of another family's item used by the terminal family"] = [
  ["", "worktree"],
  ["terminal", ""],
];
EDGES["root glob re-export used through super"] = ROOT_EDGES;
EDGES["root re-export through self"] = ROOT_EDGES;
EDGES["glob use of the families root"] = ROOT_EDGES;

for (const [name, plant] of CROSS) {
  test(`a family crossing fails with its exact edge: ${name}`, () => {
    const result = families(plant);
    expectFailure(result);
    assert.deepStrictEqual(
      newLines(result, "families-stay-apart"),
      EDGES[name].map(([from, to]) => edge(from, to)).sort(),
      result.out,
    );
  });
}

const OWN = [
  [
    "a submodule using its own family's parent",
    (p) => {
      p.appendTo(
        FAMILY_FILES.lifecycle,
        PROBE('crate::families::terminal::stop_summary("live")'),
      );
    },
  ],
  [
    "a family using its own inner module",
    (p) => p.appendTo(FAMILY_FILES.worktree, PROBE("inner::probe()")),
  ],
  [
    "a family using its own submodule through super",
    (p) => p.appendTo(FAMILY_FILES.terminal, PROBE("lifecycle::exited(&[])")),
  ],
];

for (const [name, plant] of OWN) {
  test(`a family staying inside itself passes: ${name}`, () => {
    const result = families(plant);
    if (name.startsWith("a submodule using its own family's parent")) {
      assert.deepStrictEqual(
        result.out.split("\n").filter((line) => /^(NEW|STALE) /.test(line)),
        [
          `NEW no-child-cycles: ${FAMILIES}::terminal <-> ${FAMILIES}::terminal::lifecycle`,
        ],
        result.out,
      );
      assert.deepStrictEqual(
        result.out.split("\n").filter((line) => FAMILY_LINE.test(line)),
        [],
      );
    } else assertClean(result);
  });
}

const SHARED_ALIAS = [
  "a crate root alias of a family",
  "families-not-aliased",
  `NEW families-not-aliased: uses(rs:voyager_app,${FAMILIES}::terminal)`,
  (p) => {
    p.appendTo(
      "app/src/lib.rs",
      "\npub(crate) use families::terminal as process;\n",
    );
    p.appendTo(
      FAMILY_FILES.worktree,
      PROBE('crate::process::stop_summary("live")'),
    );
  },
];
const ALIASES = [
  SHARED_ALIAS,
  [
    "a consumer alias of a family",
    "families-reach-shared-only",
    `NEW families-reach-shared-only: uses(${FAMILIES}::worktree,rs:voyager_app::front_door)`,
    (p) => {
      p.appendTo(
        "app/src/front_door.rs",
        "\npub(crate) use crate::families::terminal as process;\n",
      );
      p.appendTo(
        FAMILY_FILES.worktree,
        PROBE('crate::front_door::process::stop_summary("live")'),
      );
    },
  ],
  [
    "pub(super) in a family file",
    "families-no-widened-visibility",
    "NEW families-no-widened-visibility: pub(super in app/src/families/terminal.rs has 1 hits, over the limit of 0",
    (p) => p.appendTo(FAMILY_FILES.terminal, "\npub(super) fn widened() {}\n"),
  ],
  [
    "pub(in path) in a family file",
    "families-no-widened-visibility",
    "NEW families-no-widened-visibility: pub(in in app/src/families/content.rs has 1 hits, over the limit of 0",
    (p) =>
      p.appendTo(
        FAMILY_FILES.content,
        "\npub(in crate::families) fn widened() {}\n",
      ),
  ],
];

for (const [name, rule, exact, plant] of ALIASES) {
  test(`${name} fails with its exact rule and edge`, () => {
    const result = families(plant);
    expectFailure(result);
    const lines = newLines(result, rule).map((line) =>
      line.replace(/ \(\S+:\d+\)$/, ""),
    );
    assert.deepStrictEqual(
      lines.map((line) => line.replace(/ \(.*\)$/, "")).length,
      1,
      result.out,
    );
    assert.ok(lines.includes(exact), `${exact} missing from\n${result.out}`);
  });
}

function withoutRule(directory, id) {
  const file = path.join(directory, "tests/architecture/rules.yaml");
  const kept = fs
    .readFileSync(file, "utf8")
    .split("\n  - id: ")
    .filter((entry, index) => index === 0 || !entry.startsWith(id));
  fs.writeFileSync(file, kept.join("\n  - id: "));
}

for (const [name, rule, exact, plant] of [SHARED_ALIAS, ALIASES[2]]) {
  test(`${name} is silent once ${rule} is removed`, () => {
    assertBaselineClean();
    const { directory, root } = prepared();
    const at = (file, change) => edit(directory, file, change);
    plant({
      directory,
      root,
      appendTo: (file, text) => at(file, (old) => old + text),
      prependTo: (file, text) => at(file, (old) => text + old),
      write: (file, text) => fs.writeFileSync(path.join(directory, file), text),
    });
    withoutRule(directory, rule);
    const result = inScratch(directory);
    assert.ok(!result.out.includes(exact), result.out);
    assert.deepStrictEqual(newLines(result, rule), [], result.out);
  });
}
