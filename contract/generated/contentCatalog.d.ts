export type Backend = "core-terminal";
export type Placement = "fleet" | "voyage";

export interface Catalog {
  types: Description[];
}
export interface Description {
  actions: Actions;
  backend?: Backend | null;
  configuration?: DataDescription | null;
  host: NativeHost;
  name: string;
  placements: Placement[];
  state?: DataDescription | null;
  typeId: string;
  view: NativeView;
}
export interface Actions {
  inputSchema: unknown;
  names: string[];
  resultSchema: unknown;
  tool: string;
}
export interface DataDescription {
  defaults: unknown;
  schema?: unknown;
}
export interface NativeHost {
  runtime: string;
  version: string;
}
export interface NativeView {
  component: string;
  module: string;
}
