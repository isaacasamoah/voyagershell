import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Marker, Terminal } from "voyager_native";
import { agentsView } from "./agents.js";
import { Notes } from "voyager_content_view";
import { projection } from "voyager_header";
import { activityBadge } from "./activity.js";
import { vesselFrame } from "./canvas.js";
import { visiblePanels } from "./panels.js";
import { processIcon } from "./process-icons.js";
export function renderPanel(workspace, placement, scope, group) {
  const colors = projection();
  const content = workspace.layout?.contents.find(
    (item) => item.id === placement.content,
  );
  if (!content) throw Error("Placement content is unavailable.");
  const terminal = workspace.terminals.get(content.id);
  const opening = workspace.openings.get(content.id);
  const startShell =
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
  const title = workspace
    .action(
      workspace.contentName(placement),
      null,
      false,
      scope,
      workspace.panelLabel(placement),
    )
    .w_full()
    .min_w(0)
    .px(0);
  if (!workspace.editing) title.truncate();
  const menu = [
    {
      label: "Rename",
      choose: (_version, cx) => workspace.editName(scope, placement.name, cx),
    },
    ...["right", "bottom"].map((side) => ({
      label: side === "right" ? "Split side by side" : "Split above and below",
      choose: (_version, cx) =>
        workspace.openSplit(group, placement.id, side, cx),
    })),
    ...(maximized || canMaximize
      ? [
          {
            label: `${maximized ? "Restore" : "Maximize"} ${entity}`,
            choose: (version, cx) => {
              workspace.focused = placement.id;
              workspace.run(
                {
                  operation: "set-panel-maximized",
                  id: placement.id,
                  maximized: !maximized,
                },
                cx,
                undefined,
                version,
              );
            },
          },
        ]
      : []),
    {
      label: `Close ${entity}`,
      choose: (version, cx) =>
        workspace.run(
          { operation: "remove-panel", id: placement.id },
          cx,
          undefined,
          version,
        ),
    },
    ...(scope.kind === "portal" ? workspace.layoutItems(group) : []),
  ];
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
        .on_hover((hovered, cx) => {
          if (hovered) workspace.hoveredPanel = placement.id;
          else if (workspace.hoveredPanel === placement.id)
            workspace.hoveredPanel = null;
          cx.notify();
        })
        .on_mouse_down("left", (_event, cx) => {
          const changed = workspace.focused !== placement.id;
          workspace.focused = placement.id;
          if (changed) cx.spawn((task) => workspace.readObservation(task));
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
            .min_w(0)
            .h(30)
            .flex_shrink_0()
            .px(5)
            .child(
              div()
                .flex_1()
                .min_w(20)
                .child(
                  workspace.contextMenu(
                    `panel-${placement.id}`,
                    div()
                      .w_full()
                      .min_w(0)
                      .overflow_hidden()
                      .flex()
                      .items_center()
                      .gap(6)
                      .text_size(11)
                      .text_color(colors.muted)
                      .on_mouse_down("left", (event, cx) => {
                        workspace.startDrag("vessel", placement.id, event, cx);
                      })
                      .child(
                        processIcon(
                          workspace.observedPanels?.find(
                            (panel) => panel.placementId === placement.id,
                          )?.program || content.typeId,
                        ),
                      )
                      .child(div().flex_1().min_w(0).child(title))
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
                    menu,
                  ),
                ),
            )
            .child(
              div()
                .flex()
                .flex_shrink_0()
                .child(workspace.splitControl(placement, group, "right"))
                .child(workspace.splitControl(placement, group, "bottom"))
                .child(
                  Button.new(`maximize-${placement.id}`)
                    .accessibility_label(
                      `${maximized ? "Restore" : "Maximize"} ${entity}`,
                    )
                    .tooltip(`${maximized ? "Restore" : "Maximize"} ${entity}`)
                    .disabled(!maximized && !canMaximize)
                    .opacity(workspace.hoveredPanel === placement.id ? 1 : 0)
                    .hover((element) => element.opacity(1))
                    .focus((element) => element.opacity(1))
                    .w(22)
                    .h(22)
                    .flex_shrink_0()
                    .p(4)
                    .on_mouse_down("left", (_event, cx) =>
                      cx.stop_propagation(),
                    )
                    .child(
                      svg(maximized ? "restore.svg" : "maximize.svg").size(12),
                    )
                    .child(Marker.new("maximize-panel", placement.id))
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
                )
                .child(
                  Button.new(`close-${placement.id}`)
                    .accessibility_label(`Close ${entity} ${placement.name}`)
                    .tooltip("Close viewer. The process keeps running.")
                    .opacity(workspace.hoveredPanel === placement.id ? 1 : 0)
                    .hover((element) => element.opacity(1))
                    .focus((element) => element.opacity(1))
                    .w(22)
                    .h(22)
                    .flex_shrink_0()
                    .p(4)
                    .on_mouse_down("left", (_event, cx) =>
                      cx.stop_propagation(),
                    )
                    .child(svg("close.svg").size(12))
                    .child(Marker.new("close-panel", placement.id))
                    .on_click((_event, cx) =>
                      workspace.run(
                        { operation: "remove-panel", id: placement.id },
                        cx,
                      ),
                    ),
                ),
            ),
        )
        .child(
          div()
            .flex_1()
            .min_h(0)
            .children(
              content.typeId === "terminal" && terminal
                ? [Marker.new("terminal", placement.id)]
                : [],
            )
            .child(
              content.typeId === "agents"
                ? agentsView(
                    workspace.layout,
                    workspace.processes,
                    workspace.reportedActivity,
                    (id, cx) =>
                      workspace.run({ operation: "reveal-panel", id }, cx),
                    workspace.processError,
                    {
                      collapsed: workspace.collapsedGroups,
                      toggle: (id, cx) => {
                        if (!workspace.collapsedGroups.delete(id))
                          workspace.collapsedGroups.add(id);
                        cx.notify();
                      },
                    },
                    group.owner,
                  )
                : content.typeId === "notes"
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
        .children(workspace.splitPreview(placement))
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
                  .bg("#b3d2e525")
                  .child(Marker.new("move-preview", placement.id)),
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
