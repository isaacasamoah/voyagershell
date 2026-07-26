import { writeFileSync } from "node:fs";
import { renderActiveMembershipAssertionsSql } from "./active-membership-assertions-sql";
import {
  renderAuthorityBoundaryAssertionsSql,
  renderAuthorityGapSetupSql,
} from "./authority-boundary-sql";
import { createRandomK1FixtureSeed } from "./k1-fixture-seed";
import {
  renderK1HistoricalAssertionsSql,
  renderK1HistoricalSetupSql,
} from "./k1-historical-sql";
import { renderK1CutoverAssertionsSql } from "./k1-cutover-assertions-sql";
import { renderK1LegacySetupSql } from "./k1-legacy-setup-sql";

const outputPath = (flag: string): string => {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`knowledge_graph_k1_${flag.slice(2)}_required`);
  return value;
};

const seed = createRandomK1FixtureSeed();

writeFileSync(outputPath("--legacy-output"), renderK1LegacySetupSql(seed), {
  encoding: "utf8",
  mode: 0o600,
});
writeFileSync(outputPath("--historical-output"), renderK1HistoricalSetupSql(seed), {
  encoding: "utf8",
  mode: 0o600,
});
writeFileSync(outputPath("--gap-output"), renderAuthorityGapSetupSql(seed), {
  encoding: "utf8",
  mode: 0o600,
});
writeFileSync(
  outputPath("--assertions-output"),
  `${renderActiveMembershipAssertionsSql(seed)}${renderK1CutoverAssertionsSql(seed)}${renderK1HistoricalAssertionsSql(seed)}`,
  {
    encoding: "utf8",
    mode: 0o600,
  },
);
writeFileSync(
  outputPath("--boundary-output"),
  renderAuthorityBoundaryAssertionsSql(seed),
  { encoding: "utf8", mode: 0o600 },
);
