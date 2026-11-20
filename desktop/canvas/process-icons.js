import { image, svg } from "gpui-kit";
import { agent_programs } from "voyager_workspace";
import { agentPrograms as validateAgentPrograms } from "./validate.js";
let programs;
function listed() {
  if (!programs) {
    const table = JSON.parse(agent_programs());
    if (!validateAgentPrograms(table))
      throw Error("The agent program table is invalid");
    programs = table.agents;
  }
  return programs;
}
export function programName(program) {
  return (
    program
      ?.split(/[\\/]/)
      .pop()
      ?.toLowerCase()
      .replace(/\.exe$/, "") || undefined
  );
}
export function recognisedAgent(program) {
  const name = programName(program);
  return name
    ? listed().find((agent) => agent.programs.includes(name))
    : undefined;
}
export function processIcon(program) {
  const agent = recognisedAgent(program);
  if (agent?.icon) return image(agent.icon).size(14).flex_shrink_0();
  const name = programName(program);
  if (name === "bash") return svg("bash.svg").size(14).flex_shrink_0();
  if (name === "activity") return svg("activity.svg").size(14).flex_shrink_0();
  return svg("note.svg").size(14).flex_shrink_0();
}
