const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { before, after, afterEach } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const GATE = path.join(__dirname, "gate.cjs");
const KNOWN = path.join(__dirname, "known-violations.yaml");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("HC_")),
);

const RUNS = "architecture-gate-test-";
const ALIVE = "alive.sock";

function abandoned(directory) {
  return new Promise((resolve) => {
    const probe = net.connect(path.join(directory, ALIVE));
    probe.once("connect", () => {
      probe.destroy();
      resolve(false);
    });
    probe.once("error", (error) => resolve(error.code === "ECONNREFUSED"));
  });
}

const RUN = fs.mkdtempSync(path.join(os.tmpdir(), RUNS));
ENV.TMPDIR = RUN;
const alive = net.createServer().listen(path.join(RUN, ALIVE));
alive.unref();
after(() => {
  alive.close();
  fs.rmSync(RUN, { recursive: true, force: true });
});

before(async () => {
  for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    const directory = path.join(os.tmpdir(), entry.name);
    if (
      !entry.name.startsWith(RUNS) ||
      !entry.isDirectory() ||
      directory === RUN ||
      !(await abandoned(directory))
    )
      continue;
    try {
      for (const name of fs.readdirSync(directory))
        if (name !== ALIVE)
          fs.rmSync(path.join(directory, name), {
            recursive: true,
            force: true,
          });
      fs.rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Skipped stale ${directory}: ${error.message}`);
    }
  }
});

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function folder(prefix) {
  const directory = fs.mkdtempSync(path.join(RUN, prefix));
  temporary.push(directory);
  return directory;
}

function scratch() {
  const directory = folder("architecture-gate-");
  const files = execFileSync(
    "git",
    ["-C", ROOT, "ls-files", "-co", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    if (!fs.lstatSync(path.join(ROOT, file)).isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  execFileSync("git", ["init", "-q"], { cwd: directory });
  return directory;
}

function run(directory, extra = []) {
  const result = spawnSync(
    "node",
    [GATE, "--repository", directory, ...extra],
    { encoding: "utf8", env: ENV },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function edit(directory, file, change) {
  const target = path.join(directory, file);
  fs.writeFileSync(target, change(fs.readFileSync(target, "utf8")));
}

function without(pattern) {
  const kept = fs
    .readFileSync(KNOWN, "utf8")
    .split("\n  - id: ")
    .filter((entry) => !pattern.test(entry));
  const file = path.join(folder("architecture-known-"), "known.yaml");
  fs.writeFileSync(file, kept.join("\n  - id: "));
  return file;
}

function expectFailure(result, ...named) {
  assert.strictEqual(result.status, 1, result.out + result.err);
  for (const text of named)
    assert.ok(result.out.includes(text), `${text} missing from\n${result.out}`);
}

module.exports = {
  ROOT,
  GATE,
  KNOWN,
  ENV,
  scratch,
  folder,
  run,
  edit,
  without,
  expectFailure,
};
