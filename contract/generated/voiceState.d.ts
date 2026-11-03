export type Capability =
  | {
      kind: "checking";
    }
  | {
      kind: "unavailable";
      reason: string;
    }
  | {
      kind: "candidate";
      version: string;
    }
  | {
      kind: "compatible";
      version: string;
    };
export type Phase = "off" | "preparing" | "negotiating" | "active" | "stopping" | "failed" | "unconfirmed";

export interface State {
  capability: Capability;
  error?: string | null;
  generation: string;
  microphonePeak: number;
  phase: Phase;
  realtimeSession?: string | null;
  speakerPeak: number;
  thread?: string | null;
  turn?: string | null;
  version: string;
}
