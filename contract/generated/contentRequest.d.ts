export type Request =
  | {
      configuration: NotesConfiguration;
      expectedVersion: string;
      operation: "content.configure";
      requestId: string;
      version: Version;
      vesselId: string;
    }
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
      expectedVersion: string;
      operation: "content.migrate-note";
      requestId: string;
      version: Version;
      vesselId: string;
    }
  | {
      operation: "content.list-notes";
      requestId: string;
      version: Version;
      vesselId: string;
    }
  | {
      expectedVersion: string;
      operation: "content.new-note";
      requestId: string;
      title: string;
      version: Version;
      vesselId: string;
    }
  | {
      expectedVersion: string;
      filename: string;
      operation: "content.open-note";
      requestId: string;
      version: Version;
      vesselId: string;
    }
  | {
      data: Notes;
      expectedRevision: string;
      operation: "content.update";
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

export interface NotesConfiguration {
  notesFile?: NotesFile | null;
  showHeading: boolean;
}
export interface NotesFile {
  directory: string;
  filename: string;
}
export interface Notes {
  text: string;
  title: string;
}
