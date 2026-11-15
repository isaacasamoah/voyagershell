export type Action =
  | {
      configuration: NotesConfiguration;
      operation: "configure";
      vesselId: string;
    }
  | {
      operation: "describe";
      vesselId: string;
    }
  | {
      operation: "inspect";
      vesselId: string;
    }
  | {
      operation: "migrate-note";
      vesselId: string;
    }
  | {
      operation: "list-notes";
      vesselId: string;
    }
  | {
      operation: "new-note";
      title: string;
      vesselId: string;
    }
  | {
      filename: string;
      operation: "open-note";
      vesselId: string;
    }
  | {
      data: Notes;
      expectedRevision: string;
      operation: "update";
      vesselId: string;
    };

export interface Input {
  action: Action;
  expectedVersion: string;
}
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
