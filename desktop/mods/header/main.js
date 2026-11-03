import { View, div } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { Brand, Layer, Target } from "voyager_avatar";
import { take_result, window_epoch } from "voyager_avatar";
import {
  response as validateResponse,
  contextFacts as validateFacts,
} from "./validate.js";
import { invoke, openTerminal } from "./workspace.js";
import {
  request_id,
  revision as workspace_revision,
  context_facts,
} from "voyager_workspace";
import { NameState, Name, ArrangementCapture } from "voyager_native";
import { Terminal, TerminalState, Split as NativeSplit } from "voyager_native";
import { Chat } from "./chat.js";
import { Notes } from "voyager_content_view";
import { homeOverview } from "./home.js";
import { composeCanvas, vesselFrame } from "./canvas.js";
import { LayoutPanel } from "./layout-panel.js";
const CONTEXT_REFRESH_MS = 3000;
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
export default class Workspace extends View {
  init(_props, cx) {
    this.chat = new Chat(cx);
    this.version = "0";
    this.contextFacts = null;
    this.layoutPanel = null;
    this.sidebar = true;
    this.dockReceipt = "";
    this.dockEpoch = "";
    this.layout = null;
    this.busy = false;
    this.fresh = false;
    this.focus = cx.focus_handle();
    this.names = new Map();
    this.refreshRequested = false;
    this.workspaceNotice = "0";
    this.status = "Opening workspace";
    this.terminals = new Map();
    this.openings = new Map();
    this.focused = null;
    this.splitHover = null;
    this.splitReset = 0;
    this.splitSession = request_id();
    this.pendingShortcuts = [];
    this.drag = null;
    this.run({ operation: "inspect" }, cx);
    this.startContext(cx);
  }
  startContext(cx) {
    cx.spawn(async (task) => {
      while (true) {
        await this.readContext(task);
        await task.sleep(CONTEXT_REFRESH_MS);
      }
    });
  }
  async readContext(cx) {
    if (!this.layout) return;
    let facts = null;
    try {
      const value = JSON.parse(await context_facts());
      if (!validateFacts(value)) throw Error("Invalid context metadata");
      if (
        value.version !== this.version ||
        JSON.stringify(value.scope) !== JSON.stringify(this.layout.context)
      )
        return;
      facts = value;
    } catch (_) {
      facts = null;
    }
    if (JSON.stringify(this.contextFacts) !== JSON.stringify(facts)) {
      this.contextFacts = facts;
      cx.notify();
    }
  }
  run(
    action,
    cx,
    done,
    expectedVersion = this.version,
    prepareContents = true,
  ) {
    this.drag = null;
    if (this.busy) {
      if (action.operation === "resize-split") {
        this.splitReset += 1;
        this.status =
          "Resize was not saved while another workspace request was pending.";
        cx.notify();
        return;
      }
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
    const dockEpoch = action.operation === "dock" ? window_epoch() : "";
    const previousContents = new Set(
      this.layout?.contents?.map((item) => item.id) || [],
    );
    cx.spawn(async (task) => {
      let result = null;
      let prepared = false;
      try {
        result = await invoke(action, expectedVersion);
        const accepted = this.acceptSnapshot(result, task);
        if (
          accepted &&
          action.operation === "dock" &&
          result.status === "applied"
        ) {
          this.dockReceipt = result.requestId;
          this.dockEpoch = dockEpoch;
        }
        const retry = new Set();
        if (
          prepareContents &&
          accepted &&
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
        if (
          prepareContents &&
          accepted &&
          result.status === "applied" &&
          result.fresh
        ) {
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
        this.splitReset += 1;
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
    if (BigInt(result.version) < BigInt(this.version)) {
      if (result.status !== "applied")
        this.status = result.message || result.status;
      return false;
    }
    this.version = result.version;
    this.splitReset += 1;
    this.layout = result.layout;
    this.sidebar = !result.layout.canvas?.sidebarCollapsed;
    if (
      this.contextFacts?.version !== result.version ||
      JSON.stringify(this.contextFacts?.scope) !==
        JSON.stringify(result.layout.context)
    )
      this.contextFacts = null;
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
    return true;
  }
  target(id, scope, child, fallback = false) {
    return Target.new(id, { scope: JSON.stringify(scope), fallback }).child(
      child,
    );
  }
  layer(shell, layout) {
    return Layer.new("avatar-layer", {
      dockReceipt: this.dockReceipt,
      dockEpoch: this.dockEpoch,
      version: this.version,
      scope: JSON.stringify(layout.context),
      layoutKey: JSON.stringify([
        this.sidebar,
        layout.view,
        layout.selectedVoyage,
        layout.selectedFleet,
        this.version,
      ]),
    }).child(shell);
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
    if (this.editing || this.layoutName || this.layoutPanel) return;
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
    const fleet = rename?.kind === "fleet";
    const voyage = rename?.kind === "voyage";
    const placement = rename?.kind === "vessel" || rename?.kind === "portal";
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
    const button = Button.new(`navigation-${key}-${JSON.stringify(action)}`)
      .justify_start()
      .line_height(1.618034)
      .role("button")
      .accessibility_label(
        action?.operation === "create-fleet"
          ? "Create Fleet"
          : action?.operation === "split"
            ? "Split Vessel"
            : label,
      )
      .h(fleet ? 45 : placement ? 35 : 38)
      .px(fleet ? 15 : 10)
      .py(0)
      .rounded(fleet ? 0 : 5)
      .text_size(fleet ? 11 : placement ? 10 : 13)
      .text_color(selected ? "#ded8ef" : colors.muted)
      .bg(selected && voyage ? "#c0b1f00b" : "#00000000")
      .on_click((event, cx) => {
        if (focus) focus.focus();
        else if (!["create-fleet", "inspect"].includes(action?.operation || ""))
          this.focus.focus();
        if (event.click_count === 2 && rename) this.editName(rename, label, cx);
        else if (action) this.run(action, cx);
      })
      .child(placement && label === "Terminal" ? "" : label);
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
  sidebarToggle() {
    return Button.new("toggle-sidebar")
      .accessibility_label(this.sidebar ? "Collapse sidebar" : "Expand sidebar")
      .w(28)
      .h(28)
      .p(4)
      .child("◧")
      .on_click((_event, cx) =>
        this.run({ operation: "set-sidebar", collapsed: this.sidebar }, cx),
      );
  }
  settings(cx) {
    const canvas = this.layout?.canvas;
    if (!canvas || this.busy || !this.fresh) return;
    if (this.layoutPanel) this.layoutPanel.release();
    this.layoutPanel = new LayoutPanel(canvas, this.version);
    cx.notify();
  }
  statusView() {
    return div()
      .flex()
      .flex_col()
      .px(12)
      .py(6)
      .child(div().text_size(11).text_color("#ffcad3").child(this.status))
      .child(this.action("Refresh", { operation: "inspect" }));
  }
  pane(tree, fleet, path = []) {
    const colors = projection();
    if (tree.kind === "branch") {
      return NativeSplit.new(
        JSON.stringify([this.splitSession, fleet.id, path]),
        tree.axis,
        tree.share ?? 5000,
        this.version,
        this.splitReset,
        (revision, share, cx) =>
          this.run(
            { operation: "resize-split", fleet: fleet.id, path, share },
            cx,
            (result, task) => {
              if (result?.status === "applied") return;
              const message = this.status;
              this.run({ operation: "inspect" }, task, () => {
                this.status = message;
              });
            },
            revision,
          ),
      )
        .flex_1()
        .min_w(0)
        .min_h(0)
        .child(this.pane(tree.first, fleet, [...path, "first"]))
        .child(this.pane(tree.second, fleet, [...path, "second"]));
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
    return this.target(
      `${scope.kind}-${placement.id}`,
      scope,
      vesselFrame(
        div()
          .relative()
          .flex()
          .flex_col()
          .flex_1()
          .min_w(0)
          .min_h(0)
          .rounded(3)
          .bg(colors.background)
          .on_mouse_down("left", (_event, cx) => {
            this.focused = placement.id;
            cx.notify();
          })
          .on_mouse_move((event, cx) => {
            if (scope.kind === "vessel")
              this.targetDrag("vessel", placement.id, event, cx);
          })
          .child(
            div()
              .flex()
              .items_center()
              .h(35)
              .flex_shrink_0()
              .px(5)
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
                    this.action(
                      this.contentName(placement),
                      null,
                      false,
                      scope,
                    ),
                  ),
              )
              .children(
                split
                  ? [
                      div()
                        .id(`split-zone-${placement.id}`)
                        .w(90)
                        .h(35)
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
                                    this.run(
                                      { ...split, axis: "horizontal" },
                                      cx,
                                    ),
                                  ),
                                Button.new(`split-vertical-${placement.id}`)
                                  .accessibility_label(
                                    "Split this Vessel top and bottom",
                                  )
                                  .child("⬒")
                                  .on_click((_event, cx) =>
                                    this.run(
                                      { ...split, axis: "vertical" },
                                      cx,
                                    ),
                                  ),
                              ]
                            : [],
                        ),
                    ]
                  : [],
              ),
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
                      this.drag.side === "right"
                        ? this.drag.bounds.width / 2
                        : 0,
                    )
                    .top(
                      this.drag.side === "bottom"
                        ? this.drag.bounds.height / 2
                        : 0,
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
          ),
        this.focused === placement.id,
        this.drag?.kind === "vessel" &&
          (this.drag.id === placement.id || this.drag.target === placement.id),
      ),
    );
  }
  sidebarRegion(layout, voyage) {
    const colors = projection();
    const sidebar = div()
      .flex()
      .flex_col()
      .flex_shrink_0()
      .px(this.sidebar ? 12 : 4)
      .border_r_1()
      .border_color("#ffffff0c")
      .bg("#16181c");
    if (this.sidebar)
      sidebar.child(
        div()
          .relative()
          .w(200)
          .h(202)
          .self_center()
          .flex_shrink_0()
          .mt(12)
          .mb(8)
          .child(
            this.target(
              "workspace-dock",
              { kind: "workspace" },
              Brand.new("brand", {}),
            ),
          ),
      );
    sidebar.child(
      div()
        .flex()
        .items_center()
        .h(36)
        .flex_shrink_0()
        .child(
          Button.new("home-navigation")
            .accessibility_label("Home")
            .h(28)
            .px(this.sidebar ? 10 : 7)
            .justify_start()
            .text_size(13)
            .child(this.sidebar ? "Home" : "⌂")
            .on_click((_event, cx) => this.run({ operation: "home" }, cx)),
        )
        .children(this.sidebar ? [div().flex_1(), this.sidebarToggle()] : []),
    );
    if (!this.sidebar) sidebar.child(this.sidebarToggle());
    if (this.sidebar)
      sidebar.child(
        div()
          .flex()
          .items_center()
          .h(34)
          .mt(12)
          .child(
            div()
              .flex_1()
              .px(10)
              .text_size(10)
              .text_color("#92939d")
              .child("VOYAGES"),
          )
          .child(
            Button.new("create-voyage")
              .accessibility_label("Create Voyage")
              .w(24)
              .h(24)
              .p(2)
              .child("+")
              .on_click((_event, cx) =>
                this.run(
                  {
                    operation: "create-voyage",
                    name: `Voyage ${layout.voyages.length + 1}`,
                    cwd: layout.contents[0].cwd,
                  },
                  cx,
                ),
              ),
          ),
      );
    for (const item of layout.voyages) {
      const scope = { kind: "voyage", id: item.id };
      const docked =
        layout.context.kind === "voyage" && layout.context.id === item.id;
      const row = div()
        .relative()
        .flex()
        .items_center()
        .h(42)
        .rounded(4)
        .bg(item.id === voyage?.id ? "#c0b1f00b" : "#00000000")
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
        );
      if (this.sidebar)
        row.child(
          div()
            .flex_1()
            .pl(docked ? 48 : 0)
            .child(
              this.action(
                item.name,
                { operation: "select-voyage", id: item.id },
                item.id === voyage?.id,
                scope,
              ),
            ),
        );
      else
        row.child(
          Button.new(`rail-voyage-${item.id}`)
            .accessibility_label(`Open Voyage ${item.name}`)
            .w(38)
            .h(38)
            .p(4)
            .text_size(12)
            .child(item.name.slice(0, 1))
            .on_click((_event, cx) =>
              this.run({ operation: "select-voyage", id: item.id }, cx),
            ),
        );
      if (
        this.drag?.kind === "voyage" &&
        this.drag.target === item.id &&
        this.drag.bounds
      )
        row.child(
          div()
            .absolute()
            .left(0)
            .top(this.drag.side ? 0 : this.drag.bounds.height - 2)
            .w(this.drag.bounds.width)
            .h(2)
            .bg("#b3d2e5"),
        );
      sidebar.child(
        this.sidebar ? this.target(`voyage-${item.id}`, scope, row) : row,
      );
    }
    if (!this.sidebar)
      sidebar.child(
        Button.new("rail-create-voyage")
          .accessibility_label("Create Voyage")
          .w(38)
          .h(28)
          .p(2)
          .child("+")
          .on_click((_event, cx) =>
            this.run(
              {
                operation: "create-voyage",
                name: `Voyage ${layout.voyages.length + 1}`,
                cwd: layout.contents[0].cwd,
              },
              cx,
            ),
          ),
      );
    if (this.sidebar)
      sidebar.child(this.chat.render(colors, layout.context) || div());
    sidebar.child(div().flex_1());
    if (voyage && this.sidebar && layout.view !== "home")
      sidebar.child(
        this.action("Open Portal", {
          operation: "create-portal",
          voyage: voyage.id,
        }),
      );
    sidebar.child(
      div()
        .flex()
        .flex_col()
        .gap(4)
        .pb(8)
        .child(
          Button.new("workspace-layout-settings")
            .accessibility_label("Workspace layout")
            .h(28)
            .px(7)
            .justify_start()
            .child(this.sidebar ? "Workspace layout" : "⚙")
            .on_click((_event, cx) => this.settings(cx)),
        )
        .child(
          div().flex().items_center().h(30).child(this.chat.toggleView(colors)),
        ),
    );
    return sidebar;
  }
  fleetRegion(layout, voyage, fleet) {
    const strip = div()
      .flex()
      .items_center()
      .px(10)
      .gap(3)
      .border_b_1()
      .border_color("#ffffff0c");
    if (layout.view === "home")
      return strip.child(
        div().text_size(11).text_color(projection().muted).child("Home"),
      );
    strip.child(div().flex_1());
    const tabs = div().flex().items_center().min_w(0).h_full().gap(3);
    for (const item of voyage?.fleets || []) {
      const selected = item.id === fleet?.id;
      const docked =
        layout.context.kind === "fleet" && layout.context.id === item.id;
      const row = div()
        .relative()
        .flex()
        .items_center()
        .h_full()
        .min_w(120)
        .max_w(220)
        .rounded(5)
        .border_1()
        .border_color(
          this.drag?.kind === "fleet" &&
            (this.drag.id === item.id || this.drag.target === item.id)
            ? "#b3d2e5"
            : selected
              ? "#c4b5fd3b"
              : "#00000000",
        )
        .bg(selected ? "#c4b5fd0c" : "#00000000")
        .pl(docked ? 48 : 6)
        .pr(6)
        .on_mouse_down("left", (event, cx) =>
          this.startDrag("fleet", item.id, event, cx),
        )
        .on_mouse_move((event, cx) =>
          this.targetDrag("fleet", item.id, event, cx),
        )
        .child(
          this.action(
            item.name,
            { operation: "select-fleet", id: item.id },
            selected,
            { kind: "fleet", id: item.id },
          ),
        );
      if (
        this.drag?.kind === "fleet" &&
        this.drag.target === item.id &&
        this.drag.bounds
      )
        row.child(
          div()
            .absolute()
            .top(0)
            .left(this.drag.side ? 0 : this.drag.bounds.width - 2)
            .w(2)
            .h(this.drag.bounds.height)
            .bg("#b3d2e5"),
        );
      tabs.child(
        this.target(`fleet-${item.id}`, { kind: "fleet", id: item.id }, row),
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
          .w(26)
          .h(26)
          .p(3)
          .child("⋯")
          .on_click((_event, cx) => {
            this.layoutMenu = this.layoutMenu === fleet.id ? null : fleet.id;
            cx.notify();
          }),
      );
    return strip.child(tabs).child(div().flex_1());
  }
  activeRegion(layout, fleet) {
    const body = div().flex().flex_col().flex_1().min_w(0).min_h(0);
    if (layout.view === "home")
      return body
        .p(20)
        .child(homeOverview(layout, (action, cx) => this.run(action, cx)));
    if (fleet && this.layoutMenu === fleet.id)
      body.child(this.layoutControls(fleet));
    if (fleet)
      body.child(
        div()
          .flex()
          .flex_1()
          .min_w(0)
          .min_h(0)
          .px(7)
          .py(5)
          .child(this.pane(fleet.root, fleet)),
      );
    return body;
  }
  contextRegion(layout, voyage, fleet) {
    const context = layout.context;
    const visible =
      context.kind === "workspace" || context.kind === "voyage"
        ? this.sidebar
        : layout.view === "home"
          ? false
          : context.kind === "fleet"
            ? !!voyage?.fleets.some((item) => item.id === context.id)
            : context.kind === "vessel"
              ? this.visibleVessels(fleet).some(
                  (item) => item.id === context.id,
                )
              : !!voyage?.portals.some((item) => item.id === context.id);
    let goThere;
    if (context.kind === "fleet")
      goThere = { operation: "select-fleet", id: context.id };
    else if (context.kind === "voyage")
      goThere = { operation: "select-voyage", id: context.id };
    else if (context.kind === "vessel")
      goThere = { operation: "reveal-vessel", id: context.id };
    else if (context.kind === "portal") {
      const original = layout.voyages.find((item) =>
        item.portals.some((portal) => portal.id === context.id),
      );
      if (original) goThere = { operation: "select-voyage", id: original.id };
    }
    const facts = this.contextFacts;
    const directory =
      facts?.directory.kind === "known"
        ? `Starting folder: ${facts.directory.path}`
        : facts?.directory.kind === "multiple"
          ? "Multiple starting folders"
          : "Starting folder unavailable";
    const branch =
      facts?.branch.kind === "named"
        ? facts.branch.name
        : facts?.branch.kind === "detached"
          ? "Detached HEAD"
          : "Branch unavailable";
    const row = div()
      .flex()
      .items_center()
      .h(38)
      .flex_shrink_0()
      .px(10)
      .gap(12)
      .text_size(10)
      .text_color(projection().muted)
      .border_t_1()
      .border_color("#ffffff0c");
    if (!visible)
      row.child(
        div()
          .w(48)
          .h(38)
          .flex_shrink_0()
          .child(this.target("out-of-view-avatar", context, div(), true)),
      );
    row.child(
      div()
        .flex_1()
        .min_w(0)
        .overflow_hidden()
        .child(`${directory}  ·  ${branch}`),
    );
    if (facts) row.child(div().child(facts.path.join(" / ")));
    if (!visible && goThere) row.child(this.action("Go there", goThere));
    const region = div().flex().flex_col().child(row);
    if (this.status) region.child(this.statusView());
    return region;
  }
  render(cx) {
    try {
      const raw = take_result();
      if (raw !== null) {
        const result = JSON.parse(raw);
        if (!validateResponse(result))
          throw Error("Invalid native dock response");
        const accepted = this.acceptSnapshot(result, cx);
        if (accepted && result.status === "applied")
          this.dockReceipt = result.requestId;
      }
    } catch (error) {
      this.status = errorMessage(error);
    }
    const ownerRevision = workspace_revision();
    if (BigInt(ownerRevision) > BigInt(this.workspaceNotice)) {
      this.workspaceNotice = ownerRevision;
      if (BigInt(ownerRevision) > BigInt(this.version)) {
        this.refreshRequested = true;
        if (!this.busy) this.run({ operation: "inspect" }, cx);
      }
    }
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
        if (
          event.key === "escape" &&
          this.layoutPanel &&
          !this.layoutPanel.pending
        ) {
          this.layoutPanel.release();
          this.layoutPanel = null;
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
          this.closeName(this.editing, cx);
          retained.focus.focus();
          cx.stop_propagation();
          return;
        }
        this.shortcut(event, cx);
      })
      .relative()
      .flex()
      .w_full()
      .h_full()
      .text_size(13)
      .bg(colors.background)
      .text_color(colors.foreground);
    const layout = this.layout;
    if (!layout?.voyages.length || !layout.canvas)
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace canvas unavailable")
        .child(this.action("Refresh", { operation: "inspect" }));
    const voyage = layout.voyages.find(
      (item) => item.id === layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === layout.selectedFleet,
    );
    shell.child(
      composeCanvas(layout.canvas, (region) => {
        switch (region) {
          case "sidebar":
            return this.sidebarRegion(layout, voyage);
          case "fleet-strip":
            return this.fleetRegion(layout, voyage, fleet);
          case "active-fleet":
            return this.activeRegion(layout, fleet);
          case "context-bar":
            return this.contextRegion(layout, voyage, fleet);
          case "portals": {
            if (layout.view === "home" || !voyage?.portals.length) return null;
            const portals = div().flex().flex_col().gap(8).px(7).py(5);
            for (const placement of voyage.portals)
              portals.child(
                this.content(placement, { kind: "portal", id: placement.id }),
              );
            return portals;
          }
        }
      }),
    );
    if (!this.sidebar) {
      const chat = this.chat.render(colors, layout.context, true);
      if (chat)
        shell.child(
          div().absolute().left(52).top(48).w(256).h(380).child(chat),
        );
    }
    if (this.layoutPanel)
      shell.child(
        this.layoutPanel.render(
          () => this.busy,
          (task, done) =>
            this.run({ operation: "inspect" }, task, done, this.version, false),
          (canvas, version, task, done) =>
            this.run(
              { operation: "update-canvas", canvas },
              task,
              done,
              version,
            ),
          (task) => {
            this.layoutPanel?.release();
            this.layoutPanel = null;
            task.notify();
          },
        ),
      );
    if (this.drag)
      shell.child(
        ArrangementCapture.new((kind, x, y, task) => {
          if (!this.drag) return;
          if (kind === "cancel") {
            this.drag = null;
            task.notify();
            return;
          }
          if (kind === "move") this.moveDrag(x, y, task);
          else this.finishDrag(x, y, task);
        }),
      );
    return this.layer(shell, layout);
  }
}
