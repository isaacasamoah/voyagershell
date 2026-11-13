const { execFileSync } = require("node:child_process");

function merges(repository, branch, from) {
  const list = execFileSync(
    "git",
    [
      "-C",
      repository,
      "rev-list",
      "--first-parent",
      "--reverse",
      from ? `${from}^..${branch}` : branch,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  return list.map((commit) => {
    const [subject, ...body] = execFileSync(
      "git",
      ["-C", repository, "log", "-1", "--format=%s%n%b", commit],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
    const pull = /^Merge pull request #(\d+) from \S+?\/(\S+)/.exec(subject);
    if (pull)
      return {
        commit,
        pull: Number(pull[1]),
        branch: pull[2],
        title: body.find((line) => line.trim())?.trim() ?? subject,
      };
    const squash = /^(.*\S)\s+\(#(\d+)\)$/.exec(subject);
    if (squash)
      return {
        commit,
        pull: Number(squash[2]),
        branch: null,
        title: squash[1],
      };
    return { commit, pull: null, branch: null, title: subject };
  });
}

module.exports = { merges };
