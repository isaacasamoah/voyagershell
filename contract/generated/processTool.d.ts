export type ProcessAction =
  | {
      operation: "list";
    }
  | {
      contentId: string;
      lines: number;
      operation: "read";
      terminalId: string;
    }
  | {
      contentId: string;
      operation: "send";
      pid: number;
      terminalId: string;
      text: string;
    }
  | {
      contentId: string;
      operation: "interrupt";
      pid: number;
      terminalId: string;
    }
  | {
      contentId: string;
      operation: "stop";
      pid: number;
      terminalId: string;
    };

export interface ProcessInput {
  action: ProcessAction;
  expectedVersion: string;
}
