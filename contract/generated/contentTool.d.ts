export type Action =
  | {
      operation: "describe";
      vesselId: string;
    }
  | {
      operation: "inspect";
      vesselId: string;
    }
  | {
      action: string;
      args: unknown;
      expectedRevision: string;
      operation: "invoke";
      vesselId: string;
    };

export interface Input {
  action: Action;
  expectedVersion: string;
}
