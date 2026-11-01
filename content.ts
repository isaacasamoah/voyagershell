import Ajv, { type AnySchema } from "ajv";
import { request, response } from "./generated/validate.cjs";
import type { ContentRequest } from "./contract/generated/request";
import type {
  ContentResponse,
  ContentSnapshot,
  RejectionCode,
} from "./contract/generated/response";

export type ContentCaller =
  { kind: "owner" } | { kind: "agent" } | { kind: "frame"; contentId: string };

type StoredData = { data: unknown; version: string; error?: string };
type Definition = { typeId: string; stateSchema?: unknown };

export interface ContentOwner {
  describe(id: string): Definition;
  read(id: string): StoredData;
  write(id: string, data: unknown, expected: string): StoredData;
  inFocus(id: string): boolean;
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class ContentApplication {
  private readonly ajv = new Ajv({ strict: true });
  private readonly schemas = new WeakMap<object, (data: unknown) => boolean>();

  constructor(private readonly owner: ContentOwner) {}

  private finish(value: ContentResponse): ContentResponse {
    const serialized: unknown = JSON.parse(JSON.stringify(value));
    if (!response(serialized))
      throw Error("Content response violated its contract");
    return serialized;
  }

  private validator(schema: unknown): (data: unknown) => boolean {
    if (schema === undefined || schema === true) return () => true;
    if (schema === false) return () => false;
    if (!schema || typeof schema !== "object" || Array.isArray(schema))
      throw Error(
        "Declared content schema must be a JSON Schema object or boolean",
      );
    let validate = this.schemas.get(schema);
    if (!validate) {
      validate = this.ajv.compile(schema as AnySchema);
      this.schemas.set(schema, validate);
    }
    return validate;
  }

  handle(input: unknown, caller: ContentCaller): ContentResponse {
    if (!request(input))
      return this.finish({
        version: "1",
        status: "invalid-request",
        message: "Unsupported content request. No action was taken.",
      });
    const current: ContentRequest = input;
    const { requestId, contentId } = current;
    const context = { version: "1" as const, requestId, contentId };
    const reject = (code: RejectionCode, text: string): ContentResponse =>
      this.finish({
        ...context,
        status: "rejected",
        code,
        message: text,
        ...(current.operation === "content.update"
          ? { expectedRevision: current.expectedRevision }
          : {}),
      });
    let definition: Definition;
    let validate: (data: unknown) => boolean;
    try {
      const allowed =
        caller.kind === "owner" ||
        (caller.kind === "frame" && caller.contentId === contentId) ||
        (caller.kind === "agent" && this.owner.inFocus(contentId));
      if (!allowed)
        return reject("forbidden", "Content is outside the caller's scope.");
      definition = this.owner.describe(contentId);
      validate = this.validator(definition.stateSchema);
    } catch (error) {
      return reject("unavailable", message(error));
    }
    if (current.operation === "content.describe")
      return this.finish({
        ...context,
        status: "described",
        descriptor: {
          contentId,
          typeId: definition.typeId,
          schemaDeclared: definition.stateSchema !== undefined,
          stateSchema: definition.stateSchema ?? true,
        },
      });
    const snapshot = (stored: StoredData): ContentSnapshot => ({
      contentId,
      typeId: definition.typeId,
      data: stored.data,
      revision: stored.version,
      ...(stored.error
        ? { warning: stored.error }
        : !validate(stored.data)
          ? { warning: "Stored data does not match its declared schema." }
          : {}),
    });
    let before: StoredData;
    try {
      before = this.owner.read(contentId);
      if (current.operation === "content.inspect")
        return this.finish({
          ...context,
          status: "snapshot",
          snapshot: snapshot(before),
        });
    } catch (error) {
      return reject("unavailable", message(error));
    }
    if (before.version !== current.expectedRevision)
      return reject(
        "stale-revision",
        "Content changed. Read it again before saving.",
      );
    let data: unknown;
    try {
      const text = JSON.stringify(current.data);
      if (typeof text !== "string") throw Error("Content data must be JSON.");
      data = JSON.parse(text);
      if (!validate(data))
        return reject(
          "invalid-data",
          "Content data does not match its declared schema.",
        );
    } catch (error) {
      return reject("invalid-data", message(error));
    }
    try {
      const saved = this.owner.write(contentId, data, current.expectedRevision);
      return this.finish({
        ...context,
        status: "applied",
        snapshot: snapshot(saved),
      });
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        if (error.code === "STALE_REVISION")
          return reject("stale-revision", error.message);
        if (error.code === "INVALID_DATA")
          return reject("invalid-data", error.message);
      }
      return this.finish({
        ...context,
        status: "uncertain",
        expectedRevision: current.expectedRevision,
        message: `Content write outcome is uncertain. It was not retried. ${message(error)}`,
      });
    }
  }
}
