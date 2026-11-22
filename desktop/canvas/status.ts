import { div } from "gpui-kit";
import { Marker, Status } from "voyager_native";
import {
  notice,
  take_placement_notice,
  voyager_unbound,
} from "voyager_workspace";
import type { NativeElement } from "gpui-kit";
import type { Reply } from "../../contract/generated/response";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Notice = {
  closeRevision: string;
  navigationRevision: string;
  packageRevision: string;
};

export function startingNotice(): ReturnType<typeof notice> {
  return {
    revision: "0",
    closeRevision: "0",
    navigationRevision: "0",
    dockRevision: "0",
    packageRevision: "0",
    activityRevision: "0",
  };
}

export function changedBesidesRevision(next: Notice, seen: Notice): boolean {
  return (
    next.closeRevision !== seen.closeRevision ||
    next.navigationRevision !== seen.navigationRevision ||
    next.packageRevision !== seen.packageRevision
  );
}

export function outcome(reply: Reply): string {
  if (reply.status === "refused")
    return `Refused. ${reply.message || "Nothing changed."}`;
  if (reply.status === "uncertain")
    return `Uncertain. ${reply.message || "The result was not confirmed."}`;
  return reply.message || "";
}

export function noticed(owner: { status: string }): string {
  owner.status = take_placement_notice() ?? owner.status;
  return owner.status;
}

export function unboundLine(): string {
  return voyager_unbound() ?? "";
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
      Status.new("workspace-status", text || unboundLine())
        .text_size(11)
        .text_color("#ffcad3"),
    )
    .child(refresh.child(Marker.new("workspace-refresh")));
  return text ? view.child(Marker.new("workspace-status", "", text)) : view;
}
