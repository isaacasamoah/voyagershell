const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { digest, manifest } = require("./release-data.cjs");

const INSTALL = path.join(__dirname, "..", "distribution", "install.sh");
const COMMIT = "c".repeat(40);

function write(file, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
}

function build(
  version,
  banner = `voyager-shell ${version}\ncore: 0.1.18\nassets: embedded\n`,
) {
  return {
    "voyager-shell": `#!/bin/sh\nprintf '%s' '${banner.replace(/\n/g, "\\n")}' | sed 's/\\\\n/\\n/g'\n`,
    voyager: "#!/bin/sh\necho voyager\n",
  };
}

function release(
  directory,
  version,
  { banner, corrupt = false, coreMin = "0.1.18" } = {},
) {
  const staging = path.join(directory, "staging", "voyagershell");
  fs.rmSync(path.join(directory, "staging"), { recursive: true, force: true });
  for (const [name, text] of Object.entries(build(version, banner))) {
    write(path.join(staging, name), text, 0o755);
  }
  write(path.join(staging, "LICENSE"), "license\n");
  const archive = path.join(
    directory,
    "site",
    `voyagershell-${version}.tar.gz`,
  );
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  const packed = spawnSync("tar", [
    "-czf",
    archive,
    "-C",
    path.join(directory, "staging"),
    "voyagershell",
  ]);
  assert.strictEqual(packed.status, 0);
  const sha256 = corrupt ? "0".repeat(64) : digest(archive);
  const document = manifest({
    version,
    commit: COMMIT,
    coreMin,
    notes: "A note with spaces",
    url: `https://stand-in.test/${path.basename(archive)}`,
    sha256,
  });
  document.targets["linux-x86_64"].url = `file://${archive}`;
  write(
    path.join(directory, "site", "latest.json"),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "install-test-"));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  const base = [
    "curl",
    "tar",
    "sh",
    "sed",
    "tr",
    "awk",
    "mktemp",
    "mv",
    "ln",
    "rm",
    "mkdir",
    "cat",
    "cut",
    "sha256sum",
    "uname",
    "readlink",
    "printf",
    "head",
    "dirname",
    "basename",
    "env",
    "gzip",
  ];
  for (const name of base) {
    const found = spawnSync("sh", ["-c", `command -v ${name}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (found && !found.startsWith("shell") && path.isAbsolute(found)) {
      fs.symlinkSync(found, path.join(bin, name));
    }
  }
  return {
    root,
    home,
    bin,
    data: path.join(home, ".local", "share"),
    install(env = {}) {
      return spawnSync("/bin/sh", [INSTALL], {
        encoding: "utf8",
        env: {
          PATH: `${path.join(home, ".local", "bin")}:${bin}`,
          HOME: home,
          VOYAGER_RELEASES_URL: `file://${path.join(root, "site")}`,
          HERDR_RELEASES_URL: `file://${path.join(root, "herdr")}`,
          ...env,
        },
      });
    },
    fakeHc(version) {
      write(path.join(bin, "hc"), `#!/bin/sh\necho "hc ${version}"\n`, 0o755);
    },
    herdrInstaller(marker) {
      write(
        path.join(root, "herdr", "core", "install.sh"),
        `#!/bin/sh\necho installed > "${marker}"\n`,
      );
    },
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

test("a first install lays out the build, current, the link, start.json and the launcher entry", () => {
  withFixture((f) => {
    release(f.root, "0.1.0");
    f.fakeHc("0.1.21");
    const result = f.install();
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    const install = path.join(f.data, "voyagershell");
    assert.ok(
      fs.existsSync(path.join(install, "builds", "0.1.0", "voyager-shell")),
    );
    assert.ok(fs.existsSync(path.join(install, "builds", "0.1.0", "LICENSE")));
    assert.strictEqual(
      fs.readlinkSync(path.join(install, "current")),
      "builds/0.1.0",
    );
    assert.strictEqual(
      fs.readlinkSync(path.join(f.home, ".local", "bin", "voyager")),
      path.join(install, "current", "voyager"),
    );
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(install, "start.json"), "utf8")),
      {
        profile: path.join(f.data, "voyagershell-profile"),
        session: "voyager-daily",
      },
    );
    const entry = fs.readFileSync(
      path.join(f.data, "applications", "voyagershell.desktop"),
      "utf8",
    );
    assert.match(
      entry,
      new RegExp(`Exec=${path.join(f.home, ".local", "bin", "voyager")} start`),
    );
    assert.deepStrictEqual(
      fs.readdirSync(path.join(install, "builds")),
      ["0.1.0"],
      "no .part left behind",
    );
  });
});

