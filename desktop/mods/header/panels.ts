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
    : layout.voyages.find((voyage) => voyage.id === layout.selectedVoyage);
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
  return panelGroups(layout).filter(
    (group) =>
      group.voyage.id === voyage.id &&
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
