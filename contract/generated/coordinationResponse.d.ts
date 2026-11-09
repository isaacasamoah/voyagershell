export type Outcome = "applied" | "refused" | "partial" | "uncertain";
export type Participant =
  | {
      kind: "user";
    }
  | {
      id: string;
      kind: "agent";
    };
export type Payload =
  | {
      kind: "conversation";
      text: string;
    }
  | {
      kind: "instruction";
      target: string;
      task: string;
    }
  | {
      fleet: string;
      kind: "start";
      name: string;
      rank: "crew" | "captain" | "commodore" | "admiral";
      task: string;
    }
  | {
      blastRadius: string;
      context: string;
      decision: string;
      kind: "escalation";
      title: string;
    }
  | {
      decision: Decision;
      inReplyTo: string;
      kind: "decision";
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

export interface Response {
  created?: string | null;
  message?: string | null;
  outcome: Outcome;
  requestId: string;
  snapshot?: Snapshot | null;
}
export interface Snapshot {
  agents: Agent[];
  current: Participant;
  messages: Message[];
  revision: number;
}
export interface Agent {
  content: string;
  fleet?: string | null;
  id: string;
  live: boolean;
  name: string;
  placement: string;
  rank: "crew" | "captain" | "commodore" | "admiral";
  supervisor?: string | null;
  voyage: string;
}
export interface Message {
  acknowledged: boolean;
  from: Participant;
  id: string;
  payload: Payload;
  resolved: boolean;
  senderName: string;
  to: Participant;
  via: string[];
}
