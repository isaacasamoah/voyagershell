import { View, div } from "gpui-kit";
import { projection } from "voyager_header";
import { invoke } from "./workspace.js";
import { NameState, Name } from "voyager_native";

export default class Workspace extends View {
  init(_props, cx) {
    this.version = "0";
    this.layout = null;
    this.busy = false;
    this.fresh = false;
    this.focus = cx.focus_handle();
    this.names = new Map();
    this.status = "Opening workspace";
    this.run({ operation: "inspect" }, cx);
  }

  run(action, cx, done) {
    if (this.busy) {
      if (this.editing?.saving) {
        if (["select-voyage", "select-fleet"].includes(action.operation))
          this.afterRename = action;
        else this.status = "Wait for the name change to finish.";
        cx.notify();
      }
      return;
    }
    this.busy = true;
    cx.spawn(async (task) => {
      let result = null;
      try {
        result = await invoke(action, this.version);
        this.version = result.version;
        this.layout = result.layout;
        this.fresh = result.fresh;
        this.status = result.message || "";
        const retain = (target, name) => {
          const key = JSON.stringify(target);
          if (!this.names.has(key))
            this.names.set(key, { focus: task.focus_handle(), name });
          else this.names.get(key).name = name;
        };
        for (const voyage of this.layout.voyages) {
          retain({ kind: "voyage", id: voyage.id }, voyage.name);
          for (const portal of voyage.portals)
            retain(
              { kind: "portal", id: portal.id },
              portal.name || "Terminal",
            );
          for (const fleet of voyage.fleets) {
            retain({ kind: "fleet", id: fleet.id }, fleet.name);
            for (const vessel of fleet.vessels)
              retain(
                { kind: "vessel", id: vessel.id },
                vessel.name || "Terminal",
              );
          }
        }
      } catch (error) {
        this.status = error.message;
        this.fresh = false;
      }
      this.busy = false;
      if (done) done(result, task);
      if (result?.status === "applied" && result.fresh) {
        if (this.editing?.pending) {
          this.editing.pending = false;
          this.saveName(this.editing, task);
        } else if (this.afterRename) {
          const next = this.afterRename;
          this.afterRename = null;
          this.run(next, task);
        }
      } else {
        if (this.editing?.pending) {
          this.editing.pending = false;
          this.editing.saving = false;
          this.status += " Rename was not sent.";
        }
        this.afterRename = null;
      }
      task.notify();
    });
    cx.notify();
  }

  closeName(editing, cx) {
    if (this.editing !== editing) return;
    this.editing = null;
    editing.state.release();
    cx.notify();
  }

  saveName(editing, cx) {
    this.run(
      { operation: "rename", target: editing.target, name: editing.name },
      cx,
      (result, cx) => {
        editing.saving = false;
        if (result?.status === "applied") this.closeName(editing, cx);
        else if (!result || result.status === "uncertain")
          editing.unconfirmed = editing.name;
      },
    );
  }

  editName(target, value, cx) {
    if (this.editing) return;
    const state = NameState.new(value);
    const editing = { target, state, saving: false };
    this.editing = editing;
    const finish = (_event, cx) => {
      if (this.editing !== editing || editing.saving) return;
      editing.name = state.value().trim();
      const current = this.names.get(JSON.stringify(target)).name;
      if (!editing.name || editing.name === current) {
        if (!editing.name) this.status = "A name is required.";
        this.closeName(editing, cx);
        return;
      }
      if (editing.name === editing.unconfirmed || !this.fresh) {
        this.status = "Name change not confirmed. Refresh before a new edit.";
        cx.notify();
        return;
      }
      editing.saving = true;
      if (this.busy) editing.pending = true;
      else this.saveName(editing, cx);
    };
    state.on("submit", finish);
    state.on("blur", finish);
    state.focus();
    cx.notify();
  }

  action(label, action, selected = false, rename = null) {
    const colors = projection();
    const key = JSON.stringify(rename);
    const focus = this.names.get(key)?.focus;
    if (
      rename &&
      this.editing &&
      JSON.stringify(rename) === JSON.stringify(this.editing.target)
    )
      return div()
        .min_w(60)
        .h(32)
        .on_mouse_down_out(() => this.focus.focus())
        .child(Name.new(this.editing.state));
    const button = div()
      .role("button")
      .accessibility_label(
        action?.operation === "create-fleet"
          ? "Create Fleet"
          : action?.operation === "split"
            ? "Split Vessel"
            : label,
      )
      .px(12)
      .py(9)
      .rounded(6)
      .text_size(12)
      .text_color(selected ? colors.foreground : colors.muted)
      .bg(selected ? "#23232d" : "#00000000")
      .on_click((event, cx) => {
        if (focus) focus.focus();
        else this.focus.focus();
        if (event.click_count === 2 && rename) this.editName(rename, label, cx);
        else if (action) this.run(action, cx);
      })
      .child(label);
    if (focus)
      button
        .track_focus(focus)
        .tab_stop(true)
        .on_key_down((event, cx) => {
          if (event.key === "f2") {
            this.editName(rename, label, cx);
            cx.stop_propagation();
          }
        });
    return button;
  }

  dock(context) {
    const colors = projection();
    const selected =
      JSON.stringify(context) === JSON.stringify(this.layout.context);
    return div()
      .role("button")
      .accessibility_label(`Dock to ${context.kind}`)
      .w(24)
      .h(24)
      .rounded(12)
      .text_size(13)
      .text_color(selected ? colors.accent : colors.muted)
      .on_click((_event, cx) => this.run({ operation: "dock", context }, cx))
      .child(selected ? "●" : "○");
  }

