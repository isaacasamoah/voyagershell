import type { Request } from "./request";
import type { Reply } from "./response";
import type { TerminalResponse } from "./terminalResponse";
export function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Reply>;
export function openTerminal(vesselId: string, expectedVersion: string): Promise<TerminalResponse>;
