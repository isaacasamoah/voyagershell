import { div } from "gpui-kit";
import { Button, Switch } from "gpui-base";
import type { Context, NativeElement } from "gpui-kit";

export const ui = {
  background: "#17191d",
  foreground: "#ded8ef",
  border: "#c0b1f030",
  accent: "#9ed7d5",
  buttonHeight: 26,
  menuHeight: 27,
} as const;

export function actionButton(id: string, label: string): NativeElement {
  return Button.new(id)
    .accessibility_label(label)
    .h(ui.buttonHeight)
    .min_w(64)
    .px(10)
    .flex_shrink_0()
    .justify_center()
    .rounded(4)
    .border_1()
    .border_color(ui.border)
    .bg("#c0b1f008")
    .text_color(ui.foreground)
    .text_size(12);
}

export function dialogActions(): NativeElement {
  return div().w_full().flex().items_center().justify_end().gap(8).pt(4);
}

export function menuSurface(
  id: string,
  label: string,
  width = 180,
): NativeElement {
  return div()
    .id(id)
    .role("menu")
    .accessibility_label(label)
    .flex()
    .flex_col()
    .w(width)
    .p(4)
    .rounded(6)
    .border_1()
    .border_color(ui.border)
    .bg(ui.background)
    .text_color(ui.foreground);
}

export function menuButton(id: string, label: string): NativeElement {
  return Button.new(id)
    .role("menu_item")
    .accessibility_label(label)
    .h(ui.menuHeight)
    .px(9)
    .justify_start()
    .rounded(3)
    .text_size(12);
}

export function disclosureButton(id: string, label: string): NativeElement {
  return Button.new(id)
    .accessibility_label(label)
    .tooltip(label)
    .w(ui.buttonHeight)
    .h(ui.buttonHeight)
    .p(0)
    .justify_center()
    .rounded(4)
    .border_1()
    .border_color(ui.border)
    .child(div().text_size(16).line_height(1).child("▾"));
}

export function toggle(
  id: string,
  label: string,
  checked: boolean,
  changed: (checked: boolean, cx: Context) => void,
): NativeElement {
  return Switch.new(id)
    .accessibility_label(label)
    .w(24)
    .h(14)
    .px(2)
    .flex()
    .items_center()
    .justify_start()
    .rounded_full()
    .bg(checked ? ui.accent : "#747b843d")
    .child(
      div()
        .size(10)
        .rounded_full()
        .bg(checked ? "#14171c" : "#c4c8cd")
        .ml(checked ? 10 : 0),
    )
    .checked(checked)
    .on_change(changed);
}
