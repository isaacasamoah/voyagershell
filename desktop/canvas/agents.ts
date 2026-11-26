import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_theme";
import { Marker } from "voyager_native";
import { activityBadge } from "./activity.js";
import { voyageColour } from "./voyage-colours.js";
import { processIcon, programName, recognisedAgent } from "./process-icons.js";
import { activeGroups, terminalBacked, visiblePanels } from "./panels.js";
import type { Context, NativeElement } from "gpui-kit";
import type { Layout, PlacementOwner } from "../../contract/generated/response";
import type { ProcessInfo } from "../../contract/generated/processResponse";
import type {
  Projection as ActivityProjection,
  ReportedActivity,
} from "../../contract/generated/reportedActivity";

const STATES = {
  "Needs attention": { rank: 0, symbol: "!", color: "#edb478" },
  Working: { rank: 1, symbol: "●", color: "#8fc6a1" },
  Done: { rank: 2, symbol: "✓", color: "#94bfff" },
  Idle: { rank: 3, symbol: "○", color: "#a4a9b5" },
} as const;
function statusGroup(
  activity: ReportedActivity | undefined,
): keyof typeof STATES | undefined {
  switch (activity?.state) {
    case "blocked":
    case "error":
      return "Needs attention";
    case "working":
      return "Working";
    case "done":
      return "Done";
    case "idle":
      return "Idle";
  }
  return undefined;
}
function rank(status: keyof typeof STATES | undefined): number {
  return status ? STATES[status].rank : STATES.Idle.rank;
}

type Options = {
  collapsed: Set<string>;
  toggle: (id: string, cx: Context) => void;
};
type Row = {
  id: string;
  voyage: string;
  name: string;
  program: string;
  detail: string;
  hint: string;
  agent: boolean;
  group: string;
  status: keyof typeof STATES | undefined;
};

export function agentsShown(layout: Layout | null | undefined): boolean {
  return (
    !!layout &&
    activeGroups(layout).some((group) =>
      visiblePanels(group, true).some((panel) =>
        layout.vessels.some(
          (content) =>
            content.id === panel.vessel && content.typeId === "agents",
        ),
      ),
    )
  );
}

