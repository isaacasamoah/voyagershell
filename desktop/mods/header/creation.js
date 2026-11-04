import { div } from "gpui-kit";
import { Popover } from "gpui-base";
import { menuButton, menuSurface } from "./menu.js";
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
    this.agents = false;
    this.hidden = [];
    this.expanded = false;
    this.error = "";
  }
  open(id, destination, version, cx, hidden = async () => ({ panels: [] })) {
    const requested = { id, version, destination };
    this.current = requested;
    this.catalog = null;
    this.notes = false;
    this.agents = false;
    this.hidden = [];
    this.expanded = false;
    this.error = "";
    cx.spawn(async (task) => {
      const results = await Promise.allSettled([
        launches(),
        descriptions(),
        hidden(),
      ]);
      if (this.current !== requested) return;
      for (const [index, result] of results.entries()) {
        try {
          if (result.status === "rejected") throw result.reason;
          if (index === 2) {
            const hidden = result.value;
            this.hidden = hidden.panels;
            if (hidden.error)
              this.error += (this.error ? "\n" : "") + hidden.error;
            continue;
          }
          const value = JSON.parse(result.value);
          if (index === 0) {
            if (!validateCatalog(value))
              throw Error("Invalid worker choices from the application");
            this.catalog = value;
          } else {
            if (!validateContentCatalog(value))
              throw Error("Invalid content choices from the application");
            this.agents = value.types.some(
              (kind) =>
                kind.typeId === "agents" &&
                kind.availability.status === "ready",
            );
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
  }
  render(
    id,
    destination,
    version,
    create,
    trigger,
    hidden = async () => ({ panels: [] }),
    triggerOpens = true,
  ) {
    const opening = this.current?.id === id ? this.current : null;
    const entity = destination.owner.kind === "portals" ? "Portal" : "Vessel";
    const content = menuSurface(`worker-choices-${id}`, "Content choices")
      .max_h(320)
      .overflow_y_scroll();
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
          content.child(
            menuButton(
              `create-worker-${entry.id}`,
              `Create ${entry.name} ${entity}`,
            )
              .child(entry.name)
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
        }
        for (const error of this.catalog.errors)
          content.child(div().text_size(10).text_color("#ffcad3").child(error));
      } else if (!this.error && !this.notes)
        content.child(
          div()
            .text_size(11)
            .child(this.error || "Loading choices"),
        );
      if (this.notes)
        content.child(
          menuButton("create-notes-vessel", `Create Notes ${entity}`)
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
      if (this.agents)
        content.child(
          menuButton("create-agents-vessel", `Create Agents ${entity}`)
            .child("Agents")
            .on_click((_event, cx) => {
              if (this.current !== opening) return;
              this.current = null;
              create(
                {
                  operation: "create-content",
                  typeId: "agents",
                  destination: opening.destination,
                },
                opening.version,
                cx,
              );
            }),
        );
      if (this.hidden.length)
        content.child(
          menuButton("hidden-vessels", "Hidden vessels")
            .child(
              `${this.expanded ? "⌄" : "›"} Hidden vessels (${this.hidden.length})`,
            )
            .on_click((_event, cx) => {
              this.expanded = !this.expanded;
              cx.notify();
            }),
        );
      if (this.expanded)
        for (const panel of this.hidden)
          content.child(
            menuButton(
              `reopen-${panel.id}`,
              `Reopen ${panel.name}${this.hidden.filter((item) => item.name === panel.name).length > 1 ? ` in ${panel.path}` : ""}`,
            )
              .tooltip(panel.path)
              .child(
                div()
                  .flex()
                  .flex_col()
                  .gap(2)
                  .child(panel.name)
                  .child(div().text_size(9).child(panel.path)),
              )
              .on_click((_event, cx) => {
                if (this.current !== opening) return;
                this.current = null;
                create(
                  {
                    operation: "reopen-panel",
                    id: panel.id,
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
        if (triggerOpens && this.current?.id !== id)
          this.open(id, destination, version, cx, hidden);
        else cx.notify();
      })
      .trigger(trigger)
      .content(content);
  }
}
