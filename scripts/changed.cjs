const { spawnSync } = require("node:child_process");

class UsageError extends Error {}

function git(args, cwd, input) {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    input,
    maxBuffer: 1 << 30,
  });
  if (result.error) {
    throw new UsageError(`cannot run git: ${result.error.message}`);
  }
  return result;
}

function resolveCommit(ref, cwd) {
  const result = git(
    ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    cwd,
  );
  if (result.status !== 0) {
    throw new UsageError(
      `${ref} is not a commit in this repository. Fetch it, for example git fetch origin, or pass another revision with --base or --head.`,
    );
  }
  return result.stdout.toString("utf8").trim();
}

function mergeBase(base, head, cwd) {
  const result = git(["merge-base", base, head], cwd);
  if (result.status !== 0) {
    throw new UsageError(
      `no merge base between ${base} and ${head}. The clone may be shallow. Fetch more history, for example git fetch --deepen=50, or raise fetch-depth in the checkout step.`,
    );
  }
  return result.stdout.toString("utf8").trim();
}

function parseAdded(diff) {
  const files = new Map();
  let current = null;
  let oldLeft = 0;
  let newLeft = 0;
  let nextLine = 0;
  for (const line of diff.split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith("-")) {
        oldLeft -= 1;
      } else if (line.startsWith("+")) {
        newLeft -= 1;
        current.add(nextLine);
        nextLine += 1;
      }
      continue;
    }
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).replace(/\t$/, "");
      if (target === "/dev/null") {
        current = null;
      } else {
        const path = target.replace(/^b\//, "");
        if (!files.has(path)) files.set(path, new Set());
        current = files.get(path);
      }
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
      nextLine = Number(hunk[2]);
    }
  }
  return files;
}

function renamedTo(diff) {
  const paths = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("rename to "))
      paths.push(line.slice("rename to ".length));
  }
  return paths;
}

function readBlobs(head, paths, cwd) {
  if (paths.length === 0) return new Map();
  const input = paths.map((path) => `${head}:${path}\n`).join("");
  const result = git(["cat-file", "--batch"], cwd, input);
  if (result.status !== 0) {
    throw new UsageError(
      `git cat-file failed: ${result.stderr.toString("utf8").trim()}`,
    );
  }
  const out = result.stdout;
  const texts = new Map();
  let offset = 0;
  for (const path of paths) {
    const end = out.indexOf(0x0a, offset);
    const header = out.toString("utf8", offset, end).split(" ");
    offset = end + 1;
    if (header[1] !== "blob") continue;
    const size = Number(header[2]);
    texts.set(path, out.toString("utf8", offset, offset + size));
    offset += size + 1;
  }
  return texts;
}

function changedFiles({
  base = "origin/main",
  head = "HEAD",
  cwd = process.cwd(),
  select,
}) {
  const baseSha = resolveCommit(base, cwd);
  const headSha = resolveCommit(head, cwd);
  const root = mergeBase(baseSha, headSha, cwd);
  const result = git(
    ["diff", "--unified=0", "-M", "--diff-filter=AMR", root, headSha],
    cwd,
  );
  if (result.status !== 0) {
    throw new UsageError(
      `git diff failed: ${result.stderr.toString("utf8").trim()}`,
    );
  }
  const diff = result.stdout.toString("utf8");
  const added = parseAdded(diff);
  for (const path of renamedTo(diff)) {
    if (!added.has(path)) added.set(path, new Set());
  }
  const paths = [...added.keys()].filter((path) => select(path));
  const texts = readBlobs(headSha, paths, cwd);
  return paths
    .filter((path) => texts.has(path))
    .map((path) => ({ path, added: added.get(path), text: texts.get(path) }));
}

function parseArgs(name, argv) {
  const options = { base: "origin/main", head: "HEAD", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--base" || arg === "--head") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${arg} needs a revision`);
      }
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new UsageError(
        `unknown argument ${arg}. Run ${name} --help for usage`,
      );
    }
  }
  return options;
}

function runCli(name, argv, check) {
  try {
    const options = parseArgs(name, argv);
    if (options.help) {
      console.log(
        `usage: ${name} [--base <rev>] [--head <rev>]\n${check.describe}`,
      );
      return 0;
    }
    const files = changedFiles({
      base: options.base,
      head: options.head,
      select: check.select,
    });
    if (files.length === 0) {
      console.log(`${name}: no changed files in scope against ${options.base}`);
      return 0;
    }
    const findings = [];
    const touched = new Set();
    for (const file of files) {
      for (const found of check.scan(file)) {
        if (!file.added.has(found.line)) continue;
        findings.push(`${file.path}:${found.line}: ${found.message}`);
        touched.add(file.path);
      }
    }
    for (const finding of findings) console.log(finding);
    if (findings.length === 0) {
      console.log(
        `${name}: no findings in ${files.length} changed files against ${options.base}`,
      );
      return 0;
    }
    console.log(
      `${name}: ${findings.length} findings in ${touched.size} files against ${options.base}`,
    );
    return 1;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${name}: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

module.exports = { UsageError, changedFiles, runCli };
