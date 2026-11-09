export type Operation =
  | {
      operation: "inspect";
    }
  | {
      after: number;
      operation: "wait";
    }
  | {
      id: string;
      operation: "inspect-request";
    }
  | {
      id: string;
      operation: "forward";
    }
  | {
      operation: "send";
      text: string;
      to: Participant;
    }
  | {
      id: string;
      operation: "acknowledge";
    }
  | {
      operation: "instruct";
      target: string;
      task: string;
    }
  | {
      fleet: string;
      name: string;
      operation: "start";
      rank: "crew" | "captain" | "commodore" | "admiral";
      task: string;
    }
  | {
      agent: string;
      operation: "assign";
      supervisor?: string | null;
    }
  | {
      blastRadius: string;
      context: string;
      decision: string;
      operation: "escalate";
      title: string;
    }
  | {
      decision: Decision;
      id: string;
      operation: "resolve";
    };
export type Participant =
  | {
      kind: "user";
    }
  | {
      id: string;
      kind: "agent";
    };
export type Decision =
  | {
      kind: "approve";
    }
  | {
      kind: "deny";
    }
  | {
      kind: "reply";
      text: string;
    };

export interface Request {
  action: Operation;
  requestId: string;
}
