export type ProcessAction =
  | {
      operation: "list";
    }
  | {
      lines: number;
      operation: "read";
      terminalId: string;
      vesselId: string;
    }
  | {
      operation: "send";
      pid: number;
      terminalId: string;
      text: string;
      vesselId: string;
    }
  | {
      operation: "interrupt";
      pid: number;
      terminalId: string;
      vesselId: string;
    }
  | {
      operation: "stop";
      pid: number;
      terminalId: string;
      vesselId: string;
    };

export interface ProcessInput {
  action: ProcessAction;
  expectedVersion: string;
}
