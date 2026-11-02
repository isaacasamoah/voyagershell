import { call, request_id, terminal_open } from "voyager_workspace";
import { request as validateRequest, response as validateResponse, terminalRequest as validateTerminalRequest, terminalResponse as validateTerminalResponse } from "./validate.js";
import type { Request } from "./request";
import type { Response } from "./response";
import type { TerminalRequest } from "./terminalRequest";
import type { TerminalResponse } from "./terminalResponse";
export async function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Response> {
  const request: Request = { requestId: request_id(), expectedVersion, action };
  if (!validateRequest(request)) throw Error("Invalid workspace request");
  const response: unknown = JSON.parse(await call(JSON.stringify(request)));
  if (!validateResponse(response) || response.requestId !== request.requestId)
    throw Error("Invalid workspace response");
  return response;
}
export async function openTerminal(contentId: string, expectedVersion: string): Promise<TerminalResponse> {
  const request: TerminalRequest = { requestId: request_id(), contentId, expectedVersion };
  if (!validateTerminalRequest(request)) throw Error("Invalid terminal request");
  const response: unknown = JSON.parse(await terminal_open(JSON.stringify(request)));
  if (!validateTerminalResponse(response) || response.requestId !== request.requestId || response.contentId !== contentId)
    throw Error("Terminal result unconfirmed; do not repeat the request");
  return response;
}
