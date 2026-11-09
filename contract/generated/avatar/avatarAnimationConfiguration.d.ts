export interface Configuration {
  pack: string;
  restPose: string;
  triggers: Triggers;
  version: number;
}
export interface Triggers {
  click?: string | null;
  dock?: string | null;
  hover?: string | null;
  undock?: string | null;
}
