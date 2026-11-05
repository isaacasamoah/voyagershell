export type Action =
  | {
      operation: "list";
    }
  | {
      base: string;
      branch: string;
      name: string;
      operation: "create";
    }
  | {
      operation: "open";
      path: string;
    }
  | {
      operation: "remove";
      path: string;
    };

export interface Request {
  action: Action;
  expectedVersion: string;
  requestId: string;
  voyage: string;
}
