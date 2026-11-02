import { View, div } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { invoke, openTerminal } from "./workspace.js";
import { NameState, Name, ArrangementCapture } from "voyager_native";
import { Terminal, TerminalState } from "voyager_native";
import { Chat } from "./chat.js";
import { Notes } from "voyager_content_view";
import { homeOverview } from "./home.js";
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
export default class Workspace extends View {
  init(_props, cx) {
    this.chat = new Chat(cx, () => {
      this.refreshRequested = true;
      if (!this.busy) this.run({ operation: "inspect" }, cx);
    });
    this.version = "0";
    this.layout = null;
    this.busy = false;
    this.fresh = false;
    this.focus = cx.focus_handle();
    this.names = new Map();
    this.refreshRequested = false;
    this.status = "Opening workspace";
    this.terminals = new Map();
    this.openings = new Map();
    this.focused = null;
    this.splitHover = null;
    this.pendingShortcuts = [];
    this.drag = null;
    this.run({ operation: "inspect" }, cx);
  }
  run(action, cx, done) {
    this.drag = null;
    if (this.busy) {
      if (action.operation === "save-layout" && this.savingLayout) {
        this.pendingLayout = action;
      } else if (this.editing?.saving || this.savingLayout) {
        if (
          ["home", "select-voyage", "select-fleet"].includes(action.operation)
        )
          this.afterRename = action;
        else this.status = "Wait for the name change to finish.";
        cx.notify();
      }
      return;
    }
    if (action.operation === "inspect") this.refreshRequested = false;
    const changesSelection = [
      "create-fleet",
      "select-fleet",
      "create-voyage",
      "select-voyage",
    ].includes(action.operation);
    const oldLayout = this.layout;
    const oldVoyage = oldLayout?.voyages.find(
      (item) => item.id === oldLayout.selectedVoyage,
    );
    const oldFleet = oldVoyage?.fleets.find(
      (item) => item.id === oldLayout?.selectedFleet,
    );
    const transferFocus =
      changesSelection &&
      this.visibleVessels(oldFleet).some(
        (vessel) =>
          this.terminals.get(vessel.content)?.rememberFocus() === true,
      );
    this.busy = true;
    const previousContents = new Set(
      this.layout?.contents?.map((item) => item.id) || [],
    );
    cx.spawn(async (task) => {
      let result = null;
      let prepared = false;
      try {
        result = await invoke(action, this.version);
        this.acceptSnapshot(result, task);
        const retry = new Set();
        if (
          action.operation === "inspect" &&
          result.status === "applied" &&
          result.fresh
        ) {
          for (const [content, outcome] of this.openings)
            if (outcome.status === "rejected") {
              this.openings.delete(content);
              retry.add(content);
            }
        }
        if (result.status === "applied" && result.fresh) {
          try {
            const creates = [
              "create-voyage",
              "create-fleet",
              "create-portal",
              "split",
            ].includes(action.operation);
            const allowed = new Set(result.createdContents);
            if (creates)
              for (const item of result.layout.contents)
                if (!previousContents.has(item.id)) allowed.add(item.id);
            await this.prepare(task, !result.createdWorkspace, retry, allowed);
            prepared = true;
            if (transferFocus) {
              const current = this.layout;
              const voyage = current?.voyages.find(
                (item) => item.id === current.selectedVoyage,
              );
              const fleet = voyage?.fleets.find(
                (item) => item.id === current?.selectedFleet,
              );
              const target = this.visibleVessels(fleet)[0];
              if (target)
                this.terminals.get(target.content)?.focusIfUnchanged();
            }
          } catch (error) {
            this.status = errorMessage(error);
          }
        }
      } catch (error) {
        this.status = errorMessage(error);
        this.fresh = false;
      }
      this.busy = false;
      if (done) done(result, task);
      if (result?.status === "applied" && this.fresh) {
        if (this.pendingLayout) {
          const next = this.pendingLayout;
          this.pendingLayout = null;
          this.run(next, task, () => {
            this.savingLayout = false;
          });
        } else if (this.editing?.pending) {
          this.editing.pending = false;
          this.saveName(this.editing, task);
        } else if (this.afterRename) {
          const next = this.afterRename;
          this.afterRename = null;
          this.run(next, task);
        }
      } else {
        if (this.pendingLayout) {
          this.pendingLayout = null;
          this.savingLayout = false;
          this.status += " Layout was not saved.";
        }
        if (this.editing?.pending) {
          this.editing.pending = false;
          this.editing.saving = false;
          this.status += " Rename was not sent.";
        }
        this.afterRename = null;
      }
      task.notify();
      if (!prepared) this.pendingShortcuts = [];
      if (!this.busy && this.refreshRequested)
        this.run({ operation: "inspect" }, task);
      else if (!this.busy) this.flushShortcuts(task, prepared);
    });
    cx.notify();
  }
  acceptSnapshot(result, task) {
    this.drag = null;
    this.version = result.version;
    this.layout = result.layout;
    this.fresh = result.fresh;
    this.status = result.message || "";
    const retain = (target, name) => {
      const key = JSON.stringify(target);
      const retained = this.names.get(key);
      if (retained) retained.name = name;
      else this.names.set(key, { focus: task.focus_handle(), name });
    };
    for (const voyage of this.layout.voyages) {
      retain({ kind: "voyage", id: voyage.id }, voyage.name);
      for (const portal of voyage.portals)
        retain({ kind: "portal", id: portal.id }, this.contentName(portal));
      for (const fleet of voyage.fleets) {
        retain({ kind: "fleet", id: fleet.id }, fleet.name);
        for (const vessel of fleet.vessels)
          retain({ kind: "vessel", id: vessel.id }, this.contentName(vessel));
      }
    }
  }
  contentName(placement) {
    const type = this.layout?.contents.find(
      (content) => content.id === placement.content,
    )?.typeId;
    return placement.name || (type === "notes" ? "Notes" : "Terminal");
  }
  visibleVessels(fleet) {
    if (!fleet) return [];
    if (!fleet.root) return fleet.vessels;
    const visible = new Set();
    const collect = (tree) => {
      if (tree.kind === "leaf") visible.add(tree.placement);
      else {
        collect(tree.first);
        collect(tree.second);
      }
    };
    collect(fleet.root);
    return fleet.vessels.filter((vessel) => visible.has(vessel.id));
  }
  async prepare(
    task,
    existingOnly = false,
    retry = new Set(),
    allowed = new Set(),
  ) {
    const layout = this.layout;
    if (!layout) throw Error("Workspace snapshot is unavailable.");
    if (layout.view === "home") return;
    const voyage = layout.voyages.find(
      (item) => item.id === layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === layout.selectedFleet,
    );
    const errors = [];
    for (const vessel of [
      ...this.visibleVessels(fleet),
      ...(voyage?.portals || []),
    ]) {
      const content = layout.contents.find(
        (item) => item.id === vessel.content,
      );
      if (content?.typeId !== "terminal") continue;
      if (
        content?.backend &&
        !content.startPending &&
        this.openings.get(vessel.content)?.status === "unbound"
      )
        this.openings.delete(vessel.content);
      if (
        existingOnly &&
        (!content?.backend || content.startPending) &&
        !retry.has(vessel.content) &&
        !allowed.has(vessel.content)
      ) {
        if (!this.openings.has(vessel.content))
          this.openings.set(vessel.content, { status: "unbound" });
        continue;
      }
      if (this.openings.has(vessel.content)) continue;
      this.openings.set(vessel.content, { status: "pending" });
      let opened;
      try {
        opened = await openTerminal(vessel.content, this.version);
      } catch (error) {
        this.openings.set(vessel.content, {
          status: "uncertain",
          message: errorMessage(error),
        });
        this.fresh = false;
        throw error;
      }
      this.openings.set(vessel.content, opened);
      if (opened.status === "applied")
        this.terminals.set(vessel.content, TerminalState.new(vessel.content));
      const current = await invoke({ operation: "inspect" }, this.version);
      this.acceptSnapshot(current, task);
      if (current.status !== "applied" || !current.fresh)
        throw Error(
          this.status ||
            "Workspace refresh is unconfirmed after the terminal request.",
        );
      if (opened.status !== "applied")
        errors.push(opened.message || opened.status);
      task.notify();
    }
    if (errors.length) throw Error(errors[0]);
  }
  terminalStatus(content) {
    if (content.startPending)
      return "Terminal start is unconfirmed. Inspect before trying again.";
    const outcome = this.openings.get(content.id);
    if (outcome?.status === "rejected")
      return `Terminal unavailable: ${outcome.message || "Request refused"}`;
    if (outcome?.status === "uncertain")
      return `Terminal connection is unconfirmed: ${outcome.message || "No confirmation received"}`;
    if (outcome?.status === "applied")
      return "Terminal attached. View unavailable.";
    if (outcome?.status === "unbound") return "No terminal is bound.";
    if (!content.backend && !outcome) return "No terminal is bound.";
    return "Connecting terminal";
  }
  closeName(editing, cx) {
    if (this.editing !== editing) return;
    this.editing = null;
    editing.state.release();
    cx.notify();
  }
  saveName(editing, cx) {
    if (editing.name === undefined) throw Error("No submitted name.");
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
      const retained = this.names.get(JSON.stringify(target));
      if (!retained) throw Error("Rename target has no retained name.");
      const current = retained.name;
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
  startDrag(kind, id, event, cx) {
    if (this.busy || this.editing || !this.layout) return;
    this.drag = {
      kind,
      id,
      version: this.version,
      voyage: this.layout.selectedVoyage,
      fleet: this.layout.selectedFleet,
      x: event.position.x,
      y: event.position.y,
      moved: false,
    };
    cx.notify();
  }
  moveDrag(x, y, cx) {
    if (
      this.drag &&
      !this.drag.moved &&
      Math.hypot(x - this.drag.x, y - this.drag.y) > 7
    ) {
      this.focus.focus();
      this.drag.moved = true;
      cx.notify();
    }
  }
  targetDrag(kind, id, event, cx) {
    if (!this.drag?.moved || this.drag.kind !== kind || this.drag.id === id)
      return;
    const { x, y, width, height } = event.bounds;
    if (width <= 0 || height <= 0) return;
    let side;
    if (kind === "vessel") {
      const distances = [
        (event.position.x - x) / width,
        1 - (event.position.x - x) / width,
        (event.position.y - y) / height,
        1 - (event.position.y - y) / height,
      ];
      side = ["left", "right", "top", "bottom"][
        distances.indexOf(Math.min(...distances))
      ];
    } else {
      side =
        kind === "voyage"
          ? event.position.y < y + height / 2
          : event.position.x < x + width / 2;
    }
    if (this.drag.target !== id || this.drag.side !== side) {
      Object.assign(this.drag, {
        target: id,
        side,
        bounds: { x, y, width, height },
      });
      cx.notify();
    } else this.drag.bounds = { x, y, width, height };
  }
  finishDrag(x, y, cx) {
    if (!this.drag) return;
    const { kind, id, moved, target, side, bounds, version, voyage, fleet } =
      this.drag;
    this.drag = null;
    if (
      moved &&
      version === this.version &&
      voyage === this.layout?.selectedVoyage &&
      fleet === this.layout?.selectedFleet &&
      target &&
      bounds &&
      ((kind === "vessel" && typeof side === "string") ||
        (kind !== "vessel" && typeof side === "boolean")) &&
      x >= bounds.x &&
      x < bounds.x + bounds.width &&
      y >= bounds.y &&
      y < bounds.y + bounds.height
    ) {
      this.run(
        kind === "vessel" && typeof side === "string"
          ? { operation: "move-vessel", id, target, side }
          : {
              operation: kind === "voyage" ? "move-voyage" : "move-fleet",
              id,
              target,
              before: side === true,
            },
        cx,
      );
    }
    cx.notify();
  }
  shortcut(event, cx) {
    if (this.editing || this.layoutName) return;
    const { control, shift, alt, platform } = event.modifiers;
    if (
      (!control && !platform) ||
      (control && platform) ||
      !shift ||
      alt ||
      event.modifiers.function
    )
      return;
    const key = event.key.toLowerCase();
    if (!["o", "e", "t"].includes(key)) return;
    if (this.busy) {
      this.pendingShortcuts.push(key);
      cx.stop_propagation();
      return;
    }
    this.dispatchShortcut(key, cx);
    cx.stop_propagation();
  }
  flushShortcuts(cx, applied) {
    if (!applied) this.pendingShortcuts = [];
    const key = this.pendingShortcuts.shift();
    if (key) this.dispatchShortcut(key, cx);
  }
  dispatchShortcut(key, cx) {
    const layout = this.layout;
    const voyage = layout?.voyages.find(
      (item) => item.id === layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === layout?.selectedFleet,
    );
    if (!voyage || !fleet) return;
    if (key === "t") {
      this.run(
        {
          operation: "create-fleet",
          voyage: voyage.id,
          name: `Fleet ${voyage.fleets.length + 1}`,
        },
        cx,
      );
    } else {
      const visible = this.visibleVessels(fleet);
      const vessel =
        visible.find((item) => item.id === this.focused) || visible[0];
      if (!vessel) return;
      this.run(
        {
          operation: "split",
          fleet: fleet.id,
          after: vessel.id,
          axis: key === "o" ? "horizontal" : "vertical",
        },
        cx,
      );
    }
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
    const button = (
      rename && ["voyage", "fleet"].includes(rename.kind)
        ? Button.new(`navigation-${rename.kind}-${rename.id}`)
            .justify_start()
            .line_height(1.618034)
        : div()
    )
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
        else if (!["create-fleet", "inspect"].includes(action?.operation || ""))
          this.focus.focus();
        if (event.click_count === 2 && rename) this.editName(rename, label, cx);
        else if (action) this.run(action, cx);
      })
      .child(label);
    if (["create-fleet", "inspect"].includes(action?.operation || ""))
      button.on_mouse_down("left", (_event, cx) => cx.stop_propagation());
    if (focus)
      button
        .track_focus(focus)
        .tab_stop(true)
        .on_key_down((event, cx) => {
          if (event.key === "f2" && rename) {
            this.editName(rename, label, cx);
            cx.stop_propagation();
          }
        });
    return button;
  }
  saveLayout(fleet, cx) {
    if (this.layoutName || this.savingLayout) return;
    const state = NameState.new("");
    const editing = { state, fleet, submitted: false };
    this.layoutName = editing;
    const finish = (_event, task) => {
      if (this.layoutName !== editing || editing.submitted) return;
      editing.submitted = true;
      const name = state.value().trim();
      this.layoutName = null;
      state.release();
      if (name) {
        this.savingLayout = true;
        this.run({ operation: "save-layout", fleet, name }, task, () => {
          this.savingLayout = false;
        });
      } else this.status = "A layout name is required.";
      task.notify();
    };
    state.on("submit", finish);
    state.on("blur", finish);
    state.focus();
    cx.notify();
  }
  layoutControls(fleet) {
    const controls = div().flex().flex_col().gap(4);
    if (this.layoutName?.fleet === fleet.id) {
      controls.child(Name.new(this.layoutName.state));
    } else {
      controls.child(
        Button.new(`save-layout-${fleet.id}`)
          .accessibility_label("Save Fleet layout")
          .child("Save layout")
          .on_click((_event, cx) => this.saveLayout(fleet.id, cx)),
      );
    }
    for (const saved of this.layout?.savedLayouts || []) {
      if (saved.fleet !== fleet.id) continue;
      controls.child(
        Button.new(`load-layout-${fleet.id}-${saved.name}`)
          .accessibility_label(`Load ${saved.name}`)
          .child(saved.name)
          .on_click((_event, cx) =>
            this.run(
              { operation: "load-layout", fleet: fleet.id, name: saved.name },
              cx,
            ),
          ),
      );
    }
    return controls;
  }
  dock(context) {
    const colors = projection();
    const layout = this.layout;
    if (!layout) throw Error("Workspace snapshot is unavailable.");
    const selected = JSON.stringify(context) === JSON.stringify(layout.context);
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
    if (!placement) throw Error("Split placement is unavailable.");
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
    const content = this.layout?.contents.find(
      (item) => item.id === placement.content,
    );
    if (!content) throw Error("Placement content is unavailable.");
    const terminal = this.terminals.get(content.id);
    return div()
      .relative()
      .flex()
      .flex_col()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .rounded(8)
      .border_1()
      .border_color(
        this.drag?.kind === "vessel" &&
          (this.drag.id === placement.id || this.drag.target === placement.id)
          ? "#b3d2e5"
          : "#00000000",
      )
      .bg("#14161a")
      .on_mouse_down("left", () => {
        if (scope.kind === "vessel") this.focused = placement.id;
      })
      .on_mouse_move((event, cx) => {
        if (scope.kind === "vessel")
          this.targetDrag("vessel", placement.id, event, cx);
      })
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
              .on_mouse_down("left", (event, cx) => {
                if (scope.kind === "vessel")
                  this.startDrag("vessel", placement.id, event, cx);
              })
              .child(
                this.action(this.contentName(placement), null, false, scope),
              ),
          )
          .children(
            split
              ? [
                  div()
                    .id(`split-zone-${placement.id}`)
                    .w(90)
                    .h(32)
                    .flex()
                    .items_center()
                    .on_hover((hovered, cx) => {
                      this.splitHover = hovered ? placement.id : null;
                      cx.notify();
                    })
                    .children(
                      this.splitHover === placement.id
                        ? [
                            Button.new(`split-horizontal-${placement.id}`)
                              .accessibility_label(
                                "Split this Vessel side by side",
                              )
                              .child("◫")
                              .on_click((_event, cx) =>
                                this.run({ ...split, axis: "horizontal" }, cx),
                              ),
                            Button.new(`split-vertical-${placement.id}`)
                              .accessibility_label(
                                "Split this Vessel top and bottom",
                              )
                              .child("⬒")
                              .on_click((_event, cx) =>
                                this.run({ ...split, axis: "vertical" }, cx),
                              ),
                          ]
                        : [],
                    ),
                ]
              : [],
          )
          .child(this.dock(scope)),
      )
      .child(
        div()
          .flex_1()
          .min_h(0)
          .child(
            content.typeId === "notes"
              ? Notes.new(content.id, { contentId: content.id })
              : terminal
                ? Terminal.new(terminal).size_full()
                : div()
                    .p(20)
                    .text_size(12)
                    .text_color(colors.muted)
                    .child(this.terminalStatus(content)),
          ),
      )
      .children(
        this.drag?.kind === "vessel" &&
          this.drag.target === placement.id &&
          this.drag.bounds
          ? [
              div()
                .absolute()
                .left(
                  this.drag.side === "right" ? this.drag.bounds.width / 2 : 0,
                )
                .top(
                  this.drag.side === "bottom" ? this.drag.bounds.height / 2 : 0,
                )
                .w(
                  this.drag.side === "left" || this.drag.side === "right"
                    ? this.drag.bounds.width / 2
                    : this.drag.bounds.width,
                )
                .h(
                  this.drag.side === "top" || this.drag.side === "bottom"
                    ? this.drag.bounds.height / 2
                    : this.drag.bounds.height,
                )
                .bg("#b3d2e525"),
            ]
          : [],
      );
  }
  render() {
    const colors = projection();
    const shell = div()
      .track_focus(this.focus)
      .on_key_down((event, cx) => {
        if (event.key === "escape" && this.drag) {
          this.drag = null;
          cx.notify();
          cx.stop_propagation();
          return;
        }
        if (event.key === "escape" && this.layoutName) {
          const { state } = this.layoutName;
          this.layoutName = null;
          state.release();
          cx.notify();
          cx.stop_propagation();
          return;
        }
        if (event.key === "escape" && this.editing && !this.editing.saving) {
          const retained = this.names.get(JSON.stringify(this.editing.target));
          if (!retained) throw Error("Rename target has no retained focus.");
          const focus = retained.focus;
          this.closeName(this.editing, cx);
          focus.focus();
          cx.stop_propagation();
          return;
        }
        this.shortcut(event, cx);
      })
      .relative()
      .flex()
      .w_full()
      .h_full()
      .bg(colors.background)
      .text_color(colors.foreground);
    const layout = this.layout;
    if (!layout?.voyages.length)
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace unavailable")
        .child(this.action("Refresh", { operation: "inspect" }));
    const voyage = layout.voyages.find(
      (item) => item.id === layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === layout.selectedFleet,
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
      .child(this.chat.toggleView(colors))
      .child(div().h(26))
      .child(
        Button.new("home-navigation")
          .accessibility_label("Home")
          .child("Home")
          .on_click((_event, cx) => this.run({ operation: "home" }, cx)),
      )
      .child(
        this.action("Workspace", {
          operation: "dock",
          context: { kind: "workspace" },
        }),
      );
    for (const item of layout.voyages) {
      sidebar.child(
        div()
          .relative()
          .flex()
          .items_center()
          .border_1()
          .border_color(
            this.drag?.kind === "voyage" &&
              (this.drag.id === item.id || this.drag.target === item.id)
              ? "#b3d2e5"
              : "#00000000",
          )
          .on_mouse_down("left", (event, cx) =>
            this.startDrag("voyage", item.id, event, cx),
          )
          .on_mouse_move((event, cx) =>
            this.targetDrag("voyage", item.id, event, cx),
          )
          .children(
            this.drag?.kind === "voyage" &&
              this.drag.target === item.id &&
              this.drag.bounds
              ? [
                  div()
                    .absolute()
                    .left(0)
                    .top(this.drag.side ? 0 : this.drag.bounds.height - 2)
                    .w(this.drag.bounds.width)
                    .h(2)
                    .bg("#b3d2e5"),
                ]
              : [],
          )
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
        name: `Voyage ${layout.voyages.length + 1}`,
        cwd: layout.contents[0].cwd,
      }),
    );
    sidebar.child(div().flex_1());
    sidebar.child(
      div()
        .text_size(10)
        .text_color(colors.muted)
        .child(`Context: ${layout.context.kind}`),
    );
    const body = div().flex().flex_col().flex_1().min_w(0).p(12).gap(10);
    if (layout.view === "home") {
      body.child(homeOverview(layout, (action, cx) => this.run(action, cx)));
      shell.child(sidebar).child(body);
      const chat = this.chat.render(colors, layout.context);
      if (chat) shell.child(chat);
      return shell;
    }
    const tabs = div().flex().items_center().gap(6);
    for (const item of voyage?.fleets || []) {
      tabs.child(
        div()
          .relative()
          .flex()
          .items_center()
          .border_1()
          .border_color(
            this.drag?.kind === "fleet" &&
              (this.drag.id === item.id || this.drag.target === item.id)
              ? "#b3d2e5"
              : "#00000000",
          )
          .on_mouse_down("left", (event, cx) =>
            this.startDrag("fleet", item.id, event, cx),
          )
          .on_mouse_move((event, cx) =>
            this.targetDrag("fleet", item.id, event, cx),
          )
          .children(
            this.drag?.kind === "fleet" &&
              this.drag.target === item.id &&
              this.drag.bounds
              ? [
                  div()
                    .absolute()
                    .top(0)
                    .left(this.drag.side ? 0 : this.drag.bounds.width - 2)
                    .w(2)
                    .h(this.drag.bounds.height)
                    .bg("#b3d2e5"),
                ]
              : [],
          )
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
    if (fleet)
      tabs.child(
        Button.new(`fleet-layouts-${fleet.id}`)
          .accessibility_label("Fleet layouts")
          .child("⋯")
          .on_click((_event, cx) => {
            this.layoutMenu = this.layoutMenu === fleet.id ? null : fleet.id;
            cx.notify();
          }),
      );
    body.child(tabs);
    if (fleet && this.layoutMenu === fleet.id)
      body.child(this.layoutControls(fleet));
    if (fleet) {
      const area = div()
        .flex()
        .flex_1()
        .min_h(0)
        .gap(8)
        .child(this.pane(fleet.root, fleet));
      if (voyage && voyage.portals.length) {
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
    if (this.drag)
      shell.child(
        ArrangementCapture.new((kind, x, y, cx) => {
          if (!this.drag) return;
          if (kind === "cancel") {
            this.drag = null;
            cx.notify();
            return;
          }
          if (kind === "move") {
            this.moveDrag(x, y, cx);
            return;
          }
          this.finishDrag(x, y, cx);
        }),
      );
    shell.child(sidebar).child(body);
    const chat = this.chat.render(colors, layout.context);
    if (chat) shell.child(chat);
    return shell;
  }
}
