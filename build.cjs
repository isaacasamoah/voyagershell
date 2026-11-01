const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");

execFileSync(process.execPath, ["contract-build.cjs", "--build"], {
  cwd: __dirname,
  stdio: "inherit",
});
for (const [entry, file, platform, format] of [
  ["content.ts", "generated/content.cjs", "node", "cjs"],
  ["content-client.ts", "generated/content-client.js", "browser", "iife"],
])
  esbuild.buildSync({
    absWorkingDir: __dirname,
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    platform,
    format,
    target: platform === "node" ? "node24" : "es2022",
    minify: true,
    legalComments: "external",
  });