  pane(tree, fleet) {
    const colors = projection();
    if (tree.kind === "branch") {
      const row = div().flex().flex_1().min_w(0).min_h(0).gap(6);
      if (tree.axis === "vertical") row.flex_col();
      else row.flex_row();
      return row
        .child(this.pane(tree.first, fleet))
        .child(this.pane(tree.second, fleet));
    }
    const placement = fleet.vessels.find((item) => item.id === tree.placement);
    return this.content(
      placement,
      { kind: "vessel", id: placement.id },
      {
        operation: "split",
        fleet: fleet.id,
        after: placement.id,
        axis: "horizontal",
      },
    );
  }

  content(placement, scope, split = null) {
    const colors = projection();
    const content = this.layout.contents.find(
      (item) => item.id === placement.content,
    );
    return div()
      .flex()
      .flex_col()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .rounded(8)
      .bg("#14161a")
      .child(
        div()
          .flex()
          .items_center()
          .px(16)
          .py(10)
          .child(
            div()
              .flex_1()
              .text_size(11)
              .text_color(colors.muted)
              .child(
                this.action(placement.name || "Terminal", null, false, scope),
              ),
          )
          .child(this.dock(scope)),
      )
      .child(
        div()
          .flex_1()
          .p(20)
          .text_size(12)
          .text_color(colors.muted)
          .child(content.cwd)
          .child(
            div().mt(12).child("Terminal connection is the next integration."),
          ),
      )
      .child(
        div()
          .flex()
          .items_center()
          .px(12)
          .py(8)
          .child(div().flex_1())
          .children(split ? [this.action("+", split)] : []),
      );
  }

  render() {
    const colors = projection();
    const shell = div()
      .track_focus(this.focus)
      .on_mouse_down("left", () => {
        if (!this.editing) this.focus.focus();
      })
      .on_key_down((event, cx) => {
        if (event.key === "escape" && this.editing && !this.editing.saving) {
          const focus = this.names.get(
            JSON.stringify(this.editing.target),
          ).focus;
          this.closeName(this.editing, cx);
          focus.focus();
          cx.stop_propagation();
        }
      })
      .flex()
      .w_full()
      .h_full()
      .bg(colors.background)
      .text_color(colors.foreground);
    if (!this.layout?.voyages.length)
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace unavailable")
        .child(this.action("Refresh", { operation: "inspect" }));
    const voyage = this.layout.voyages.find(
      (item) => item.id === this.layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === this.layout.selectedFleet,
    );
    const sidebar = div()
      .flex()
      .flex_col()
      .w(220)
      .p(18)
      .gap(8)
      .bg("#16181c")
      .child(div().text_size(23).child("Voyager"))
      .child(
        div().text_size(11).text_color(colors.muted).child("Let's Go Together"),
      )
      .child(div().h(26))
      .child(
        this.action("Workspace", {
          operation: "dock",
          context: { kind: "workspace" },
        }),
      );
    for (const item of this.layout.voyages) {
      sidebar.child(
        div()
          .flex()
          .items_center()
          .child(
            div()
              .flex_1()
              .child(
                this.action(
                  item.name,
                  { operation: "select-voyage", id: item.id },
                  item.id === voyage?.id,
                  { kind: "voyage", id: item.id },
                ),
              ),
          )
          .child(this.dock({ kind: "voyage", id: item.id })),
      );
    }
    sidebar.child(
      this.action("+ Voyage", {
        operation: "create-voyage",
        name: `Voyage ${this.layout.voyages.length + 1}`,
        cwd: this.layout.contents[0].cwd,
      }),
    );
    sidebar.child(div().flex_1());
    sidebar.child(
      div()
        .text_size(10)
        .text_color(colors.muted)
        .child(`Context: ${this.layout.context.kind}`),
    );
    const body = div().flex().flex_col().flex_1().min_w(0).p(12).gap(10);
    const tabs = div().flex().items_center().gap(6);
    for (const item of voyage?.fleets || []) {
      tabs.child(
        div()
          .flex()
          .items_center()
          .child(
            this.action(
              item.name,
              { operation: "select-fleet", id: item.id },
              item.id === fleet?.id,
              { kind: "fleet", id: item.id },
            ),
          )
          .child(this.dock({ kind: "fleet", id: item.id })),
      );
    }
    if (voyage)
      tabs.child(
        this.action("+", {
          operation: "create-fleet",
          voyage: voyage.id,
          name: `Fleet ${voyage.fleets.length + 1}`,
        }),
      );
    body.child(tabs);
    if (fleet) {
      const area = div()
        .flex()
        .flex_1()
        .min_h(0)
        .gap(8)
        .child(this.pane(fleet.root, fleet));
      if (voyage.portals.length) {
        const portals = div().flex().flex_col().w(340).gap(8);
        for (const placement of voyage.portals)
          portals.child(
            this.content(placement, { kind: "portal", id: placement.id }),
          );
        area.child(portals);
      }
      body.child(area);
    }
    if (voyage)
      sidebar.child(
        this.action("Open Portal", {
          operation: "create-portal",
          voyage: voyage.id,
        }),
      );
    if (this.status) {
      body.child(div().text_size(11).text_color("#ffcad3").child(this.status));
      body.child(this.action("Refresh", { operation: "inspect" }));
    }
    return shell.child(sidebar).child(body);
  }
}
