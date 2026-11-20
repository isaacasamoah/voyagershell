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
      configuration?: DataDescription | null;
      requestId: string;
      schemaDeclared: boolean;
      stateSchema?: unknown;
      status: "described";
      version: Version;
      vesselId: string;
    }
  | {
      configuration?: ConfigurationSnapshot | null;
      requestId: string;
      snapshot: Snapshot;
      status: "snapshot";
      version: Version;
      vesselId: string;
    }
  | {
      filenames: string[];
      requestId: string;
      status: "notes-list";
      version: Version;
      vesselId: string;
    }
  | {
      configuration: NotesConfiguration;
      requestId: string;
      snapshot: Snapshot;
      status: "note-opened";
      version: Version;
      vesselId: string;
      workspaceVersion: string;
    }
  | {
      configuration: NotesConfiguration;
      requestId: string;
      status: "configured";
      version: Version;
      vesselId: string;
      workspaceVersion: string;
    }
  | {
      requestId: string;
      snapshot: Snapshot;
      status: "applied";
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

export interface DataDescription {
  defaults: unknown;
  schema?: unknown;
}
export interface ConfigurationSnapshot {
  configuration: NotesConfiguration;
  workspaceVersion: string;
}
export interface NotesConfiguration {
  notesFile?: NotesFile | null;
  showHeading: boolean;
}
export interface NotesFile {
  directory: string;
  filename: string;
}
export interface Snapshot {
  data: Notes;
  revision: string;
  vesselId: string;
  warning?: string | null;
}
export interface Notes {
  text: string;
  title: string;
}
export interface StateSnapshot {
  revision: string;
  state: unknown;
  vesselId: string;
}
