import { View, div } from "gpui-kit";
import { Popover, TextView } from "gpui-base";
import {
  actionButton,
  disclosureButton,
  menuButton,
  menuSurface,
  toggle,
} from "./ui.js";
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
  declare menu: boolean;

  init(): void {
    this.session = SessionState.new();
    this.title = TitleState.new();
    this.text = BodyState.new();
    this.preview = false;
    this.showFiles = false;
    this.menu = false;
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
          .items_center()
          .gap(8)
          .flex_shrink_0()
          .child(
            Popover.new("notes-file-menu")
              .open(this.menu)
              .on_open_change((open, cx) => {
                this.menu = open;
                if (!open) this.showFiles = false;
                cx.notify();
              })
              .trigger(
                disclosureButton("notes-menu", "Note files").tooltip(
                  "New, open or exit a note",
                ),
              )
              .content(
                div()
                  .flex()
                  .gap(6)
                  .child(
                    menuSurface("note-actions", "Note files", 112)
                      .child(
                        menuButton("notes-new", "New note")
                          .w_full()
                          .child("New")
                          .on_click((_event, cx) => {
                            this.session.new_note();
                            this.menu = false;
                            this.showFiles = false;
                            this.preview = false;
                            cx.notify();
                          }),
                      )
                      .child(
                        menuButton("notes-open", "Open note")
                          .w_full()
                          .child("Open")
                          .on_click((_event, cx) => {
                            this.showFiles = true;
                            this.session.list_notes();
                            cx.notify();
                          }),
                      )
                      .child(
                        menuButton("notes-exit", "Exit note")
                          .w_full()
                          .child("Exit")
                          .on_click((_event, cx) => {
                            this.session.exit_note();
                            this.menu = false;
                            this.showFiles = false;
                            cx.notify();
                          }),
                      ),
                  )
                  .children(
                    this.showFiles
                      ? [
                          menuSurface("note-open-files", "Saved notes", 220)
                            .max_h(240)
                            .overflow_y_scroll()
                            .children(
                              this.session.filenames().map((filename) =>
                                menuButton(
                                  "notes-file-" + filename,
                                  "Open " + filename,
                                )
                                  .w_full()
                                  .tooltip(filename)
                                  .child(div().truncate().child(filename))
                                  .on_click((_event, cx) => {
                                    this.session.open_note(filename);
                                    this.menu = false;
                                    this.showFiles = false;
                                    cx.notify();
                                  }),
                              ),
                            )
                            .children(
                              this.session.filenames().length
                                ? []
                                : [
                                    div()
                                      .p(8)
                                      .text_size(11)
                                      .child("No Markdown files"),
                                  ],
                            ),
                        ]
                      : [],
                  ),
              ),
          )
          .child(
            toggle(
              "notes-preview",
              this.preview ? "Edit note" : "Preview note",
              this.preview,
              (checked, cx) => {
                this.preview = checked;
                cx.notify();
              },
            ).tooltip(
              this.preview
                ? "Preview on. Turn off to edit."
                : "Preview off. Turn on to preview.",
            ),
          ),
      )
      .children(
        this.session.filename()
          ? []
          : [
              actionButton("notes-migrate", "Convert legacy note to Markdown")
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
          .role("label")
          .flex_shrink_0()
          .text_size(11)
          .text_color(colors.muted)
          .child(this.session.status()),
      );
  }
}
