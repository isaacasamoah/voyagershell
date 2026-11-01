import { request, response } from "./generated/validate.cjs";
import type { ContentRequest } from "./contract/generated/request";
import type { ContentResponse } from "./contract/generated/response";

declare global {
  interface Window {
    voyager: { call(method: string, input: unknown): Promise<unknown> };
    contentClient: {
      call(
        input: ContentRequest,
        boundContentId: string,
      ): Promise<ContentResponse>;
    };
  }
}

async function call(
  input: ContentRequest,
  boundContentId: string,
): Promise<ContentResponse> {
  if (!request(input)) throw Error("Content request violated its contract");
  let result: unknown;
  try {
    result = await window.voyager.call("content-frame", {
      request: input,
      boundContentId,
    });
  } catch {
    throw Error(
      `Content response is unconfirmed for ${input.requestId}. It was not retried.`,
    );
  }
  if (!response(result))
    throw Error(
      `Content response is unconfirmed for ${input.requestId}. It was not retried.`,
    );
  if (
    result.status !== "invalid-request" &&
    (result.requestId !== input.requestId ||
      result.contentId !== input.contentId)
  )
    throw Error(
      `Content response identity is unconfirmed for ${input.requestId}. It was not retried.`,
    );
  if (result.status !== "invalid-request") {
    const expected = {
      "content.describe": "described",
      "content.inspect": "snapshot",
      "content.update": "applied",
    }[input.operation];
    const nestedId =
      "snapshot" in result
        ? result.snapshot.contentId
        : "descriptor" in result
          ? result.descriptor.contentId
          : input.contentId;
    if (
      nestedId !== input.contentId ||
      !(
        result.status === expected ||
        result.status === "rejected" ||
        (input.operation === "content.update" && result.status === "uncertain")
      ) ||
      (input.operation === "content.update" &&
        (result.status === "rejected" || result.status === "uncertain") &&
        result.expectedRevision !== input.expectedRevision)
    )
      throw Error(
        `Content response does not match ${input.requestId}. It was not retried.`,
      );
  }
  return result;
}

window.contentClient = { call };
