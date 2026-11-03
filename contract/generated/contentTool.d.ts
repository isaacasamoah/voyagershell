export type Action =
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
export interface Notes {
  text: string;
  title: string;
}
