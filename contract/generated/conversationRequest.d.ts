export type Action =
  | {
      operation: "send";
      text: string;
    }
  | {
      operation: "interrupt";
    };

export interface Request {
  action: Action;
  requestId: string;
}
