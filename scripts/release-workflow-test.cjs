const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const WORKFLOWS = path.join(__dirname, "..", ".github", "workflows");
const release = fs.readFileSync(path.join(WORKFLOWS, "release.yml"), "utf8");
const checks = fs.readFileSync(path.join(WORKFLOWS, "checks.yml"), "utf8");

function setting(text, name) {
  return new RegExp(`^  ${name}: (.+)$`, "m").exec(text)?.[1];
}

function job(text, name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  assert.notStrictEqual(start, -1, `job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test("the release build uses the toolchain and Zig that checks uses", () => {
  for (const name of ["RUST_TOOLCHAIN", "ZIG_VERSION"]) {
    assert.ok(setting(release, name), name);
    assert.strictEqual(setting(release, name), setting(checks, name), name);
  }
  assert.ok(release.includes("xargs -a .github/native-apt-packages.txt"));
  assert.ok(release.includes("python3 desktop/prepare-sdk.py"));
});

test("a tag push or a manual run starts it, and nothing else", () => {
  const on = /^on:\n([\s\S]*?)\n\n/m.exec(release)[1];
  assert.strictEqual(on, '  push:\n    tags: ["v*"]\n  workflow_dispatch:');
});

test("a run is never cancelled", () => {
  assert.match(
    release,
    /concurrency:\n {2}group: release-\$\{\{ github.ref \}\}\n {2}cancel-in-progress: false/,
  );
});

test("the build runs on Ubuntu 22.04 and builds the release the way the marker needs", () => {
  const build = job(release, "build");
  assert.match(build, /runs-on: ubuntu-22.04\n/);
  assert.match(build, /VOYAGER_RELEASE: "1"/);
  assert.match(build, /cargo build --release --locked /);
  assert.match(build, /--bin voyager-shell --bin voyager/);
  assert.match(build, /target\/release\/voyager-shell --version/);
  assert.match(build, /Version matches the tag/);
});

test("publish needs the build and the checks, runs in the release environment and only for a tag push", () => {
  const publish = job(release, "publish");
  assert.match(publish, /needs: \[build, ci-passed\]/);
  assert.match(publish, /environment: release\n/);
  assert.match(
    publish,
    /if: github.event_name == 'push' && github.ref_type == 'tag'/,
  );
  assert.match(publish, /contents: write/);
  const others = release.replace(publish, "");
  assert.doesNotMatch(others, /contents: write/);
});

test("the release is not visible until latest.json is uploaded last", () => {
  const publish = job(release, "publish");
  const create = publish.indexOf("gh release create");
  const upload = publish.indexOf("gh release upload");
  const open = publish.indexOf("--draft=false");
  assert.ok(create !== -1 && create < upload && upload < open);
  assert.match(publish.slice(create, upload), /--draft/);
  assert.match(
    publish.slice(create, upload),
    /voyagershell-linux-x86_64.tar.gz dist\/install.sh/,
  );
  assert.ok(!publish.slice(create, upload).includes("latest.json"));
  assert.match(publish.slice(upload, open), /dist\/latest.json/);
});

test("the checks wait polls checks.yml for the tagged commit and keeps waiting through a cancel", () => {
  const wait = job(release, "ci-passed");
  assert.match(
    wait,
    /workflows\/checks.yml\/runs\?head_sha=\$GITHUB_SHA&event=push/,
  );
  assert.match(wait, /"completed success "\*\) exit 0/);
  assert.match(wait, /"completed cancelled "\*\) echo/);
  assert.match(wait, /completed\*\) exit 1/);
});

test("every action is pinned to a commit and no secret is read", () => {
  for (const line of release
    .split("\n")
    .filter((entry) => entry.includes("uses:"))) {
    assert.match(line, /uses: [\w./-]+@[0-9a-f]{40} # /, line);
  }
  assert.doesNotMatch(release, /secrets\./);
  assert.doesNotMatch(release, /triggering_actor/);
});

test("a manual run on a branch builds and uploads an artifact but cannot publish", () => {
  const build = job(release, "build");
  assert.doesNotMatch(build, /if: github.event_name/);
  assert.match(build, /upload-artifact/);
  assert.match(build, /name: voyagershell-dist/);
  assert.doesNotMatch(build, /gh release/);
});
