import { View, div } from "gpui-kit";
import { Button, TextView } from "gpui-base";
import {
  SessionState,
  RetainedTitleState as TitleState,
  RetainedTitle as Title,
  RetainedBodyState as BodyState,
  RetainedBody as Body,
} from "voyager_input";
import { theme } from "voyager_content";
export default class Notes extends View {
  init() {
    this.session = SessionState.new();
    this.title = TitleState.new();
    this.text = BodyState.new();
    this.preview = false;
  }
  render() {
    const colors = theme();
    return div()
      .flex()
      .flex_col()
      .w_full()
      .h_full()
      .min_h(0)
      .p(24)
      .bg(colors.background)
      .text_color(colors.foreground)
      .children(
        this.session.show_heading()
          ? [div().text_size(9).text_color("#92939e").child("NOTES")]
          : [],
      )
      .child(Title.new(this.title).w_full().flex_shrink_0().py(8).text_size(20))
      .child(
        Button.new("notes-preview")
          .accessibility_label(this.preview ? "Edit note" : "Preview note")
          .px(8)
          .py(4)
          .rounded(4)
          .flex_shrink_0()
          .text_size(11)
          .text_color(colors.muted)
          .on_click((_event, cx) => {
            this.preview = !this.preview;
            cx.notify();
          })
          .child(this.preview ? "Edit" : "Preview"),
      )
      .child(
        this.preview
          ? TextView.markdown("notes-preview-body", this.text.value())
              .w_full()
              .flex_1()
              .min_h(0)
              .py(16)
              .selectable()
              .scrollable()
          : Body.new(this.text).w_full().flex_1().min_h(0).py(16).text_size(13),
      )
      .child(
        div()
          .flex_shrink_0()
          .text_size(11)
          .text_color(colors.muted)
          .child(this.session.status()),
      );
  }
}
