import { div } from "gpui-kit";
import { Marker, Status } from "voyager_native";
import type { NativeElement } from "gpui-kit";
import type { Reply } from "../../contract/generated/response";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function outcome(reply: Reply): string {
  if (reply.status === "refused")
    return `Refused. ${reply.message || "Nothing changed."}`;
  if (reply.status === "uncertain")
    return `Uncertain. ${reply.message || "The result was not confirmed."}`;
  return reply.message || "";
}

export function statusLine(
  text: string,
  refresh: NativeElement,
): NativeElement {
  const view = div()
    .flex()
    .flex_col()
    .px(12)
    .py(6)
    .child(
      Status.new("workspace-status", text).text_size(11).text_color("#ffcad3"),
    )
    .child(refresh.child(Marker.new("workspace-refresh")));
  return text ? view.child(Marker.new("workspace-status", "", text)) : view;
}
