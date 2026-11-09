import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { activityBadge } from "./activity.js";
import { voyageColour } from "./voyage-colours.js";
import { processIcon } from "./process-icons.js";
import { visiblePanels } from "./panels.js";
const AGENT_NAMES = {
  codex: "Codex",
  claude: "Claude",
  "claude-code": "Claude",
  pi: "Pi",
  opencode: "OpenCode",
  cursor: "Cursor",
  "cursor-agent": "Cursor",
  copilot: "Copilot",
  amp: "Amp",
  gemini: "Gemini",
  grok: "Grok",
};
function programName(value) {
  return (
    value
      ?.split(/[\\/]/)
      .pop()
      ?.toLowerCase()
      .replace(/\.exe$/, "") || undefined
  );
}
const STATES = {
  "Needs attention": { rank: 0, symbol: "!", color: "#edb478" },
  Working: { rank: 1, symbol: "●", color: "#8fc6a1" },
  Done: { rank: 2, symbol: "✓", color: "#94bfff" },
  Idle: { rank: 3, symbol: "○", color: "#a4a9b5" },
};
function statusGroup(activity) {
  switch (activity?.state) {
    case "blocked":
    case "error":
      return "Needs attention";
    case "working":
      return "Working";
    case "done":
      return "Done";
  }
  return "Idle";
}
export function agentsView(
  layout,
  processes,
  reported,
  navigate,
  unavailable,
  options,
  owner,
) {
  const colors = projection();
  const scope =
    owner?.kind === "fleet" &&
    layout.home?.fleets.some((fleet) => fleet.id === owner.id)
      ? undefined
      : owner;
  const rows = [];
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
          placements: fleet.vessels,
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
        const content = layout.contents.find(
          (item) => item.id === placement.content,
        );
        if (!content) continue;
        if (
          content.typeId !== "terminal" &&
          !visiblePanels({ root: group.root, members: group.placements }).some(
            (panel) => panel.id === placement.id,
          )
        )
          continue;
        const process = content.backend
          ? processes.find(
              (item) =>
                item.contentId === content.id &&
                item.terminalId === content.backend,
            )
          : undefined;
        if (
          content.typeId === "terminal" &&
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
        const agent = recognized ? AGENT_NAMES[recognized] : undefined;
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
              (content.typeId === "notes"
                ? "Notes"
                : content.typeId === "agents"
                  ? "Activity"
                  : content.typeId === "terminal"
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
          !content.backend && content.typeId === "terminal"
            ? content.startPending
              ? "Starting"
              : "Not started"
            : process?.state === "finished"
              ? "Ended"
              : content.typeId === "terminal" && !process
                ? "Status unavailable"
                : "";
        rows.push({
          id: placement.id,
          voyage: voyage.id,
          name,
          program,
          agent: Boolean(agent),
          group: program,
          status: statusGroup(activity),
          detail: [agent ? statusGroup(activity) : state, group.name]
            .filter(Boolean)
            .join(" · "),
          hint: agent ? badge.hint : state,
        });
      }
  }
  const row = (item) =>
    Button.new(`vessel-${item.id}`)
      .accessibility_label(
        [item.name, item.program, item.detail].filter(Boolean).join(", "),
      )
      .tooltip(item.hint)
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
            item.agent
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
      );
  const section = (id, title, items) => {
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
  const children = [
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
      .sort((a, b) => STATES[a.status].rank - STATES[b.status].rank);
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
    if (agents.length)
      groups.child(
        div()
          .flex()
          .flex_col()
          .child(
            Button.new(`vessels-group-agents-${voyage.id}`)
              .accessibility_label(
                `${agentCollapsed ? "Expand" : "Collapse"} Agents in ${voyage.name}, ${agents.length}`,
              )
              .w_full()
              .justify_start()
              .px(8)
              .py(4)
              .on_click((_event, cx) => options?.toggle(agentKey, cx))
              .child(`${agentCollapsed ? "▸" : "▾"} Agents (${agents.length})`),
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
