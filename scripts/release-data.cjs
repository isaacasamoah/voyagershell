const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TARGET = "linux-x86_64";
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

class ReleaseError extends Error {}

function isSemver(version) {
  return SEMVER.test(version);
}

function changelogEntry(text, version) {
  if (!isSemver(version)) {
    throw new ReleaseError(`${version} is not a plain version like 0.1.5`);
  }
  const lines = text.split("\n");
  const heading = `## [${version}] - `;
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start === -1) {
    throw new ReleaseError(
      `CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" entry`,
    );
  }
  const date = lines[start].slice(heading.length).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ReleaseError(
      `the CHANGELOG.md entry for ${version} needs a YYYY-MM-DD date, not "${date}"`,
    );
  }
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end === -1) {
    end = lines.length;
  }
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  if (body === "") {
    throw new ReleaseError(`the CHANGELOG.md entry for ${version} is empty`);
  }
  return { date, body };
}

function firstLine(body) {
  const line = body
    .split("\n")
    .map((entry) => entry.replace(/^[-*]\s+/, "").trim())
    .find((entry) => entry !== "" && !entry.startsWith("#"));
  return line || "";
}

function manifest({ version, commit, coreMin, notes, url, sha256 }) {
  if (!isSemver(version)) {
    throw new ReleaseError(`version ${version} is not plain semver`);
  }
  if (!COMMIT.test(commit)) {
    throw new ReleaseError(`commit ${commit} is not 40 hex digits`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(coreMin)) {
    throw new ReleaseError(`core_min ${coreMin} is not a plain version`);
  }
  if (!SHA256.test(sha256)) {
    throw new ReleaseError(`sha256 ${sha256} is not 64 hex digits`);
  }
  if (!url.startsWith("https://")) {
    throw new ReleaseError(`url ${url} is not https`);
  }
  return {
    version,
    commit,
    core_min: coreMin,
    notes,
    targets: { [TARGET]: { url, sha256 } },
  };
}

function digest(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function option(args, name) {
  const at = args.indexOf(name);
  if (at === -1 || at + 1 >= args.length) {
    throw new ReleaseError(`missing ${name}`);
  }
  return args[at + 1];
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function main(args) {
  const [command, ...rest] = args;
  if (command === "entry") {
    process.stdout.write(
      `${changelogEntry(read("CHANGELOG.md"), rest[0]).body}\n`,
    );
    return;
  }
  if (command === "manifest") {
    const version = option(rest, "--version");
    const body = changelogEntry(read("CHANGELOG.md"), version).body;
    const document = manifest({
      version,
      commit: option(rest, "--commit"),
      coreMin: read("distribution/core-version").trim(),
      notes: firstLine(body),
      url: option(rest, "--url"),
      sha256: digest(option(rest, "--archive")),
    });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }
  throw new ReleaseError(
    "usage: release-data.cjs entry VERSION | manifest --version V --commit C --url U --archive FILE",
  );
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof ReleaseError)) {
      throw error;
    }
    process.stderr.write(`release: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  ReleaseError,
  changelogEntry,
  digest,
  firstLine,
  isSemver,
  manifest,
};
