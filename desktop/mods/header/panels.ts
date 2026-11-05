import type {
  Layout,
  PanelOwner,
  Split,
  Vessel,
  Voyage,
} from "../../../contract/generated/response";

export type PanelGroup = {
  owner: PanelOwner;
  voyage: Voyage;
  members: Vessel[];
  root: Split | null;
  maximizedPlacement?: string | null;
};

export function currentVoyage(layout: Layout): Voyage | undefined {
  return layout.view === "home"
    ? (layout.home ?? undefined)
    : layout.voyages.find(
        (voyage) => !voyage.closed && voyage.id === layout.selectedVoyage,
      );
}

export function panelGroups(layout: Layout): PanelGroup[] {
  const groups: PanelGroup[] = [];
  for (const voyage of [
    ...layout.voyages,
    ...(layout.home ? [layout.home] : []),
  ]) {
    for (const fleet of voyage.fleets)
      groups.push({
        owner: { kind: "fleet", id: fleet.id },
        voyage,
        members: fleet.vessels,
        root: fleet.root ?? null,
        maximizedPlacement: fleet.maximizedPlacement,
      });
    if (voyage.portalLayout)
      groups.push({
        owner: { kind: "portals", voyage: voyage.id },
        voyage,
        members: voyage.portals,
        root: voyage.portalLayout.root ?? null,
        maximizedPlacement: voyage.portalLayout.maximizedPlacement,
      });
  }
  return groups;
}

export function activeGroups(layout: Layout): PanelGroup[] {
  const voyage = currentVoyage(layout);
  if (!voyage) return [];
  const fleetId =
    layout.view === "home" ? voyage.fleets[0]?.id : layout.selectedFleet;
  const closed = new Set(
    voyage.fleets.filter((fleet) => fleet.closed).map((fleet) => fleet.id),
  );
  return panelGroups(layout).filter(
    (group) =>
      !group.voyage.closed &&
      group.voyage.id === voyage.id &&
      (group.owner.kind !== "fleet" || !closed.has(group.owner.id)) &&
      (group.owner.kind === "fleet"
        ? group.owner.id === fleetId
        : Boolean(voyage.portalLayout?.visible)),
  );
}

export function visiblePanels(
  group: Pick<PanelGroup, "root" | "members" | "maximizedPlacement">,
  maximized = false,
): Vessel[] {
  const ids = new Set<string>();
  const visit = (tree: Split | null) => {
    if (!tree) return;
    if (tree.kind === "leaf") ids.add(tree.placement);
    else {
      visit(tree.first);
      visit(tree.second);
    }
  };
  visit(group.root);
  return group.members.filter(
    (panel) =>
      !panel.hidden &&
      ids.has(panel.id) &&
      (!maximized ||
        !group.maximizedPlacement ||
        group.maximizedPlacement === panel.id),
  );
}

export type HiddenPanel = Vessel & { path: string };

export function hiddenPanels(
  layout: Layout,
  destination: import("../../../contract/generated/request").ContentDestination,
  processes: import("../../../contract/generated/processResponse").ProcessInfo[],
): HiddenPanel[] {
  const groups = panelGroups(layout);
  const target = groups.find(
    (group) =>
      JSON.stringify(group.owner) === JSON.stringify(destination.owner),
  );
  if (!target) return [];
  const live = new Set(
    processes
      .filter((process) => process.state === "live" && process.pid)
      .map((process) =>
        JSON.stringify([process.contentId, process.terminalId]),
      ),
  );
  const contents = new Map(
    layout.contents.map((content) => [content.id, content]),
  );
  return groups
    .filter(
      (group) =>
        group.voyage.id === target.voyage.id &&
        group.owner.kind === target.owner.kind,
    )
    .flatMap((group) => {
      const visible = new Set(visiblePanels(group).map((panel) => panel.id));
      return group.members
        .filter((panel) => {
          if (visible.has(panel.id)) return false;
          const content = contents.get(panel.content);
          if (!content || content.startPending) return false;
          return content.typeId === "terminal"
            ? Boolean(
                content.backend &&
                live.has(JSON.stringify([content.id, content.backend])),
              )
            : ["notes", "agents"].includes(content.typeId) && !content.backend;
        })
        .map((panel) => ({
          ...panel,
          path: `${group.voyage.name} / ${group.owner.kind === "fleet" ? group.voyage.fleets.find((fleet) => group.owner.kind === "fleet" && fleet.id === group.owner.id)?.name : "Portals"}`,
        }));
    });
}
