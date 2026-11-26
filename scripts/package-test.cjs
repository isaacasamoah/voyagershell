const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const PACKAGE = path.join(__dirname, "package");
const NOTICES = [
  "desktop/canvas/icons-LICENSE.txt",
  "desktop/canvas/icons-NOTICE.txt",
  "app/models/LICENSE-silero-vad",
];

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-test-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  for (const name of ["voyager-shell", "voyager"]) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho ${name}\n`, {
      mode: 0o755,
    });
  }
  return { root, bin, out: path.join(root, "out") };
}

function pack(w) {
  return spawnSync(PACKAGE, [w.bin, w.out], { encoding: "utf8" });
}

function listing(archive) {
  return spawnSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .stdout.trim()
    .split("\n")
    .sort();
}

test("the archive is one folder with both executables, the license and the notices", () => {
  const w = workspace();
  try {
    const result = pack(w);
    assert.strictEqual(result.status, 0, result.stderr);
    const archive = path.join(w.out, "voyagershell-linux-x86_64.tar.gz");
    assert.deepStrictEqual(
      listing(archive),
      [
        "voyagershell/",
        "voyagershell/LICENSE",
        "voyagershell/notices/",
        ...NOTICES.map((file) => `voyagershell/notices/${path.basename(file)}`),
        "voyagershell/voyager",
        "voyagershell/voyager-shell",
      ].sort(),
    );
    assert.match(
      result.stdout,
      /package: .*voyagershell-linux-x86_64.tar.gz \([0-9a-f]{64}\)/,
    );
    const packed = spawnSync("tar", ["-xOzf", archive, "voyagershell/LICENSE"]);
    assert.ok(
      packed.stdout.equals(fs.readFileSync(path.join(ROOT, "LICENSE"))),
    );
  } finally {
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});

test("a missing executable is refused and no archive is written", () => {
  const w = workspace();
  try {
    fs.rmSync(path.join(w.bin, "voyager"));
    const result = pack(w);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /voyager is missing or not executable/);
    assert.ok(!fs.existsSync(w.out));
  } finally {
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});

test("every notice named by the packer exists in the tree", () => {
  for (const file of ["LICENSE", ...NOTICES]) {
    assert.ok(fs.statSync(path.join(ROOT, file)).size > 0, file);
  }
  const text = fs.readFileSync(PACKAGE, "utf8");
  for (const file of NOTICES) {
    assert.ok(text.includes(file), `${file} is packed`);
  }
});

test("every packed file is compared to the tree and a mismatch fails the pack", () => {
  const entries = [
    "voyagershell/LICENSE",
    ...NOTICES.map((file) => `voyagershell/notices/${path.basename(file)}`),
    "voyagershell/voyager",
    "voyagershell/voyager-shell",
  ];
  const w = workspace();
  try {
    const real = spawnSync("sh", ["-c", "command -v tar"], {
      encoding: "utf8",
    }).stdout.trim();
    const shim = path.join(w.root, "shim");
    fs.mkdirSync(shim);
    fs.writeFileSync(
      path.join(shim, "tar"),
      `#!/bin/sh\nif [ "$1" = -xOf ] && [ "$3" = "$TAMPER" ]; then echo tampered; exit 0; fi\nexec ${real} "$@"\n`,
      { mode: 0o755 },
    );
    for (const entry of entries) {
      const result = spawnSync(PACKAGE, [w.bin, w.out], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${shim}:${process.env.PATH}`,
          TAMPER: entry,
        },
      });
      assert.notStrictEqual(result.status, 0, `${entry} is not compared`);
      assert.match(result.stdout + result.stderr, /differ/, entry);
    }
    const clean = spawnSync(PACKAGE, [w.bin, w.out], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, TAMPER: "" },
    });
    assert.strictEqual(clean.status, 0, clean.stderr);
  } finally {
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});
