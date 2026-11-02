import { call, request_id, snapshot } from "voyager_conversation";
import { conversationRequest, conversationReply, conversationSnapshot } from "./validate.js";
import type { Request } from "./conversationRequest";
import type { Reply } from "./conversationReply";
import type { Snapshot } from "./conversationSnapshot";
export async function send(action: Request["action"]): Promise<Reply> {
  const request: Request = { requestId: request_id(), action };
  if (!conversationRequest(request)) throw Error("Invalid conversation request");
  const reply: unknown = JSON.parse(await call(JSON.stringify(request)));
  if (!conversationReply(reply) || reply.requestId !== request.requestId) throw Error("Invalid conversation reply");
  return reply;
}
export async function observe(after: string | null): Promise<Snapshot | null> {
  const value: unknown = JSON.parse(await snapshot(after));
  if (value !== null && !conversationSnapshot(value)) throw Error("Invalid conversation snapshot");
  return value;
}
