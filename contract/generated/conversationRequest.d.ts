export type Action =
  | {
      operation: "send";
      text: string;
    }
  | {
      operation: "interrupt";
    }
  | {
      operation: "start-voice";
    };

export interface Request {
  action: Action;
  requestId: string;
}
