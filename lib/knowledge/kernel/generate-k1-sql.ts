import { writeFileSync } from "node:fs";
import { renderK1CutoverAssertionsSql, renderK1LegacySetupSql } from "./k1-sql";

const outputPath = (flag: string): string => {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`knowledge_graph_k1_${flag.slice(2)}_required`);
  return value;
};

writeFileSync(outputPath("--setup-output"), renderK1LegacySetupSql(), {
  encoding: "utf8",
  mode: 0o600,
});
writeFileSync(
  outputPath("--assertions-output"),
  renderK1CutoverAssertionsSql(),
  {
    encoding: "utf8",
    mode: 0o600,
  },
);
