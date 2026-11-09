import { processes } from "voyager_workspace";
import { processResponse } from "./validate.js";
import type { ProcessInfo } from "../../../contract/generated/processResponse";

export async function inspectProcesses(
  version: string,
): Promise<ProcessInfo[]> {
  const result: unknown = JSON.parse(await processes(version));
  if (!processResponse(result)) throw Error("Invalid process snapshot");
  if (
    result.status !== "applied" ||
    !result.fresh ||
    result.version !== version ||
    result.output?.operation !== "list"
  )
    throw Error(
      result.message || "Workspace changed; reopen the content chooser.",
    );
  return result.output.processes;
}
