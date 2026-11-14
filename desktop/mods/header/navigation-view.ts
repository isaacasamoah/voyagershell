import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Name, MeasureHeight, Marker, EditorMarker } from "voyager_native";
import { Brand, dock_target_visible, speech_in_primary } from "voyager_avatar";
import { Speech } from "voyager_conversation";
import { projection } from "voyager_header";
import type Workspace from "./main.js";
import type { NativeElement } from "gpui-kit";
import type { NameState } from "voyager_native";
import type { Action, RenameTarget } from "../../../contract/generated/request";
import type {
  Layout,
  Fleet,
  Voyage,
  Context as Scope,
} from "../../../contract/generated/response";

import { voyageColour } from "./voyage-colours.js";

export function renderNameEditor(
  workspace: Workspace,
  state: NameState,
  id: string,
): NativeElement {
  return div()
    .min_w(60)
    .h(32)
    .on_mouse_down_out(() => workspace.focus.focus())
    .child(Name.new(state))
    .child(EditorMarker.new(id, state));
}

export function renderName(
  rename: RenameTarget | null,
  label: string,
): (NativeElement | string)[] {
  return [
    ...(rename ? [Marker.new(`${rename.kind}-name`, rename.id, label)] : []),
    rename?.kind === "voyage"
      ? div().flex_1().min_w(0).truncate().child(label)
      : label,
  ];
}

