const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  ReleaseError,
  changelogEntry,
  digest,
  firstLine,
  isSemver,
  manifest,
} = require("./release-data.cjs");

const SCRIPT = path.join(__dirname, "release-data.cjs");
const CHANGELOG = `# Changelog

## [0.2.0] - 2026-12-01

- Second release line
- More

## [0.1.0] - 2026-11-30

First release for friends.

- The app checks quietly.
`;
const COMMIT = "a".repeat(40);
const SHA = "b".repeat(64);
const URL = "https://example.test/voyagershell-linux-x86_64.tar.gz";

test("plain semver only", () => {
  assert.ok(isSemver("0.1.0"));
  assert.ok(isSemver("10.20.30"));
  for (const bad of ["v0.1.0", "0.1", "0.1.0-rc1", "01.1.0", "0.1.0.1", ""]) {
    assert.ok(!isSemver(bad), bad);
  }
});

test("a changelog entry runs to the next heading", () => {
  const entry = changelogEntry(CHANGELOG, "0.1.0");
  assert.strictEqual(entry.date, "2026-11-30");
  assert.strictEqual(
    entry.body,
    "First release for friends.\n\n- The app checks quietly.",
  );
  assert.strictEqual(
    changelogEntry(CHANGELOG, "0.2.0").body,
    "- Second release line\n- More",
  );
});

test("a missing, undated or empty entry is refused with its reason", () => {
  assert.throws(
    () => changelogEntry(CHANGELOG, "0.3.0"),
    /no "## \[0.3.0\] - YYYY-MM-DD" entry/,
  );
  assert.throws(
    () => changelogEntry("## [0.1.0] - soon\nx\n", "0.1.0"),
    /needs a YYYY-MM-DD date/,
  );
  assert.throws(
    () =>
      changelogEntry(
        "## [0.1.0] - 2026-11-30\n\n## [0.0.9] - 2026-11-01\nx\n",
        "0.1.0",
      ),
    /is empty/,
  );
  assert.throws(() => changelogEntry(CHANGELOG, "v0.1.0"), ReleaseError);
});

test("a version heading that only starts with the version is not its entry", () => {
  assert.throws(
    () => changelogEntry("## [0.1.01] - 2026-11-30\nx\n", "0.1.0"),
    /no "## \[0.1.0\]/,
  );
  assert.throws(
    () => changelogEntry("## [0.1.0-rc1] - 2026-11-30\nx\n", "0.1.0"),
    /no "## \[0.1.0\]/,
  );
});

test("the note is the first line of the entry without its bullet", () => {
  assert.strictEqual(firstLine("First release.\n\n- more"), "First release.");
  assert.strictEqual(firstLine("\n- Quiet updates\n- more"), "Quiet updates");
  assert.strictEqual(firstLine("### Changed\n- Stored shape"), "Stored shape");
});

test("the manifest has the shape the installer and the app read", () => {
  assert.deepStrictEqual(
    manifest({
      version: "0.1.0",
      commit: COMMIT,
      coreMin: "0.1.18",
      notes: "First release.",
      url: URL,
      sha256: SHA,
    }),
    {
      version: "0.1.0",
      commit: COMMIT,
      core_min: "0.1.18",
      notes: "First release.",
      targets: { "linux-x86_64": { url: URL, sha256: SHA } },
    },
  );
});

test("a manifest field that is malformed is refused", () => {
  const good = {
    version: "0.1.0",
    commit: COMMIT,
    coreMin: "0.1.18",
    notes: "n",
    url: URL,
    sha256: SHA,
  };
  for (const bad of [
    { version: "v0.1.0" },
    { commit: "abc" },
    { coreMin: "0.1" },
    { sha256: "B".repeat(64) },
    { url: "http://example.test/a.tar.gz" },
  ]) {
    assert.throws(() => manifest({ ...good, ...bad }), ReleaseError);
  }
});

test("the manifest command hashes the archive it is given", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-data-"));
  try {
    const archive = path.join(directory, "a.tar.gz");
    fs.writeFileSync(archive, "archive bytes");
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "manifest",
        "--version",
        "0.1.0",
        "--commit",
        COMMIT,
        "--url",
        URL,
        "--archive",
        archive,
      ],
      { encoding: "utf8" },
    );
    const document = JSON.parse(result.stdout);
    assert.strictEqual(
      document.targets["linux-x86_64"].sha256,
      digest(archive),
    );
    assert.strictEqual(document.core_min, "0.1.18");
    assert.strictEqual(document.version, "0.1.0");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("the entry command exits 1 and names the reason for an absent entry", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "entry", "9.9.9"], {
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /no "## \[9.9.9\] - YYYY-MM-DD" entry/);
});

test("core_min in the manifest is read from distribution/core-version", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-data-"));
  try {
    const copy = path.join(directory, "scripts", "release-data.cjs");
    fs.mkdirSync(path.dirname(copy));
    fs.copyFileSync(SCRIPT, copy);
    fs.mkdirSync(path.join(directory, "distribution"));
    fs.writeFileSync(
      path.join(directory, "distribution", "core-version"),
      "0.1.19\n",
    );
    fs.writeFileSync(path.join(directory, "CHANGELOG.md"), CHANGELOG);
    const archive = path.join(directory, "a.tar.gz");
    fs.writeFileSync(archive, "archive bytes");
    const result = spawnSync(
      process.execPath,
      [
        copy,
        "manifest",
        "--version",
        "0.1.0",
        "--commit",
        COMMIT,
        "--url",
        URL,
        "--archive",
        archive,
      ],
      { encoding: "utf8" },
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).core_min, "0.1.19");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