export function agentsView(
  layout: Layout,
  processes: ProcessInfo[],
  reported: ActivityProjection["terminals"],
  navigate: (id: string, cx: Context) => void,
  unavailable?: string,
  options?: Options,
  owner?: PlacementOwner,
): NativeElement {
  const colors = projection();
  const scope =
    owner?.kind === "fleet" &&
    layout.home?.fleets.some((fleet) => fleet.id === owner.id)
      ? undefined
      : owner;
  const rows: Row[] = [];
  for (const voyage of [
    ...(layout.home ? [layout.home] : []),
    ...layout.voyages,
  ]) {
    if (voyage.closed) continue;
    if (scope?.kind === "portals" && scope.voyage !== voyage.id) continue;
    const groups = [
      ...voyage.fleets
        .filter(
          (fleet) =>
            !fleet.closed && (scope?.kind !== "fleet" || scope.id === fleet.id),
        )
        .map((fleet) => ({
          name: fleet.name,
          placements: fleet.placements,
          root: fleet.root ?? null,
        })),
      ...(scope?.kind === "fleet"
        ? []
        : [
            {
              name: "Portals",
              placements: voyage.portals,
              root: voyage.portalLayout?.root ?? null,
            },
          ]),
    ];
    for (const group of groups)
      for (const placement of group.placements) {
        const content = layout.vessels.find(
          (item) => item.id === placement.vessel,
        );
        if (!content) continue;
        if (
          !terminalBacked(content.typeId) &&
          !visiblePanels({ root: group.root, members: group.placements }).some(
            (panel) => panel.id === placement.id,
          )
        )
          continue;
        const process = content.backend
          ? processes.find(
              (item) =>
                item.vesselId === content.id &&
                item.terminalId === content.backend,
            )
          : undefined;
        if (
          terminalBacked(content.typeId) &&
          (process?.state === "finished" ||
            (!unavailable && process?.state !== "live"))
        )
          continue;
        const activity = content.backend
          ? reported[content.backend] || process?.reportedActivity || undefined
          : undefined;
        const foreground =
          process?.state === "live"
            ? programName(process.foreground)
            : undefined;
        const reportedProgram =
          process?.state === "live" && !foreground
            ? programName(activity?.app)
            : undefined;
        const recognized = foreground || reportedProgram;
        const agent = recognized
          ? recognisedAgent(recognized)?.name
          : undefined;
        const badge = activityBadge(activity, unavailable);
        let name =
          process?.agentName && agent
            ? process.agentName
            : process?.placementNames?.find(
                (item) => item.placementId === placement.id,
              )?.effectiveName || placement.name;
        const program =
          agent ||
          (foreground === "bash"
            ? "Bash"
            : foreground ||
              (content.typeId === "agents"
                ? "Activity"
                : terminalBacked(content.typeId)
                  ? "Terminal"
                  : content.typeId));
        if (/^Terminal\s+\d+$/i.test(name)) {
          const folder =
            process?.agentName ||
            (process?.cwd || content.cwd)
              ?.replace(/[\\/]+$/, "")
              .split(/[\\/]/)
              .pop() ||
            "/";
          name = agent ? folder : `${program} · ${folder}`;
        }
        const state =
          !content.backend && terminalBacked(content.typeId)
            ? content.startPending
              ? "Starting"
              : "Not started"
            : process?.state === "finished"
              ? "Ended"
              : terminalBacked(content.typeId) && !process
                ? "Status unavailable"
                : "";
        const status = statusGroup(activity);
        const hint = !agent ? state : status ? badge.hint : "";
        rows.push({
          id: placement.id,
          voyage: voyage.id,
          name,
          program,
          agent: Boolean(agent),
          group: program,
          status,
          detail: [agent ? status : state, group.name]
            .filter(Boolean)
            .join(" · "),
          hint,
        });
      }
  }
  const row = (item: Row): NativeElement => {
    const label = [item.name, item.program, item.detail]
      .filter(Boolean)
      .join(", ");
    const button = Button.new(`vessel-${item.id}`).accessibility_label(label);
    return (item.hint ? button.tooltip(item.hint) : button)
      .w_full()
      .justify_start()
      .px(10)
      .py(8)
      .on_click((_event, cx) => navigate(item.id, cx))
      .child(
        div()
          .flex()
          .w_full()
          .items_center()
          .gap(8)
          .child(processIcon(item.program))
          .child(
            div()
              .flex()
              .flex_1()
              .min_w(0)
              .flex_col()
              .gap(3)
              .child(div().text_size(13).truncate().child(item.name))
              .child(
                div()
                  .text_size(11)
                  .text_color(colors.muted)
                  .child(
                    [item.program, item.detail].filter(Boolean).join(" · "),
                  ),
              ),
          )
          .children(
            item.agent && item.status
              ? [
                  div()
                    .role("label")
                    .accessibility_label(item.status)
                    .tooltip(item.hint)
                    .w(24)
                    .text_center()
                    .text_size(13)
                    .text_color(STATES[item.status].color)
                    .child(STATES[item.status].symbol),
                ]
              : [],
          ),
      )
      .child(Marker.new("agents-row", item.id, label));
  };
  const section = (id: string, title: string, items: Row[]): NativeElement => {
    const collapsed = options?.collapsed.has(id) || false;
    return div()
      .flex()
      .flex_col()
      .child(
        Button.new(`vessels-group-${id}`)
          .accessibility_label(
            `${collapsed ? "Expand" : "Collapse"} ${title}, ${items.length}`,
          )
          .tooltip(`${title}: ${items.length}`)
          .w_full()
          .justify_start()
          .px(8)
          .py(4)
          .on_click((_event, cx) => options?.toggle(id, cx))
          .child(`${collapsed ? "▸" : "▾"} ${title} (${items.length})`),
      )
      .children(collapsed ? [] : items.map(row));
  };
  const children: NativeElement[] = [
    div()
      .flex()
      .items_center()
      .gap(8)
      .text_size(19)
      .child(svg("activity.svg").size(18).text_color(colors.muted))
      .child("Activity"),
  ];
  for (const voyage of [
    ...(layout.home ? [layout.home] : []),
    ...layout.voyages,
  ]) {
    if (voyage.closed) continue;
    const index = layout.voyages.findIndex((item) => item.id === voyage.id);
    const mine = rows.filter((item) => item.voyage === voyage.id);
    if (!mine.length) continue;
    const color = voyageColour(Math.max(0, index));
    const voyageKey = `voyage-${voyage.id}`;
    const voyageCollapsed = options?.collapsed.has(voyageKey) || false;
    const card = div()
      .flex()
      .flex_col()
      .gap(8)
      .mt(12)
      .child(
        Button.new(`vessels-voyage-${voyage.id}`)
          .accessibility_label(
            `${voyageCollapsed ? "Expand" : "Collapse"} Voyage ${voyage.name}`,
          )
          .tooltip(`${voyageCollapsed ? "Expand" : "Collapse"} ${voyage.name}`)
          .h(28)
          .px(0)
          .justify_start()
          .gap(8)
          .on_click((_event, cx) => options?.toggle(voyageKey, cx))
          .child(
            layout.home?.id === voyage.id
              ? svg("home.svg").size(14)
              : div().size(8).rounded_full().bg(color),
          )
          .child(div().text_size(13).child(voyage.name)),
      );
    children.push(card);
    if (voyageCollapsed) continue;
    const agents = mine
      .filter((item) => item.agent)
      .sort((a, b) => rank(a.status) - rank(b.status));
    const agentKey = `expanded-agents-${voyage.id}`;
    const agentCollapsed = !options?.collapsed.has(agentKey);
    const groups = div()
      .flex()
      .flex_col()
      .gap(4)
      .border_l_1()
      .border_color(`${color}55`)
      .pl(12)
      .ml(4);
    const agentsLabel = `${agentCollapsed ? "Expand" : "Collapse"} Agents in ${voyage.name}, ${agents.length}`;
    if (agents.length)
      groups.child(
        div()
          .flex()
          .flex_col()
          .child(
            Button.new(`vessels-group-agents-${voyage.id}`)
              .accessibility_label(agentsLabel)
              .w_full()
              .justify_start()
              .px(8)
              .py(4)
              .on_click((_event, cx) => options?.toggle(agentKey, cx))
              .child(`${agentCollapsed ? "▸" : "▾"} Agents (${agents.length})`)
              .child(Marker.new("agents-group", voyage.id, agentsLabel)),
          )
          .children(agentCollapsed ? [] : agents.map(row)),
      );
    const types = [
      ...new Set(mine.filter((item) => !item.agent).map((item) => item.group)),
    ].sort();
    groups.children(
      types.map((type) =>
        section(
          `type-${voyage.id}-${type}`,
          type,
          mine.filter((item) => !item.agent && item.group === type),
        ),
      ),
    );
    card.child(groups);
  }
  if (!rows.length)
    children.push(
      div()
        .role("label")
        .text_size(12)
        .text_color(colors.muted)
        .child(
          unavailable
            ? "Running work is temporarily unavailable."
            : "Your running work will appear here.",
        ),
    );
  return div()
    .flex()
    .flex_col()
    .size_full()
    .min_h(0)
    .p(20)
    .gap(8)
    .text_color(colors.foreground)
    .overflow_y_scroll()
    .children(children);
}