export function renderSidebar(
  workspace: Workspace,
  layout: Layout,
  voyage: Voyage | undefined,
): NativeElement {
  const colors = projection();
  const sidebar = div()
    .flex()
    .flex_col()
    .flex_1()
    .min_h(0)
    .border_r_1()
    .border_color("#ffffff0c")
    .bg("#16181c");
  const heading = div().flex().flex_col().flex_shrink_0();
  heading.child(
    div()
      .flex()
      .items_center()
      .h(40)
      .justify_end()
      .pr(2)
      .flex_shrink_0()
      .child(workspace.sidebarToggle()),
  );
  if (!workspace.sidebar)
    heading.child(
      div()
        .w(48)
        .h(44)
        .self_center()
        .flex_shrink_0()
        .children(
          layout.context.kind === "workspace"
            ? [
                workspace.target(
                  "compact-primary-dock",
                  layout.context,
                  div(),
                  true,
                ),
              ]
            : [],
        ),
    );
  else
    heading.child(
      div()
        .relative()
        .w(200)
        .h(202)
        .self_center()
        .flex_shrink_0()
        .mt(12)
        .mb(8)
        .child(
          workspace
            .target(
              "workspace-dock",
              { kind: "workspace" },
              Brand.new("brand", {}),
            )
            .child(Marker.new("workspace-dock")),
        ),
    );
  const primaryControls = div();
  if (!workspace.sidebar) primaryControls.flex_col();
  heading.child(
    primaryControls
      .id("primary-conversation-controls")
      .flex()
      .items_center()
      .justify_center()
      .min_h(30)
      .flex_shrink_0()
      .gap(workspace.sidebar ? 6 : 5)
      .children(
        speech_in_primary() && ["voyage", "fleet"].includes(layout.context.kind)
          ? [div().size(5).rounded_full().bg("#94bda0")]
          : [],
      )
      .children(speech_in_primary() ? [Speech.new("voyager-speech", {})] : [])
      .child(workspace.chat.toggleView(colors)),
  );
  const navigation = div()
    .flex()
    .flex_col()
    .w_full()
    .min_h(0)
    .overflow_y_scroll()
    .px(workspace.sidebar ? 12 : 0);
  const home = Button.new("home-navigation")
    .accessibility_label("Home")
    .h(28)
    .px(workspace.sidebar ? 10 : 4)
    .w(workspace.sidebar ? 200 : 38)
    .text_size(13)
    .gap(9)
    .children(workspace.sidebar ? [svg("home.svg").size(14)] : [])
    .child(workspace.sidebar ? "Home" : svg("home.svg").size(16))
    .child(Marker.new("home-navigation"))
    .on_click((_event, cx) => workspace.run({ operation: "home" }, cx));
  if (workspace.sidebar) home.justify_start();
  else home.justify_center();
  navigation.child(
    div()
      .flex()
      .items_center()
      .justify_center()
      .w_full()
      .h(36)
      .flex_shrink_0()
      .child(
        workspace.contextMenu("home-navigation", home, [
          {
            label: "Stop session…",
            marker: { role: "stop-session", key: "" },
            choose: () => workspace.stopSession.show(),
          },
        ]),
      ),
  );
  if (!workspace.sidebar) {
    navigation.child(div().h(6).flex_shrink_0());
  } else
    navigation.child(
      div()
        .flex()
        .items_center()
        .h(34)
        .mt(12)
        .flex_shrink_0()
        .child(
          div()
            .flex_1()
            .flex()
            .items_center()
            .gap(9)
            .px(10)
            .text_size(13)
            .text_color(colors.muted)
            .child("Voyages"),
        )
        .child(
          Button.new("create-voyage")
            .accessibility_label("Create Voyage")
            .w(24)
            .h(24)
            .p(2)
            .child("+")
            .child(Marker.new("create-voyage"))
            .on_click((_event, cx) => workspace.createVoyage(cx)),
        ),
    );
  const voyages = layout.voyages.filter((item) => !item.closed);
  const grouped = workspace.worktrees?.groups(voyages) || {
    roots: voyages.map((item) => item.id),
    children: {} as Record<string, string[]>,
  };
  const nested = new Set(Object.values(grouped.children).flat());
  const shown = grouped.roots.flatMap((id) => [
    id,
    ...(grouped.children[id] || []),
  ]);
  for (const id of shown) {
    const item = voyages.find((entry) => entry.id === id)!;
    const index = layout.voyages.findIndex((entry) => entry.id === id);
    const scope: Scope = { kind: "voyage", id: item.id };
    const docked =
      layout.context.kind === "voyage" && layout.context.id === item.id;
    const worktree =
      nested.has(item.id) ||
      Boolean(item.cwd && workspace.worktrees?.canRemove(item.id, item.cwd));
    const row = div()
      .relative()
      .flex()
      .items_center()
      .justify_center()
      .w_full()
      .h(42)
      .rounded(4)
      .bg(item.id === voyage?.id ? "#c0b1f00b" : "#00000000")
      .border_1()
      .border_color(
        workspace.drag?.kind === "voyage" &&
          (workspace.drag.id === item.id || workspace.drag.target === item.id)
          ? "#b3d2e5"
          : "#00000000",
      )
      .on_mouse_down("left", (event, cx) =>
        workspace.startDrag("voyage", item.id, event, cx),
      )
      .on_mouse_move((event, cx) =>
        workspace.targetDrag("voyage", item.id, event, cx),
      );
    if (workspace.sidebar)
      row.child(
        div()
          .flex_1()
          .min_w(0)
          .pl(docked ? 60 : nested.has(item.id) ? 22 : 10)
          .pr(10)
          .flex()
          .items_center()
          .gap(9)
          .children(
            worktree
              ? [svg("branch.svg").size(12).text_color(voyageColour(index))]
              : [],
          )
          .children(
            !docked && !worktree
              ? [
                  div()
                    .size(10)
                    .flex_shrink_0()
                    .rounded_full()
                    .bg(voyageColour(index)),
                ]
              : [],
          )
          .child(
            workspace.action(
              item.name,
              { operation: "select-voyage", id: item.id },
              item.id === voyage?.id,
              scope,
            ),
          ),
      );
    else
      row.child(
        Button.new(`rail-voyage-${item.id}`)
          .accessibility_label(`Open Voyage ${item.name}`)
          .w(38)
          .h(38)
          .p(4)
          .justify_center()
          .text_size(12)
          .opacity(docked ? 0 : 1)
          .tooltip(item.name)
          .child(
            worktree
              ? svg("branch.svg").size(14).text_color(voyageColour(index))
              : div().size(10).rounded_full().bg(voyageColour(index)),
          )
          .on_click((_event, cx) =>
            workspace.run({ operation: "select-voyage", id: item.id }, cx),
          ),
      );
    if (
      workspace.drag?.kind === "voyage" &&
      workspace.drag.target === item.id &&
      workspace.drag.bounds
    )
      row.child(
        div()
          .absolute()
          .left(0)
          .top(workspace.drag.side ? 0 : workspace.drag.bounds.height - 2)
          .w(workspace.drag.bounds.width)
          .h(2)
          .bg("#b3d2e5"),
      );
    navigation.child(
      div()
        .h(42)
        .w_full()
        .flex_shrink_0()
        .child(
          workspace.contextMenu(
            `voyage-${item.id}`,
            workspace.target(`voyage-${item.id}`, scope, row),
            [
              {
                label: "Rename",
                choose: (_version, cx) =>
                  workspace.editName(scope, item.name, cx),
              },
              {
                label: "Close",
                marker: { role: "close-voyage", key: item.id },
                choose: (version, cx) =>
                  workspace.run(
                    { operation: "close-voyage", id: item.id },
                    cx,
                    undefined,
                    version,
                  ),
              },
              ...(
                [
                  "new",
                  "open",
                  ...(workspace.worktrees.canRemove(item.id, item.cwd || "")
                    ? ["remove"]
                    : []),
                ] as const
              ).map((mode) => ({
                label: `${mode === "new" ? "New" : mode === "open" ? "Open" : "Remove"} worktree`,
                choose: (version: string, cx: import("gpui-kit").Context) =>
                  workspace.worktrees.open(
                    item.id,
                    version,
                    cx,
                    mode as "new" | "open" | "remove",
                    item.cwd || "",
                  ),
              })),
            ],
          ),
        ),
    );
  }
  const recent = workspace.closedVoyageItems();
  if (workspace.sidebar && recent.length) {
    navigation.child(
      Button.new("recent-voyages")
        .accessibility_label(
          `${workspace.recentOpen ? "Collapse" : "Expand"} Recent voyages`,
        )
        .w_full()
        .justify_start()
        .px(10)
        .h(30)
        .text_size(11)
        .text_color(colors.muted)
        .child(`${workspace.recentOpen ? "▾" : "▸"} Recent voyages`)
        .child(Marker.new("recent-voyages"))
        .on_click((_event, cx) => {
          workspace.recentOpen = !workspace.recentOpen;
          cx.notify();
        }),
    );
    if (workspace.recentOpen)
      navigation.children(
        recent.map((item, index) =>
          Button.new(`recent-voyage-${index}`)
            .accessibility_label(item.label)
            .tooltip(item.label)
            .w_full()
            .justify_start()
            .px(10)
            .h(28)
            .text_size(11)
            .child(
              div()
                .flex_1()
                .min_w(0)
                .truncate()
                .child(item.label.replace(/^Reopen /, "")),
            )
            .children(
              item.marker
                ? [Marker.new(item.marker.role, item.marker.key)]
                : [],
            )
            .on_click((_event, cx) => item.choose(workspace.version, cx)),
        ),
      );
  }
  if (!workspace.sidebar)
    navigation.child(
      Button.new("rail-create-voyage")
        .accessibility_label("Create Voyage")
        .w(38)
        .self_center()
        .h(28)
        .p(2)
        .child("+")
        .child(Marker.new("create-voyage"))
        .on_click((_event, cx) => workspace.createVoyage(cx)),
    );

  const measure = (
    name: "sidebar" | "heading" | "navigation",
    child: NativeElement,
  ): NativeElement =>
    MeasureHeight.new(
      `${workspace.splitSession}-${name}`,
      (height, cx) => workspace.chat.measure(name, height, cx),
      name === "sidebar" ? "Workspace sidebar" : undefined,
    ).child(child);
  sidebar.child(measure("heading", heading).flex_shrink_0());
  if (workspace.sidebar)
    sidebar.child(workspace.chat.render(colors, layout.context) || div());
  sidebar.child(
    measure("navigation", navigation)
      .flex_shrink_0()
      .max_h(workspace.chat.open && workspace.sidebar ? "40%" : "100%"),
  );
  sidebar.child(div().flex_1());
  return measure("sidebar", sidebar);
}

