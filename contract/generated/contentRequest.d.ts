export type Request =
  | {
      operation: "content.describe";
      requestId: string;
      version: Version;
      vesselId: string;
    }
  | {
      operation: "content.inspect";
      requestId: string;
      version: Version;
      vesselId: string;
    }
  | {
      action: string;
      args: unknown;
      expectedRevision: string;
      operation: "content.invoke";
      requestId: string;
      version: Version;
      vesselId: string;
    };
export type Version = "1";
