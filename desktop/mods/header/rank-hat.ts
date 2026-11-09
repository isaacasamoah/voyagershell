import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import type Workspace from "./main.js";
import type {
  Content,
  Context,
  Vessel,
} from "../../../contract/generated/response";
import type { NativeElement } from "gpui-kit";

export function rankHat(
  workspace: Workspace,
  placement: Vessel,
  content: Content,
  scope: Extract<Context, { kind: "vessel" | "portal" }>,
): NativeElement {
  const rank = content.rank || "crew";
  const next =
    rank === "crew"
      ? scope.kind === "portal"
        ? "admiral"
        : "captain"
      : rank === "captain"
        ? "commodore"
        : null;
  const label = rank[0].toUpperCase() + rank.slice(1);
  const action = next
    ? `Promote to ${next[0].toUpperCase() + next.slice(1)}`
    : label;
  return div()
    .flex_shrink_0()
    .child(
      Button.new(`rank-${placement.id}`)
        .accessibility_label(`${action} for ${placement.name}`)
        .tooltip(`${label}. ${action}. Trial rank only; no command powers.`)
        .disabled(workspace.busy || !workspace.fresh || next === null)
        .opacity(workspace.hoveredPanel === placement.id ? 1 : 0)
        .hover((element) => element.opacity(1))
        .focus((element) => element.opacity(1))
        .w(24)
        .h(22)
        .p(2)
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .child(
          svg(rank === "crew" ? "hat-captain.svg" : `hat-${rank}.svg`).size(
            rank === "crew" ? 13 : rank === "captain" ? 15 : 19,
          ),
        )
        .on_click((_event, cx) => {
          if (next)
            workspace.run(
              { operation: "set-agent-rank", id: placement.id, rank: next },
              cx,
            );
        }),
    );
}
