import { div } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { activityBadge } from "./activity.js";
import type { Context, NativeElement } from "gpui-kit";
import type { Layout } from "../../../contract/generated/response";
import type { ProcessInfo } from "../../../contract/generated/processResponse";
import type { Projection as ActivityProjection } from "../../../contract/generated/reportedActivity";

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

function agentName(value: string | null | undefined): string | undefined {
  const name = value
    ?.split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, "");
  return name && Object.hasOwn(AGENT_NAMES, name)
    ? AGENT_NAMES[name]
    : undefined;
}

export function agentsView(
  layout: Layout,
  processes: ProcessInfo[],
  reported: ActivityProjection["terminals"],
  navigate: (id: string, cx: Context) => void,
  unavailable?: string,
): NativeElement {
  const colors = projection();
  const rows: NativeElement[] = [];
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
    for (const group of groups) {
      for (const placement of group.placements) {
        const content = layout.contents.find(
          (item) => item.id === placement.content,
        );
        if (!content?.backend) continue;
        const process = processes.find(
          (item) =>
            item.contentId === content.id &&
            item.terminalId === content.backend &&
            item.state === "live",
        );
        if (!process) continue;
        const activity =
          reported[content.backend] || process.reportedActivity || undefined;
        const launch = content.launch;
        const name =
          agentName(activity?.app) ||
          agentName(process.foreground) ||
          (launch?.kind === "codex"
            ? "Codex"
            : launch?.kind === "program"
              ? agentName(launch.argv[0])
              : undefined);
        if (!name) continue;
        const badge = activityBadge(activity, unavailable);
        const status = badge.label || "No reported status";
        rows.push(
          Button.new(`agent-${placement.id}`)
            .accessibility_label(`${placement.name}, ${name}, ${status}`)
            .tooltip(badge.hint)
            .w_full()
            .justify_start()
            .px(10)
            .py(8)
            .on_click((_event, cx) => navigate(placement.id, cx))
            .child(
              div()
                .flex()
                .flex_col()
                .gap(3)
                .child(div().text_size(13).child(placement.name))
                .child(
                  div()
                    .text_size(11)
                    .text_color(colors.muted)
                    .child(`${name} · ${status} · ${group.name}`),
                ),
            ),
        );
      }
    }
  }
  return div()
    .flex()
    .flex_col()
    .size_full()
    .min_h(0)
    .p(12)
    .gap(4)
    .text_color(colors.foreground)
    .overflow_y_scroll()
    .children(
      unavailable
        ? [
            div()
              .role("label")
              .accessibility_label("Agent status unavailable")
              .tooltip(unavailable)
              .child("Agent status unavailable"),
            ...rows,
          ]
        : rows.length
          ? rows
          : [
              div()
                .role("label")
                .accessibility_label("No agents running")
                .child("No agents running"),
            ],
    );
}
