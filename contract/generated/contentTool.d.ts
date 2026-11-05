export type Action =
  | {
      configuration: NotesConfiguration;
      contentId: string;
      operation: "configure";
    }
  | {
      contentId: string;
      operation: "describe";
    }
  | {
      contentId: string;
      operation: "inspect";
    }
  | {
      contentId: string;
      operation: "migrate-note";
    }
  | {
      contentId: string;
      operation: "list-notes";
    }
  | {
      contentId: string;
      operation: "new-note";
      title: string;
    }
  | {
      contentId: string;
      filename: string;
      operation: "open-note";
    }
  | {
      contentId: string;
      data: Notes;
      expectedRevision: string;
      operation: "update";
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