export function renderFleets(
  workspace: Workspace,
  layout: Layout,
  voyage: Voyage | undefined,
  fleet: Fleet | undefined,
): NativeElement {
  const strip = div()
    .flex()
    .items_center()
    .px(8)
    .gap(7)
    .bg(projection().background)
    .border_b_1()
    .border_color("#ffffff0c");
  if (layout.view === "home")
    return strip
      .child(
        workspace.contextMenu(
          "home-layout",
          div().text_size(11).text_color(projection().muted).child("Home"),
          fleet && voyage
            ? workspace
                .fleetMenu(fleet, voyage)
                .filter((item) => item.label !== "New Fleet")
            : [],
        ),
      )
      .child(div().flex_1())
      .children(voyage ? [portalControls(workspace, voyage)] : []);
  if (!voyage) return strip;
  const tabs = div()
    .id("fleet-tabs")
    .flex()
    .flex_1()
    .items_center()
    .min_w(0)
    .h_full()
    .gap(7)
    .overflow_x_scroll();
  for (const item of voyage.fleets.filter((item) => !item.closed)) {
    const selected = item.id === fleet?.id;
    const docked =
      layout.context.kind === "fleet" && layout.context.id === item.id;
    const row = div()
      .relative()
      .flex()
      .items_center()
      .h(docked ? 40 : 29)
      .min_w(90)
      .max_w(220)
      .rounded(5)
      .border_1()
      .border_color(
        workspace.drag?.kind === "fleet" &&
          (workspace.drag.id === item.id || workspace.drag.target === item.id)
          ? "#b3d2e5"
          : selected
            ? "#c4b5fd3b"
            : "#00000000",
      )
      .bg(selected ? "#c4b5fd0c" : "#00000000")
      .pl(docked ? 48 : 6)
      .pr(6)
      .on_hover((hovered, cx) => {
        workspace.hoveredFleet = hovered ? item.id : null;
        cx.notify();
      })
      .on_mouse_down("left", (event, cx) =>
        workspace.startDrag("fleet", item.id, event, cx),
      )
      .on_mouse_move((event, cx) =>
        workspace.targetDrag("fleet", item.id, event, cx),
      )
      .child(
        workspace.layoutName?.owner.kind === "fleet" &&
          workspace.layoutName.owner.id === item.id
          ? Name.new(workspace.layoutName.state).w(160).h(29)
          : workspace
              .action(
                item.name,
                { operation: "select-fleet", id: item.id },
                selected,
                { kind: "fleet", id: item.id },
              )
              .flex_1()
              .min_w(0)
              .h(docked ? 40 : 29)
              .justify_center(),
      );
    row.child(
      Button.new(`close-fleet-${item.id}`)
        .accessibility_label(`Close Fleet ${item.name}`)
        .tooltip("Close Fleet")
        .w(18)
        .h(20)
        .p(3)
        .opacity(
          workspace.hoveredFleet === item.id ||
            workspace.names
              .get(JSON.stringify({ kind: "fleet", id: item.id }))
              ?.focus.is_focused()
            ? 1
            : 0,
        )
        .child(svg("close.svg").size(9))
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click((_event, cx) =>
          workspace.run({ operation: "close-fleet", id: item.id }, cx),
        ),
    );
    if (
      workspace.drag?.kind === "fleet" &&
      workspace.drag.target === item.id &&
      workspace.drag.bounds
    )
      row.child(
        div()
          .absolute()
          .top(0)
          .left(workspace.drag.side ? 0 : workspace.drag.bounds.width - 2)
          .w(2)
          .h(workspace.drag.bounds.height)
          .bg("#b3d2e5"),
      );
    tabs.child(
      workspace.contextMenu(
        `fleet-${item.id}`,
        workspace.target(
          `fleet-${item.id}`,
          { kind: "fleet", id: item.id },
          row,
        ),
        workspace.fleetMenu(item, voyage),
      ),
    );
  }
  tabs.child(
    workspace.contextMenu(
      "fleet-collection",
      workspace.fleetCreationControl(
        voyage,
        Button.new("create-fleet-tab")
          .accessibility_label("Create Fleet")
          .tooltip("New Fleet")
          .w(24)
          .h(26)
          .p(2)
          .flex_shrink_0()
          .child("+")
          .child(Marker.new("create-fleet", voyage.id))
          .on_mouse_down("left", (_event, cx) => cx.stop_propagation()),
      ),
      workspace.closedFleetItems(voyage),
    ),
  );
  return strip.child(tabs).child(portalControls(workspace, voyage));
}

