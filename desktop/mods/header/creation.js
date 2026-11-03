import { div } from "gpui-kit";
import { Button, Popover } from "gpui-base";
import { launches } from "voyager_workspace";
import { descriptions } from "voyager_content_view";
import {
  launchCatalog as validateCatalog,
  contentCatalog as validateContentCatalog,
} from "./validate.js";
export class CreationPicker {
  constructor() {
    this.current = null;
    this.catalog = null;
    this.notes = false;
    this.error = "";
  }
  render(id, destination, version, create) {
    const opening = this.current?.id === id ? this.current : null;
    const content = div()
      .id(`worker-choices-${id}`)
      .flex()
      .flex_col()
      .gap(5)
      .p(8)
      .w(260)
      .max_h(320)
      .overflow_y_scroll()
      .bg("#16181c")
      .text_color("#ded8ef");
    if (opening) {
      if (this.catalog) {
        const entries = [...this.catalog.settings.entries].sort(
          (a, b) =>
            Number(b.id === this.catalog?.settings.default) -
            Number(a.id === this.catalog?.settings.default),
        );
        for (const entry of entries) {
          if (!this.catalog.available.includes(entry.id)) continue;
          const launch = entry.launch;
          const detail =
            launch.kind === "codex"
              ? `${launch.model} · ${launch.effort} · ${launch.permissions}`
              : "";
          content.child(
            Button.new(`create-worker-${entry.id}`)
              .accessibility_label(`Create ${entry.name} Vessel`)
              .justify_start()
              .child(
                entry.name +
                  (entry.id === this.catalog.settings.default
                    ? " (default)"
                    : ""),
              )
              .on_click((_event, cx) => {
                if (this.current !== opening) return;
                this.current = null;
                create(
                  {
                    operation: "create-content",
                    typeId: "terminal",
                    destination: opening.destination,
                    launch,
                  },
                  opening.version,
                  cx,
                );
              }),
          );
          if (detail) content.child(div().text_size(10).child(detail));
        }
        for (const error of this.catalog.errors)
          content.child(div().text_size(10).text_color("#ffcad3").child(error));
        content.child(
          div()
            .text_size(10)
            .child(
              `Worker defaults: ${this.catalog.path || "built in"}. Reopen to reload edits.`,
            ),
        );
      } else if (!this.error && !this.notes)
        content.child(
          div()
            .text_size(11)
            .child(this.error || "Reading worker choices"),
        );
      if (this.notes)
        content.child(
          Button.new("create-notes-vessel")
            .accessibility_label("Create Notes Vessel")
            .justify_start()
            .child("Notes")
            .on_click((_event, cx) => {
              if (this.current !== opening) return;
              this.current = null;
              create(
                {
                  operation: "create-content",
                  typeId: "notes",
                  destination: opening.destination,
                },
                opening.version,
                cx,
              );
            }),
        );
      if (this.error)
        content.child(
          div().text_size(10).text_color("#ffcad3").child(this.error),
        );
    }
    return Popover.new(`worker-picker-${id}`)
      .open(Boolean(opening))
      .on_open_change((open, cx) => {
        if (!open) {
          if (this.current?.id === id) this.current = null;
          cx.notify();
          return;
        }
        const requested = { id, version, destination };
        this.current = requested;
        this.catalog = null;
        this.notes = false;
        this.error = "";
        cx.spawn(async (task) => {
          const results = await Promise.allSettled([
            launches(),
            descriptions(),
          ]);
          if (this.current !== requested) return;
          for (const [index, result] of results.entries()) {
            try {
              if (result.status === "rejected") throw result.reason;
              const value = JSON.parse(result.value);
              if (index === 0) {
                if (!validateCatalog(value))
                  throw Error("Invalid worker choices from the application");
                this.catalog = value;
              } else {
                if (!validateContentCatalog(value))
                  throw Error("Invalid content choices from the application");
                this.notes = value.types.some(
                  (kind) => kind.typeId === "notes" && Boolean(kind.state),
                );
              }
            } catch (error) {
              this.error +=
                (this.error ? "\n" : "") +
                (error instanceof Error ? error.message : String(error));
            }
          }
          task.notify();
        });
        cx.notify();
      })
      .trigger(
        Button.new(`new-vessel-${id}`)
          .accessibility_label("Create Vessel")
          .w(24)
          .h(28)
          .child("+"),
      )
      .content(content);
  }
}
