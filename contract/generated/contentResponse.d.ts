export type Response =
  | {
      contentId: string;
      requestId: string;
      schemaDeclared: boolean;
      stateSchema?: unknown;
      status: "described";
      version: Version;
    }
  | {
      contentId: string;
      requestId: string;
      snapshot: Snapshot;
      status: "snapshot";
      version: Version;
    }
  | {
      contentId: string;
      requestId: string;
      snapshot: Snapshot;
      status: "applied";
      version: Version;
    }
  | {
      contentId: string;
      expectedRevision?: string | null;
      message: string;
      requestId: string;
      status: "rejected";
      version: Version;
    }
  | {
      contentId: string;
      expectedRevision: string;
      message: string;
      requestId: string;
      status: "uncertain";
      version: Version;
    };
export type Version = "1";

export interface Snapshot {
  contentId: string;
  data: Notes;
  revision: string;
  warning?: string | null;
}
export interface Notes {
  text: string;
  title: string;
}
