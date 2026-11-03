export type Request =
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

export interface Notes {
  text: string;
  title: string;
}
