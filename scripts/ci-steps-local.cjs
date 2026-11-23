const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WORKFLOW =
  process.env.CI_STEPS_LOCAL_WORKFLOW ||
  path.join(ROOT, ".github", "workflows", "checks.yml");
const GATE = "Feature map change gate";
const CI_BASE = "HEAD^1";
const IGNORED = [
  {
    name: "Sandbox tools for the native crate tests",
    reason: "needs sudo and changes the CI runner only",
  },
];
const ALSO = ["npm test"];

class PlanError extends Error {}

function parseSteps(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  if (start === -1) {
    throw new PlanError("no steps list found in the workflow");
  }
  const steps = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== "" && !/^ {6}/.test(line)) {
      break;
    }
    const dash = /^ {6}- (.*)$/.exec(line);
    const key = /^ {8}([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
    let entry = null;
    if (dash) {
      current = {};
      steps.push(current);
      entry = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(dash[1]);
    } else if (key) {
      entry = key;
    }
    if (!entry || !current) {
      continue;
    }
    const [, name, value] = entry;
    if (value === "|" || value === ">") {
      const body = [];
      while (
        i + 1 < lines.length &&
        (lines[i + 1].trim() === "" || /^ {10}/.test(lines[i + 1]))
      ) {
        i++;
        body.push(lines[i].slice(10));
      }
      current[name] = body.join("\n").trim();
    } else {
      current[name] = value.replace(/^["']|["']$/g, "");
    }
  }
  return steps;
}

function label(step) {
  return step.name || step.uses || step.run.split("\n")[0];
}

function plan(text, base) {
  const steps = parseSteps(text);
  const gate = steps.findIndex((step) => step.name === GATE);
  if (gate === -1) {
    throw new PlanError(`the workflow has no step named "${GATE}"`);
  }
  for (const ignored of IGNORED) {
    if (!steps.some((step) => step.name === ignored.name)) {
      throw new PlanError(
        `the ignored step "${ignored.name}" is no longer in the workflow; update IGNORED in scripts/ci-steps-local.cjs`,
      );
    }
  }
  const planned = [];
  for (const step of steps.slice(gate)) {
    if (IGNORED.some((ignored) => ignored.name === step.name)) {
      continue;
    }
    if (!step.run) {
      throw new PlanError(
        `the workflow step "${label(step)}" is not a run step, so the script cannot run it; add it to IGNORED or teach scripts/ci-steps-local.cjs`,
      );
    }
    if (/\bsudo\b/.test(step.run)) {
      throw new PlanError(
        `the workflow step "${label(step)}" needs sudo; add it to IGNORED in scripts/ci-steps-local.cjs if it is CI only`,
      );
    }
    planned.push({
      name: label(step).split(CI_BASE).join(base),
      command: step.run.split(CI_BASE).join(base),
    });
  }
  for (const command of ALSO) {
    if (!steps.some((step) => step.run === command)) {
      throw new PlanError(
        `the workflow no longer runs "${command}"; update ALSO in scripts/ci-steps-local.cjs`,
      );
    }
    planned.push({ name: command, command });
  }
  return planned;
}

function runSteps(planned, head, cwd, out) {
  out(`head ${head}`);
  const results = [];
  planned.forEach((step, index) => {
    out(`== [${index + 1}/${planned.length}] ${step.name}`);
    out(`$ ${step.command}`);
    const started = Date.now();
    const result = spawnSync("sh", ["-c", step.command], {
      cwd,
      stdio: "inherit",
    });
    const status = result.status === null ? 1 : result.status;
    const seconds = Math.round((Date.now() - started) / 1000);
    out(`-> exit ${status} in ${seconds}s: ${step.command}`);
    results.push({ ...step, status });
  });
  const failed = results.filter((result) => result.status !== 0);
  out(
    `ci-steps-local: head ${head}: ${results.length} steps, ${results.length - failed.length} passed, ${failed.length} failed${failed.map((result) => `\n  FAILED ${result.name} (exit ${result.status})`).join("")}`,
  );
  return results;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new PlanError(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function main(argv) {
  let base = null;
  let list = false;
  let workflow = WORKFLOW;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") {
      base = argv[++i];
    } else if (argv[i] === "--list") {
      list = true;
    } else if (argv[i] === "--workflow") {
      workflow = argv[++i];
    } else {
      throw new PlanError(
        `unknown argument ${argv[i]}. Use --base REV, --list or --workflow FILE.`,
      );
    }
  }
  const head = git(["rev-parse", "HEAD"]);
  const resolved = base || git(["merge-base", "HEAD", "origin/main"]);
  const planned = plan(fs.readFileSync(workflow, "utf8"), resolved);
  if (list) {
    process.stdout.write(
      `${planned.map((step) => `${step.name}: ${step.command}`).join("\n")}\n`,
    );
    return 0;
  }
  const results = runSteps(planned, head, ROOT, (line) =>
    process.stdout.write(`${line}\n`),
  );
  return results.some((result) => result.status !== 0) ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof PlanError)) {
      throw error;
    }
    process.stderr.write(`ci-steps-local: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { IGNORED, PlanError, WORKFLOW, parseSteps, plan, runSteps };
