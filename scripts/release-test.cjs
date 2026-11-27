const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const SCRIPTS = __dirname;
const CRATES = ["app", "contract", "desktop"];
const CHANGELOG = `# Changelog

## [0.2.0] - 2026-12-01

- Second

## [0.1.0] - 2026-11-30

- First
`;
const CRATE = `[package]
name = "crate"
version = "0.1.0"

[dependencies]
serde = { version = "1" }
`;
const GH = `#!/bin/sh
echo "gh $*" >> "$FAKE_LOG"
case "$1 $2" in
  "run list") echo "$FAKE_GH_RUN" ;;
  "run watch") exit "\${FAKE_GH_WATCH:-0}" ;;
esac
exit 0
`;
const NPM = `#!/bin/sh
echo "npm $*" >> "$FAKE_LOG"
[ "$1 $2" = "run ci:local" ] && exit "\${FAKE_CI:-0}"
exit 0
`;
const CARGO = `#!/bin/sh
echo "cargo $*" >> "$FAKE_LOG"
exit 0
`;

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.strictEqual(
    result.error,
    undefined,
    `${command} ${args.join(" ")}: ${result.error}`,
  );
  return result;
}

function git(directory, ...args) {
  const result = run("git", args, { cwd: directory, env: gitEnv() });
  assert.strictEqual(
    result.status,
    0,
    `git ${args.join(" ")}: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function gitEnv(extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: os.tmpdir(),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.test",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.test",
    ...extra,
  };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-test-"));
  const origin = path.join(root, "origin.git");
  const work = path.join(root, "work");
  const bin = path.join(root, "bin");
  const log = path.join(root, "calls.log");
  fs.mkdirSync(bin);
  for (const [name, text] of [
    ["gh", GH],
    ["npm", NPM],
    ["cargo", CARGO],
  ]) {
    write(path.join(bin, name), text);
    fs.chmodSync(path.join(bin, name), 0o755);
  }
  fs.writeFileSync(log, "");
  run("git", ["init", "--bare", "--initial-branch=main", origin]);
  run("git", ["init", "--initial-branch=main", work]);
  fs.copyFileSync(
    path.join(SCRIPTS, "release"),
    path.join(work, "scripts-release"),
  );
  fs.mkdirSync(path.join(work, "scripts"));
  fs.renameSync(
    path.join(work, "scripts-release"),
    path.join(work, "scripts", "release"),
  );
  fs.chmodSync(path.join(work, "scripts", "release"), 0o755);
  fs.copyFileSync(
    path.join(SCRIPTS, "release-data.cjs"),
    path.join(work, "scripts", "release-data.cjs"),
  );
  write(path.join(work, "CHANGELOG.md"), CHANGELOG);
  write(path.join(work, "distribution", "core-version"), "0.1.18\n");
  for (const crate of CRATES) {
    write(path.join(work, crate, "Cargo.toml"), CRATE);
  }
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "Start");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  return {
    root,
    origin,
    work,
    log,
    calls: () => fs.readFileSync(log, "utf8"),
    release(args, env = {}) {
      return run(path.join(work, "scripts", "release"), args, {
        cwd: work,
        env: gitEnv({
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_LOG: log,
          RELEASE_POLL_SECONDS: "0",
          ...env,
        }),
      });
    },
    originTags: () => git(origin, "tag", "--list"),
    originBranches: () => git(origin, "branch", "--list"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function withFixture(body) {
  const f = fixture();
  try {
    body(f);
  } finally {
    f.cleanup();
  }
}

function version(f, crate) {
  return fs
    .readFileSync(path.join(f.work, crate, "Cargo.toml"), "utf8")
    .match(/^version = "(.*)"/m)[1];
}

function refuses(f, args, pattern, env) {
  const result = f.release(args, env);
  assert.strictEqual(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
  assert.strictEqual(f.originTags(), "", "no tag reached origin");
  assert.strictEqual(git(f.work, "tag", "--list"), "", "no local tag");
  assert.doesNotMatch(f.calls(), /pr create/);
  return result;
}

test("prepare refuses what it must before it touches the tree", () => {
  withFixture((f) => {
    refuses(f, ["prepare", "v0.2.0"], /not a plain version/);
    refuses(f, ["prepare", "0.3.0"], /no "## \[0.3.0\] - YYYY-MM-DD" entry/);
    write(path.join(f.work, "dirty.txt"), "x");
    refuses(f, ["prepare", "0.2.0"], /working tree must be clean/);
    fs.rmSync(path.join(f.work, "dirty.txt"));
    git(f.work, "commit", "-q", "--allow-empty", "-m", "Ahead");
    refuses(f, ["prepare", "0.2.0"], /not at origin\/main/);
    git(f.work, "reset", "-q", "--hard", "origin/main");
    assert.strictEqual(git(f.work, "branch", "--list", "release/*"), "");
  });
});

test("prepare refuses a tag that already exists", () => {
  withFixture((f) => {
    git(f.work, "tag", "v0.2.0");
    const result = f.release(["prepare", "0.2.0"]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /v0.2.0 already exists/);
    assert.strictEqual(git(f.work, "branch", "--list", "release/*"), "");
  });
});

test("prepare of the version the crates already read has nothing to do", () => {
  withFixture((f) => {
    const result = f.release(["prepare", "0.1.0"]);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /nothing to prepare/);
    assert.strictEqual(git(f.work, "branch", "--list", "release/*"), "");
    assert.strictEqual(f.calls(), "");
  });
});

test("prepare sets the versions, checks, commits on a release branch and opens a PR, never a tag", () => {
  withFixture((f) => {
    const result = f.release(["prepare", "0.2.0"]);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(
      git(f.work, "branch", "--show-current"),
      "release/0.2.0",
    );
    assert.strictEqual(
      git(f.work, "log", "-1", "--format=%s"),
      "Release 0.2.0",
    );
    for (const crate of CRATES) {
      assert.strictEqual(version(f, crate), "0.2.0");
      assert.match(
        fs.readFileSync(path.join(f.work, crate, "Cargo.toml"), "utf8"),
        /serde = \{ version = "1" \}/,
      );
    }
    const calls = f.calls();
    assert.match(calls, /npm run ci:local/);
    assert.match(calls, /npm run contract:generate/);
    assert.match(
      calls,
      /gh pr create --base main --head release\/0.2.0 --title Release 0.2.0/,
    );
    assert.match(f.originBranches(), /release\/0.2.0/);
    assert.strictEqual(f.originTags(), "");
    assert.strictEqual(git(f.work, "tag", "--list"), "");
    assert.match(result.stdout, /No earlier release tag/);
  });
});

test("a failing ci:local opens no PR", () => {
  withFixture((f) => {
    const result = f.release(["prepare", "0.2.0"], { FAKE_CI: "1" });
    assert.notStrictEqual(result.status, 0);
    assert.doesNotMatch(f.calls(), /pr create/);
    assert.strictEqual(f.originBranches().includes("release/0.2.0"), false);
    assert.strictEqual(f.originTags(), "");
  });
});

test("publish refuses a checkout that is not the version on origin/main", () => {
  withFixture((f) => {
    refuses(f, ["publish", "0.2.0"], /says 0.1.0, not 0.2.0/, {
      FAKE_GH_RUN: "7",
    });
    git(f.work, "commit", "-q", "--allow-empty", "-m", "Ahead");
    refuses(f, ["publish", "0.1.0"], /not at origin\/main/, {
      FAKE_GH_RUN: "7",
    });
    git(f.work, "reset", "-q", "--hard", "origin/main");
    write(path.join(f.work, "dirty.txt"), "x");
    refuses(f, ["publish", "0.1.0"], /working tree must be clean/, {
      FAKE_GH_RUN: "7",
    });
    assert.doesNotMatch(f.calls(), /run watch/);
  });
});

test("publish with red checks says nothing published and tags nothing", () => {
  withFixture((f) => {
    refuses(f, ["publish", "0.1.0"], /checks failed on .*nothing published/, {
      FAKE_GH_RUN: "7",
      FAKE_GH_WATCH: "1",
    });
    assert.match(f.calls(), /gh run watch 7 --exit-status/);
  });
});

test("publish with no checks run for the commit tags nothing", () => {
  withFixture((f) => {
    refuses(f, ["publish", "0.1.0"], /no checks run for .*nothing published/, {
      FAKE_GH_RUN: "",
    });
  });
});

test("publish finds the checks run for the exact commit and tags it on green", () => {
  withFixture((f) => {
    const sha = git(f.work, "rev-parse", "HEAD");
    const result = f.release(["publish", "0.1.0"], { FAKE_GH_RUN: "7" });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(
      f.calls(),
      new RegExp(`run list --workflow checks --event push --commit ${sha}`),
    );
    assert.strictEqual(f.originTags(), "v0.1.0");
    assert.strictEqual(git(f.origin, "rev-parse", "v0.1.0^{commit}"), sha);
  });
});
