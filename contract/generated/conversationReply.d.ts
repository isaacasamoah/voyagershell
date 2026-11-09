export type Delivery = "accepted" | "rejected" | "unconfirmed";

export interface Reply {
  delivery: Delivery;
  error?: string | null;
  requestId: string;
}
