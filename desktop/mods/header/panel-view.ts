import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Terminal } from "voyager_native";
import { Notes } from "voyager_content_view";
import { projection } from "voyager_header";
import { activityBadge } from "./activity.js";
import { vesselFrame } from "./canvas.js";
import { visiblePanels } from "./panels.js";
import type Workspace from "./main.js";
import type { PanelGroup } from "./panels.js";
import type { NativeElement } from "gpui-kit";
import type { Action } from "../../../contract/generated/request";
import type { Context, Vessel } from "../../../contract/generated/response";

export function renderPanel(
  workspace: Workspace,
  placement: Vessel,
  scope: Extract<Context, { kind: "vessel" | "portal" }>,
  group: PanelGroup,
): NativeElement {
  const colors = projection();
  const content = workspace.layout?.contents.find(
    (item) => item.id === placement.content,
  );
  if (!content) throw Error("Placement content is unavailable.");
  const terminal = workspace.terminals.get(content.id);
  const opening = workspace.openings.get(content.id);
  const startShell: Extract<Action, { operation: "start-new-shell" }> | null =
    opening?.status === "rejected" &&
    opening.reason === "ended" &&
    content.backend &&
    !content.startPending
      ? {
          operation: "start-new-shell",
          contentId: content.id,
          expectedBackend: content.backend,
        }
      : null;
  const activity = content.backend
    ? workspace.reportedActivity?.[content.backend]
    : null;
  const badge = activityBadge(activity || undefined, workspace.activityLimit);
  const maximized = group.maximizedPlacement === placement.id;
  const canMaximize = visiblePanels(group).length > 1;
  const entity = scope.kind === "portal" ? "Portal" : "Vessel";
  return workspace.target(
    `${scope.kind}-${placement.id}`,
    scope,
    vesselFrame(
      div()
        .relative()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(0)
        .min_h(0)
        .rounded(3)
        .bg(colors.background)
        .on_mouse_down("left", (_event, cx) => {
          workspace.focused = placement.id;
          cx.notify();
        })
        .on_key_down((event, cx) => {
          workspace.maximizeShortcut(placement.id, event, cx);
        })
        .on_mouse_move((event, cx) => {
          workspace.targetDrag("vessel", placement.id, event, cx);
        })
        .child(
          div()
            .flex()
            .items_center()
            .h(30)
            .flex_shrink_0()
            .px(5)
            .child(
              div()
                .flex_1()
                .flex()
                .items_center()
                .gap(6)
                .text_size(11)
                .text_color(colors.muted)
                .on_mouse_down("left", (event, cx) => {
                  workspace.startDrag("vessel", placement.id, event, cx);
                })
                .child(
                  workspace.contextMenu(
                    `panel-${placement.id}`,
                    workspace.action(
                      workspace.contentName(placement),
                      null,
                      false,
                      scope,
                    ),
                    [
                      {
                        label: "Rename",
                        choose: (_version, cx) =>
                          workspace.editName(scope, placement.name, cx),
                      },
                      {
                        label: "Hide",
                        choose: (version, cx) =>
                          workspace.run(
                            {
                              operation: "set-panel-hidden",
                              id: placement.id,
                              hidden: true,
                            },
                            cx,
                            undefined,
                            version,
                          ),
                      },
                      {
                        label: "Remove from layout",
                        choose: (version, cx) =>
                          workspace.run(
                            { operation: "remove-panel", id: placement.id },
                            cx,
                            undefined,
                            version,
                          ),
                      },
                      ...(scope.kind === "portal"
                        ? workspace.layoutItems(group)
                        : []),
                    ],
                  ),
                )
                .children(
                  content.typeId === "terminal" && badge.label
                    ? [
                        div()
                          .text_size(9)
                          .text_color(colors.muted)
                          .accessibility_label(badge.hint)
                          .tooltip(badge.hint)
                          .child(badge.label),
                      ]
                    : [],
                ),
            )
            .children(
              canMaximize
                ? [
                    Button.new(`maximize-${placement.id}`)
                      .accessibility_label(
                        `${maximized ? "Restore" : "Maximize"} ${entity}`,
                      )
                      .tooltip(
                        `${maximized ? "Restore" : "Maximize"} ${entity}`,
                      )
                      .opacity(0)
                      .hover((element) => element.opacity(1))
                      .focus((element) => element.opacity(1))
                      .w(24)
                      .h(24)
                      .p(4)
                      .on_mouse_down("left", (_event, cx) =>
                        cx.stop_propagation(),
                      )
                      .child(
                        svg(maximized ? "restore.svg" : "maximize.svg").size(
                          12,
                        ),
                      )
                      .on_click((_event, cx) => {
                        workspace.focused = placement.id;
                        workspace.run(
                          {
                            operation: "set-panel-maximized",
                            id: placement.id,
                            maximized: !maximized,
                          },
                          cx,
                        );
                      }),
                  ]
                : [],
            ),
        )
        .child(
          div()
            .flex_1()
            .min_h(0)
            .child(
              content.typeId === "notes"
                ? Notes.new(content.id, { contentId: content.id })
                : terminal
                  ? Terminal.new(terminal).size_full()
                  : div()
                      .p(20)
                      .text_size(12)
                      .text_color(colors.muted)
                      .child(workspace.terminalStatus(content))
                      .children(
                        startShell
                          ? [
                              Button.new(`start-shell-${placement.id}`)
                                .accessibility_label("Start new shell")
                                .disabled(workspace.busy || !workspace.fresh)
                                .child("Start new shell")
                                .on_click((_event, cx) =>
                                  workspace.run(startShell, cx),
                                ),
                            ]
                          : [],
                      ),
            ),
        )
        .children(workspace.splitEdges(placement, group))
        .children(
          workspace.drag?.kind === "vessel" &&
            workspace.drag.target === placement.id &&
            workspace.drag.bounds
            ? [
                div()
                  .absolute()
                  .left(
                    workspace.drag.side === "right"
                      ? workspace.drag.bounds.width / 2
                      : 0,
                  )
                  .top(
                    workspace.drag.side === "bottom"
                      ? workspace.drag.bounds.height / 2
                      : 0,
                  )
                  .w(
                    workspace.drag.side === "left" ||
                      workspace.drag.side === "right"
                      ? workspace.drag.bounds.width / 2
                      : workspace.drag.bounds.width,
                  )
                  .h(
                    workspace.drag.side === "top" ||
                      workspace.drag.side === "bottom"
                      ? workspace.drag.bounds.height / 2
                      : workspace.drag.bounds.height,
                  )
                  .bg("#b3d2e525"),
              ]
            : [],
        ),
      workspace.focused === placement.id,
      workspace.drag?.kind === "vessel" &&
        (workspace.drag.id === placement.id ||
          workspace.drag.target === placement.id),
    ),
  );
}
