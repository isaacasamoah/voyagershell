import { Popover } from "gpui-base";
import { menuSurface, menuButton } from "./ui.js";
import type { Context, NativeElement } from "gpui-kit";

export { menuSurface, menuButton } from "./ui.js";

export type MenuItem = {
  label: string;
  choose: (version: string, cx: Context) => void;
};

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
