import { div } from "gpui-kit";
import { Marker, Status } from "voyager_native";
import { take_placement_notice } from "voyager_workspace";
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
export function changedBesidesRevision(next, seen) {
  return (
    next.closeRevision !== seen.closeRevision ||
    next.navigationRevision !== seen.navigationRevision ||
    next.packageRevision !== seen.packageRevision
  );
}
export function outcome(reply) {
  if (reply.status === "refused")
    return `Refused. ${reply.message || "Nothing changed."}`;
  if (reply.status === "uncertain")
    return `Uncertain. ${reply.message || "The result was not confirmed."}`;
  return reply.message || "";
}
export function noticed(owner) {
  owner.status = take_placement_notice() ?? owner.status;
  return owner.status;
}
export function statusLine(text, refresh) {
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
