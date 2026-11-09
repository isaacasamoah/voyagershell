import { div } from "gpui-kit";
import { Button, Popover } from "gpui-base";
import type { Context, NativeElement } from "gpui-kit";

export type MenuItem = {
  label: string;
  choose: (version: string, cx: Context) => void;
};

export function menuSurface(id: string, label: string): NativeElement {
  return div()
    .id(id)
    .role("menu")
    .accessibility_label(label)
    .flex()
    .flex_col()
    .w(200)
    .p(4)
    .rounded(7)
    .border_1()
    .border_color("#ffffff18")
    .bg("#17191d")
    .text_color("#ded8ef");
}

export function menuButton(id: string, label: string): NativeElement {
  return Button.new(id)
    .role("menu_item")
    .accessibility_label(label)
    .h(31)
    .px(10)
    .justify_start()
    .rounded(4)
    .text_size(12);
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
