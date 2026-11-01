import { call, request_id } from "voyager_workspace";
import { request as validateRequest, response as validateResponse } from "./validate.js";
export async function invoke(action, expectedVersion) {
  const request = { requestId: request_id(), expectedVersion, action };
  if (!validateRequest(request)) throw Error("Invalid workspace request");
  const response = JSON.parse(await call(JSON.stringify(request)));
  if (!validateResponse(response) || response.requestId !== request.requestId)
    throw Error("Invalid workspace response");
  return response;
}
