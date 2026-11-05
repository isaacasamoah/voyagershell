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
import type { NativeElement } from "gpui-kit";

export default class Notes extends View {
  declare session: ReturnType<typeof SessionState.new>;
  declare title: ReturnType<typeof TitleState.new>;
  declare text: ReturnType<typeof BodyState.new>;
  declare preview: boolean;
  declare showFiles: boolean;

  init(): void {
    this.session = SessionState.new();
    this.title = TitleState.new();
    this.text = BodyState.new();
    this.preview = false;
    this.showFiles = false;
  }

  render(): NativeElement {
    const colors = theme();
    return div()
      .flex()
      .flex_col()
      .w_full()
      .h_full()
      .min_h(0)
      .p(24)
      .text_color(colors.foreground)
      .child(
        div()
          .flex()
          .children([
            Button.new("notes-new")
              .accessibility_label("New note")
              .child("New")
              .on_click((_event, cx) => {
                this.session.new_note();
                this.showFiles = false;
                cx.notify();
              }),
            Button.new("notes-open")
              .accessibility_label("Open note")
              .child("Open")
              .on_click((_event, cx) => {
                this.showFiles = !this.showFiles;
                if (this.showFiles) this.session.list_notes();
                cx.notify();
              }),
          ]),
      )
      .children(
        this.showFiles
          ? this.session.filenames().map((filename) =>
              Button.new("notes-file-" + filename)
                .accessibility_label("Open " + filename)
                .child(filename)
                .on_click((_event, cx) => {
                  this.session.open_note(filename);
                  this.showFiles = false;
                  cx.notify();
                }),
            )
          : [],
      )
      .children(
        this.session.filename()
          ? []
          : [
              Button.new("notes-migrate")
                .accessibility_label("Convert legacy note to Markdown")
                .child("Convert to Markdown")
                .on_click((_event, cx) => {
                  this.session.migrate_note();
                  cx.notify();
                }),
            ],
      )
      .child(
        div()
          .text_size(10)
          .text_color(colors.muted)
          .child(this.session.filename()),
      )
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
      .child(Title.new(this.title).w_full().flex_shrink_0().py(8).text_size(20))
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
