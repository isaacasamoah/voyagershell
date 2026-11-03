export type Response =
  | {
      contentId: string;
      message: string;
      requestId: string;
      revision?: string | null;
      status: "limited";
      version: Version;
      warningPresent: boolean;
    }
  | {
      configuration?: DataDescription | null;
      contentId: string;
      requestId: string;
      schemaDeclared: boolean;
      stateSchema?: unknown;
      status: "described";
      version: Version;
    }
  | {
      configuration?: ConfigurationSnapshot | null;
      contentId: string;
      requestId: string;
      snapshot: Snapshot;
      status: "snapshot";
      version: Version;
    }
  | {
      configuration: NotesConfiguration;
      contentId: string;
      requestId: string;
      status: "configured";
      version: Version;
      workspaceVersion: string;
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

export interface DataDescription {
  defaults: unknown;
  schema?: unknown;
}
export interface ConfigurationSnapshot {
  configuration: NotesConfiguration;
  workspaceVersion: string;
}
export interface NotesConfiguration {
  showHeading: boolean;
}
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