export function renderContext(
  workspace: Workspace,
  layout: Layout,
  voyage: Voyage | undefined,
  fleet: Fleet | undefined,
): NativeElement {
  const context = layout.context;
  const compactPrimary = context.kind === "workspace" && !workspace.sidebar;
  const visible =
    compactPrimary ||
    workspace.compactPortalContext() ||
    dock_target_visible(JSON.stringify(context));
  let goThere: Action | undefined;
  if (context.kind === "fleet")
    goThere = { operation: "select-fleet", id: context.id };
  else if (context.kind === "voyage")
    goThere = { operation: "select-voyage", id: context.id };
  else if (context.kind === "vessel")
    goThere = { operation: "reveal-panel", id: context.id };
  else if (context.kind === "portal")
    goThere = { operation: "reveal-panel", id: context.id };
  const facts = workspace.contextFacts;
  const branch =
    workspace.observation?.branch.kind === "named"
      ? workspace.observation.branch.name
      : workspace.observation?.branch.kind === "detached"
        ? "Detached HEAD"
        : "Branch unavailable";
  const row = div()
    .flex()
    .items_center()
    .h(visible ? 30 : 44)
    .flex_shrink_0()
    .px(10)
    .gap(12)
    .text_size(10)
    .text_color(projection().muted)
    .border_t_1()
    .border_color("#ffffff0c");
  if (!visible)
    row.child(
      div()
        .w(48)
        .h(44)
        .flex_shrink_0()
        .child(workspace.target("out-of-view-avatar", context, div(), true)),
    );
  row.child(
    div()
      .flex_1()
      .min_w(0)
      .overflow_hidden()
      .child(
        div()
          .flex()
          .items_center()
          .gap(6)
          .child(svg("branch.svg").size(13).ml(6))
          .child(div().accessibility_label(`Branch: ${branch}`).child(branch)),
      ),
  );
  if (facts) row.child(div().child(facts.path.join(" / ")));
  if (!visible && goThere)
    row.child(
      workspace.action("Go there", goThere).child(Marker.new("go-there")),
    );
  const region = div().flex().flex_col().child(row);
  if (workspace.status || workspace.worktrees?.status)
    region.child(workspace.statusView());
  return region;
}

