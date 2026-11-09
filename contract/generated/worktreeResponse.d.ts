export type Status = "applied" | "rejected" | "uncertain";

export interface Response {
  checkouts: Checkout[];
  message?: string | null;
  requestId: string;
  status: Status;
}
export interface Checkout {
  branch?: string | null;
  commonDir: string;
  dirty?: boolean | null;
  locked: boolean;
  main: boolean;
  path: string;
  prunable: boolean;
}
