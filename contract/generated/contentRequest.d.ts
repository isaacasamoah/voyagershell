export type Request =
  | {
      configuration: NotesConfiguration;
      contentId: string;
      expectedVersion: string;
      operation: "content.configure";
      requestId: string;
      version: Version;
    }
  | {
      contentId: string;
      operation: "content.describe";
      requestId: string;
      version: Version;
    }
  | {
      contentId: string;
      operation: "content.inspect";
      requestId: string;
      version: Version;
    }
  | {
      contentId: string;
      data: Notes;
      expectedRevision: string;
      operation: "content.update";
      requestId: string;
      version: Version;
    };
export type Version = "1";

export interface NotesConfiguration {
  showHeading: boolean;
}
export interface Notes {
  text: string;
  title: string;
}
