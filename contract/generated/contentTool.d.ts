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
      data: Notes;
      expectedRevision: string;
      operation: "update";
    };

export interface Input {
  action: Action;
  expectedVersion: string;
}
export interface NotesConfiguration {
  showHeading: boolean;
}
export interface Notes {
  text: string;
  title: string;
}
