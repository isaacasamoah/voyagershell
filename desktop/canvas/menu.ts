import { Popover } from "gpui-base";
import { menuSurface, menuButton } from "./ui.js";
import { Marker } from "voyager_native";
import type { Context, NativeElement } from "gpui-kit";
import type { Action } from "../../contract/generated/request";
import type { Layout, PlacementOwner } from "../../contract/generated/response";
import type { PanelGroup } from "./panels.js";

export { menuSurface, menuButton } from "./ui.js";

export type MenuItem = {
  label: string;
  marker?: { role: Parameters<typeof Marker.new>[0]; key: string };
  choose: (version: string, cx: Context) => void;
};

type LayoutHost = {
  layout: Layout | null;
  saveLayout(owner: PlacementOwner, cx: Context): void;
  run(action: Action, cx: Context, done: undefined, version: string): void;
};

export function layoutItems(host: LayoutHost, group: PanelGroup): MenuItem[] {
  const owner = group.owner;
  const key = owner.kind === "fleet" ? owner.id : owner.voyage;
  const items: MenuItem[] = [
    {
      label: "Save layout",
      marker: { role: "save-layout", key },
      choose: (_version, cx) => host.saveLayout(owner, cx),
    },
  ];
  for (const saved of host.layout?.arrangements || []) {
    if (JSON.stringify(saved.owner) !== JSON.stringify(owner)) continue;
    items.push(
      {
        label: `Load ${saved.name}`,
        marker: { role: "load-layout", key: `${key}:${saved.name}` },
        choose: (version, cx) =>
          host.run(
            { operation: "load-arrangement", owner, name: saved.name },
            cx,
            undefined,
            version,
          ),
      },
      {
        label: `Remove saved ${saved.name}`,
        choose: (version, cx) =>
          host.run(
            { operation: "remove-arrangement", owner, name: saved.name },
            cx,
            undefined,
            version,
          ),
      },
    );
  }
  return items;
}

export class WorkspaceMenu {
  current: { id: string; version: string; items: MenuItem[] } | null = null;

  render(
    id: string,
    version: string,
    trigger: NativeElement,
    items: MenuItem[],
  ): NativeElement {
    const opening = this.current?.id === id ? this.current : null;
    const content = menuSurface(`workspace-actions-${id}`, "Workspace actions");
    for (const [index, item] of (opening?.items || []).entries())
      content.child(
        menuButton(`menu-${id}-${index}`, item.label)
          .child(item.label)
          .children(
            item.marker ? [Marker.new(item.marker.role, item.marker.key)] : [],
          )
          .on_click((_event, cx) => {
            if (!opening || this.current !== opening) return;
            this.current = null;
            item.choose(opening.version, cx);
            cx.notify();
          }),
      );
    return Popover.new(`workspace-menu-${id}`)
      .mouse_button("right")
      .open(Boolean(opening))
      .on_open_change((open, cx) => {
        if (open) this.current = { id, version, items };
        else if (this.current?.id === id) this.current = null;
        cx.notify();
      })
      .trigger(trigger)
      .content(content);
  }
}
