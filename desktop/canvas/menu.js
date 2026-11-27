import { Popover } from "gpui-base";
import { menuSurface, menuButton } from "./ui.js";
import { Marker } from "voyager_native";
export { menuSurface, menuButton } from "./ui.js";
export function layoutItems(host, group) {
  const owner = group.owner;
  const key = owner.kind === "fleet" ? owner.id : owner.voyage;
  const items = [
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
  constructor() {
    this.current = null;
  }
  render(id, version, trigger, items) {
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
