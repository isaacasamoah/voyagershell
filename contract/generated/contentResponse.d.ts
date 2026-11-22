export type Response =
  | {
      message: string;
      requestId: string;
      revision?: string | null;
      status: "limited";
      version: Version;
      vesselId: string;
      warningPresent: boolean;
    }
  | {
      requestId: string;
      schemaDeclared: boolean;
      stateSchema?: unknown;
      status: "described";
      version: Version;
      vesselId: string;
    }
  | {
      requestId: string;
      snapshot: StateSnapshot;
      status: "state";
      version: Version;
      vesselId: string;
    }
  | {
      requestId: string;
      snapshot: StateSnapshot;
      status: "invoked";
      version: Version;
      vesselId: string;
    }
  | {
      expectedRevision?: string | null;
      message: string;
      requestId: string;
      status: "rejected";
      version: Version;
      vesselId: string;
    }
  | {
      expectedRevision: string;
      message: string;
      requestId: string;
      status: "uncertain";
      version: Version;
      vesselId: string;
    };
export type Version = "1";

export interface StateSnapshot {
  revision: string;
  state: unknown;
  vesselId: string;
}
