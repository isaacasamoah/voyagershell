import { call, request_id, snapshot } from "voyager_conversation";
import { conversationRequest, conversationReply, conversationSnapshot } from "./validate.js";
export async function send(action) {
  const request = { requestId: request_id(), action };
  if (!conversationRequest(request)) throw Error("Invalid conversation request");
  const reply = JSON.parse(await call(JSON.stringify(request)));
  if (!conversationReply(reply) || reply.requestId !== request.requestId) throw Error("Invalid conversation reply");
  return reply;
}
export async function observe(after) {
  const value = JSON.parse(await snapshot(after));
  if (value !== null && !conversationSnapshot(value)) throw Error("Invalid conversation snapshot");
  return value;
}
