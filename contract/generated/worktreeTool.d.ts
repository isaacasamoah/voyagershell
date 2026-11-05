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

export interface Input {
  action: Action;
  expectedVersion: string;
  voyage: string;
}
