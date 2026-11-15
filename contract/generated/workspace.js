import { call, request_id, terminal_open } from "voyager_workspace";
import {
  request as validateRequest,
  response as validateResponse,
  terminalRequest as validateTerminalRequest,
  terminalResponse as validateTerminalResponse,
} from "./validate.js";
export async function invoke(action, expectedVersion) {
  const request = { requestId: request_id(), expectedVersion, action };
  if (!validateRequest(request)) throw Error("Invalid workspace request");
  const response = JSON.parse(await call(JSON.stringify(request)));
  if (!validateResponse(response) || response.requestId !== request.requestId)
    throw Error("Invalid workspace response");
  return response;
}
export async function openTerminal(vesselId, expectedVersion) {
  const request = { requestId: request_id(), vesselId, expectedVersion };
  if (!validateTerminalRequest(request))
    throw Error("Invalid terminal request");
  const response = JSON.parse(await terminal_open(JSON.stringify(request)));
  if (
    !validateTerminalResponse(response) ||
    response.requestId !== request.requestId ||
    response.vesselId !== vesselId
  )
    throw Error("Terminal result unconfirmed; do not repeat the request");
  return response;
}
