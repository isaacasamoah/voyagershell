import { div } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { activityBadge } from "./activity.js";
import { processIcon } from "./process-icons.js";
import type { Context, NativeElement } from "gpui-kit";
import type { Layout } from "../../../contract/generated/response";
import type { ProcessInfo } from "../../../contract/generated/processResponse";
import type {
  Projection as ActivityProjection,
  ReportedActivity,
} from "../../../contract/generated/reportedActivity";

const AGENT_NAMES: Record<string, string> = {
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

function programName(value: string | null | undefined): string | undefined {
  return (
    value
      ?.split(/[\\/]/)
      .pop()
      ?.toLowerCase()
      .replace(/\.exe$/, "") || undefined
  );
}

function statusGroup(
  activity: ReportedActivity | undefined,
  unavailable?: string,
): string {
  if (unavailable) return "Status unavailable";
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
  if (
    !activity ||
    activity.reported === false ||
    activity.reason === "The root status was cleared" ||
    activity.reason === "Only child records were reported"
  )
    return "Other agents";
  return "Status unavailable";
}

type Options = {
  collapsed: Set<string>;
  toggle: (id: string, cx: Context) => void;
};
type Row = {
  id: string;
  name: string;
  program: string;
  detail: string;
  hint: string;
  agent: boolean;
  group: string;
};

export function agentsView(
  layout: Layout,
  processes: ProcessInfo[],
  reported: ActivityProjection["terminals"],
  navigate: (id: string, cx: Context) => void,
  unavailable?: string,
  options?: Options,
): NativeElement {
  const colors = projection();
  const rows: Row[] = [];
  for (const voyage of [
    ...(layout.home ? [layout.home] : []),
    ...layout.voyages,
  ]) {
    const groups = [
      ...voyage.fleets.map((fleet) => ({
        name: `${voyage.name} / ${fleet.name}`,
        placements: fleet.vessels,
      })),
      { name: `${voyage.name} / Portals`, placements: voyage.portals },
    ];
    for (const group of groups)
      for (const placement of group.placements) {
        const content = layout.contents.find(
          (item) => item.id === placement.content,
        );
        if (!content || content.typeId === "agents") continue;
        const process = content.backend
          ? processes.find(
              (item) =>
                item.contentId === content.id &&
                item.terminalId === content.backend,
            )
          : undefined;
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
          name,
          program,
          agent: Boolean(agent),
          group: agent ? statusGroup(activity, unavailable) : program,
          detail: [
            agent
              ? statusGroup(activity, unavailable) === "Other agents"
                ? ""
                : statusGroup(activity, unavailable)
              : state,
            group.name,
          ]
            .filter(Boolean)
            .join(" · "),
          hint: agent ? badge.hint : state,
        });
      }
  }
  const row = (item: Row): NativeElement =>
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
          .items_center()
          .gap(8)
          .child(processIcon(item.program))
          .child(
            div()
              .flex()
              .flex_col()
              .gap(3)
              .child(div().text_size(13).child(item.name))
              .child(
                div()
                  .text_size(11)
                  .text_color(colors.muted)
                  .child(
                    [item.program, item.detail].filter(Boolean).join(" · "),
                  ),
              ),
          ),
      );
  const section = (id: string, title: string, items: Row[]): NativeElement => {
    const collapsed = options?.collapsed.has(id) || false;
    return div()
      .flex()
      .flex_col()
      .pl(id.startsWith("status-") ? 12 : 0)
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
  const agents = rows.filter((item) => item.agent);
  const types = [
    ...new Set(rows.filter((item) => !item.agent).map((item) => item.group)),
  ].sort();
  const agentGroups = [
    "Needs attention",
    "Working",
    "Done",
    "Idle",
    "Other agents",
    "Status unavailable",
  ];
  const agentCollapsed = options?.collapsed.has("agents") || false;
  const children: NativeElement[] = [div().text_size(14).child("Vessels")];
  if (agents.length) {
    children.push(
      div()
        .flex()
        .flex_col()
        .child(
          Button.new("vessels-group-agents")
            .accessibility_label(
              `${agentCollapsed ? "Expand" : "Collapse"} Agents, ${agents.length}`,
            )
            .w_full()
            .justify_start()
            .px(8)
            .py(4)
            .on_click((_event, cx) => options?.toggle("agents", cx))
            .child(`${agentCollapsed ? "▸" : "▾"} Agents (${agents.length})`),
        )
        .children(
          agentCollapsed
            ? []
            : agentGroups.flatMap((group) => {
                const items = agents.filter((item) => item.group === group);
                return items.length
                  ? [section(`status-${group}`, group, items)]
                  : [];
              }),
        ),
    );
  }
  children.push(
    ...types.map((type) =>
      section(
        `type-${type}`,
        type,
        rows.filter((item) => !item.agent && item.group === type),
      ),
    ),
  );
  if (!rows.length) children.push(div().role("label").child("No vessels"));
  return div()
    .flex()
    .flex_col()
    .size_full()
    .min_h(0)
    .p(12)
    .gap(4)
    .text_color(colors.foreground)
    .overflow_y_scroll()
    .children(children);
}
