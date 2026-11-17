import { shownPanels } from "./panels.js";
export async function openOrRetry(open, refresh, before) {
  const opened = await open();
  if (opened.status !== "rejected" || opened.reason !== "changed")
    return opened;
  const layout = await refresh();
  const now = layout?.vessels.find((item) => item.id === before.id);
  const unchanged =
    !!layout &&
    !!before.backend &&
    now?.backend === before.backend &&
    !now.startPending &&
    !now.shellIntent &&
    shownPanels(layout).some((panel) => panel.vessel === before.id);
  return unchanged ? open() : opened;
}
export function terminalStatus(content, outcome) {
  if (content.startPending)
    return "Terminal start is unconfirmed. Inspect before trying again.";
  if (outcome?.status === "rejected" && outcome.reason === "ended")
    return "This program has ended.";
  if (outcome?.status === "rejected")
    return `Terminal unavailable: ${outcome.message || "Request refused"}`;
  if (outcome?.status === "uncertain")
    return `Terminal connection is unconfirmed: ${outcome.message || "No confirmation received"}`;
  if (outcome?.status === "applied")
    return "Terminal attached. View unavailable.";
  if (outcome?.status === "unbound") return "No terminal is bound.";
  if (!content.backend && !outcome) return "No terminal is bound.";
  return "Connecting terminal";
}