test("a checksum mismatch installs nothing", () => {
  withFixture((f) => {
    release(f.root, "0.1.0", { corrupt: true });
    f.fakeHc("0.1.21");
    const result = f.install();
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /checksum mismatch/);
    assert.ok(!fs.existsSync(path.join(f.data, "voyagershell", "current")));
    assert.ok(
      !fs.existsSync(path.join(f.data, "voyagershell", "builds", "0.1.0")),
    );
    assert.ok(!fs.existsSync(path.join(f.data, "voyagershell", "start.json")));
  });
});

test("a build that reports another version is refused and leaves no folder", () => {
  withFixture((f) => {
    release(f.root, "0.1.0", {
      banner: "voyager-shell 9.9.9\ncore: 0.1.18\nassets: embedded\n",
    });
    f.fakeHc("0.1.21");
    const result = f.install();
    assert.strictEqual(result.status, 1);
    assert.match(
      result.stderr,
      /the build says 9.9.9, the manifest says 0.1.0/,
    );
    assert.deepStrictEqual(
      fs.readdirSync(path.join(f.data, "voyagershell", "builds")),
      [],
    );
    assert.ok(!fs.existsSync(path.join(f.data, "voyagershell", "current")));
  });
});

test("running it again converges and keeps an edited start.json", () => {
  withFixture((f) => {
    release(f.root, "0.1.0");
    f.fakeHc("0.1.21");
    assert.strictEqual(f.install().status, 0);
    const start = path.join(f.data, "voyagershell", "start.json");
    fs.writeFileSync(
      start,
      '{"profile": "/mine", "session": "voyager-mine"}\n',
    );
    const again = f.install();
    assert.strictEqual(again.status, 0, again.stderr);
    assert.match(again.stdout, /already current/);
    assert.strictEqual(
      fs.readFileSync(start, "utf8"),
      '{"profile": "/mine", "session": "voyager-mine"}\n',
    );
    assert.deepStrictEqual(
      fs.readdirSync(path.join(f.data, "voyagershell", "builds")),
      ["0.1.0"],
    );
  });
});

test("a newer release on an existing install is staged as next and current stays", () => {
  withFixture((f) => {
    release(f.root, "0.1.0");
    f.fakeHc("0.1.21");
    assert.strictEqual(f.install().status, 0);
    release(f.root, "0.1.1");
    const result = f.install();
    assert.strictEqual(result.status, 0, result.stderr);
    const install = path.join(f.data, "voyagershell");
    assert.strictEqual(
      fs.readlinkSync(path.join(install, "current")),
      "builds/0.1.0",
    );
    assert.strictEqual(
      fs.readlinkSync(path.join(install, "next")),
      "builds/0.1.1",
    );
    assert.match(result.stdout, /staged/);
  });
});

test("Core is installed with its own installer only when none is found", () => {
  withFixture((f) => {
    release(f.root, "0.1.0");
    const marker = path.join(f.root, "core-installed");
    f.herdrInstaller(marker);
    const result = f.install();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(marker), "Core's installer ran");
  });
  withFixture((f) => {
    release(f.root, "0.1.0");
    const marker = path.join(f.root, "core-installed");
    f.herdrInstaller(marker);
    f.fakeHc("0.1.21");
    const result = f.install();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(
      !fs.existsSync(marker),
      "Core was found, so its installer did not run",
    );
  });
});

test("an older Core is left alone and the installer says so", () => {
  withFixture((f) => {
    release(f.root, "0.1.0", { coreMin: "0.1.18" });
    const marker = path.join(f.root, "core-installed");
    f.herdrInstaller(marker);
    f.fakeHc("0.1.9");
    const result = f.install();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /Herdr Core 0.1.9 is older than the 0.1.18 this build needs. It was left alone/,
    );
    assert.ok(!fs.existsSync(marker));
  });
});

test("a Core as new as core_min is not called old", () => {
  withFixture((f) => {
    release(f.root, "0.1.0", { coreMin: "0.1.18" });
    f.fakeHc("0.1.18");
    const result = f.install();
    assert.strictEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /older than/);
  });
});