export function portalControls(
  workspace: Workspace,
  voyage: Voyage,
): NativeElement {
  const column = voyage.portalLayout;
  if (!column) return div();
  const controls = div().flex().items_center().gap(4).flex_shrink_0();
  if (workspace.layout && workspace.compactPortalContext())
    controls.child(
      div()
        .w(44)
        .h(40)
        .flex_shrink_0()
        .child(
          workspace.target(
            "hidden-portal-avatar",
            workspace.layout.context,
            div(),
            true,
          ),
        ),
    );
  const label = column.visible ? "Hide Portals" : "Show Portals";
  const trigger = Button.new("toggle-portals")
    .accessibility_label(label)
    .tooltip(`${label} · Ctrl+Alt+P / ⌘⌥P`)
    .w(32)
    .h(26)
    .p(3)
    .text_size(11)
    .child(column.visible ? "›" : "‹")
    .child(Marker.new("toggle-portals", voyage.id))
    .on_click((_event, cx) => workspace.togglePortals(voyage, cx));
  controls.child(
    workspace.creationControl(
      `portal-choices-${voyage.id}`,
      {
        kind: "panel",
        owner: { kind: "portals", voyage: voyage.id },
        insertion: { kind: "empty" },
      },
      trigger,
      false,
    ),
  );
  if (column.visible)
    controls.child(
      Button.new("portal-presentation")
        .accessibility_label(
          column.mode === "overlay" ? "Embed Portals" : "Overlay Portals",
        )
        .tooltip(
          `${column.mode === "overlay" ? "Embed Portals" : "Overlay Portals"} · Ctrl+Alt+Shift+P / ⌘⌥⇧P`,
        )
        .w(26)
        .h(26)
        .p(4)
        .child(
          svg(column.mode === "overlay" ? "embed.svg" : "overlay.svg").size(14),
        )
        .on_click((_event, cx) =>
          workspace.run(
            {
              operation: "set-portal-presentation",
              voyage: voyage.id,
              mode: column.mode === "overlay" ? "make-room" : "overlay",
            },
            cx,
          ),
        ),
    );
  return controls;
}
