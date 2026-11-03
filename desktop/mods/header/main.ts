import { View, div } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { Brand, Layer, Target } from "voyager_avatar";
import { take_result, window_epoch } from "voyager_avatar";
import { response as validateResponse } from "./validate.js";
import { invoke, openTerminal } from "./workspace.js";
import { request_id } from "voyager_workspace";
import { NameState, Name, ArrangementCapture } from "voyager_native";
import { Terminal, TerminalState, Split as NativeSplit } from "voyager_native";
import { Chat } from "./chat.js";
import { Notes } from "voyager_content_view";
import { homeOverview } from "./home.js";

import type {
  AsyncContext,
  Context as UIContext,
  FocusHandle,
  NativeElement,
  MouseMoveEvent,
  MouseButtonEvent,
  KeyEvent,
} from "gpui-kit";
import type { Action, RenameTarget } from "../../../contract/generated/request";
import type {
  Content,
  Context as Scope,
  Fleet,
  Layout,
  Response,
  Split,
  Vessel,
} from "../../../contract/generated/response";
import type { TerminalResponse } from "../../../contract/generated/terminalResponse";

type ContentScope = Extract<Scope, { kind: "vessel" | "portal" }>;

type Editing = {
  target: RenameTarget;
  state: NameState;
  saving: boolean;
  pending?: boolean;
  name?: string;
  unconfirmed?: string;
};
type Opening = {
  status: TerminalResponse["status"] | "pending" | "unbound";
  message?: string | null;
};

type Drag = {
  kind: "vessel" | "fleet" | "voyage";
  id: string;
  version: string;
  voyage: string | null | undefined;
  fleet: string | null | undefined;
  x: number;
  y: number;
  moved: boolean;
  target?: string;
  side?: "left" | "right" | "top" | "bottom" | boolean;
  bounds?: { x: number; y: number; width: number; height: number };
};
type LayoutName = { state: NameState; fleet: string; submitted: boolean };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class Workspace extends View {
  declare version: Response["version"];
  declare sidebar: boolean;
  declare dockReceipt: string;
  declare dockEpoch: string;
  declare layout: Layout | null;
  declare busy: boolean;
  declare fresh: boolean;
  declare focus: FocusHandle;
  declare names: Map<string, { focus: FocusHandle; name: string }>;
  declare status: string;
  declare terminals: Map<string, TerminalState>;
  declare openings: Map<string, Opening>;
  declare editing: Editing | null | undefined;
  declare afterRename: Action | null | undefined;
  declare chat: Chat;
  declare refreshRequested: boolean;
  declare focused: string | null;
  declare splitHover: string | null;
  declare splitReset: number;
  declare splitSession: string;
  declare pendingShortcuts: string[];
  declare drag: Drag | null;
  declare layoutName: LayoutName | null | undefined;
  declare savingLayout: boolean | undefined;
  declare pendingLayout:
    Extract<Action, { operation: "save-layout" }> | null | undefined;
  declare layoutMenu: string | null | undefined;
  init(_props: unknown, cx: AsyncContext) {
    this.chat = new Chat(cx, () => {
      this.refreshRequested = true;
      if (!this.busy) this.run({ operation: "inspect" }, cx);
    });
    this.version = "0";
    this.sidebar = true;
    this.dockReceipt = "";
    this.dockEpoch = "";
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
    this.splitReset = 0;
    this.splitSession = request_id();
    this.pendingShortcuts = [];
    this.drag = null;
    this.run({ operation: "inspect" }, cx);
  }

  run(
    action: Action,
    cx: UIContext,
    done?: (result: Response | null, cx: AsyncContext) => void,
    expectedVersion: string = this.version,
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
      let result: Response | null = null;
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
        const retry = new Set<string>();
        if (
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
        if (accepted && result.status === "applied" && result.fresh) {
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

  acceptSnapshot(result: Response, task: AsyncContext) {
    this.drag = null;
    if (BigInt(result.version) < BigInt(this.version)) {
      if (result.status !== "applied")
        this.status = result.message || result.status;
      return false;
    }
    this.version = result.version;
    this.splitReset += 1;
    this.layout = result.layout;
    this.fresh = result.fresh;
    this.status = result.message || "";
    const retain = (target: RenameTarget, name: string) => {
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

  target(
    id: string,
    scope: Scope,
    child: NativeElement,
    fallback = false,
  ): NativeElement {
    return Target.new(id, { scope: JSON.stringify(scope), fallback }).child(
      child,
    );
  }

  layer(shell: NativeElement, layout: Layout): NativeElement {
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

  contentName(placement: Vessel): string {
    const type = this.layout?.contents.find(
      (content) => content.id === placement.content,
    )?.typeId;
    return placement.name || (type === "notes" ? "Notes" : "Terminal");
  }

  visibleVessels(fleet: Fleet | undefined): Vessel[] {
    if (!fleet) return [];
    if (!fleet.root) return fleet.vessels;
    const visible = new Set<string>();
    const collect = (tree: Split) => {
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
    task: AsyncContext,
    existingOnly = false,
    retry: Set<string> = new Set(),
    allowed: Set<string> = new Set(),
  ): Promise<void> {
    const layout = this.layout;
    if (!layout) throw Error("Workspace snapshot is unavailable.");
    if (layout.view === "home") return;
    const voyage = layout.voyages.find(
      (item) => item.id === layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === layout.selectedFleet,
    );
    const errors: string[] = [];
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
      let opened: TerminalResponse;
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

  terminalStatus(content: Content): string {
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

  closeName(editing: Editing, cx: UIContext) {
    if (this.editing !== editing) return;
    this.editing = null;
    editing.state.release();
    cx.notify();
  }

  saveName(editing: Editing, cx: UIContext) {
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

  editName(target: RenameTarget, value: string, cx: UIContext) {
    if (this.editing) return;
    const state = NameState.new(value);
    const editing: Editing = { target, state, saving: false };
    this.editing = editing;
    const finish: Parameters<NameState["on"]>[1] = (_event, cx) => {
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

  startDrag(
    kind: Drag["kind"],
    id: string,
    event: MouseButtonEvent,
    cx: UIContext,
  ) {
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

  moveDrag(x: number, y: number, cx: UIContext) {
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

  targetDrag(
    kind: Drag["kind"],
    id: string,
    event: MouseMoveEvent,
    cx: UIContext,
  ) {
    if (!this.drag?.moved || this.drag.kind !== kind || this.drag.id === id)
      return;
    const { x, y, width, height } = event.bounds;
    if (width <= 0 || height <= 0) return;
    let side: Drag["side"];
    if (kind === "vessel") {
      const distances = [
        (event.position.x - x) / width,
        1 - (event.position.x - x) / width,
        (event.position.y - y) / height,
        1 - (event.position.y - y) / height,
      ];
      side = (["left", "right", "top", "bottom"] as const)[
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

  finishDrag(x: number, y: number, cx: UIContext) {
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

  shortcut(event: KeyEvent, cx: UIContext) {
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

  flushShortcuts(cx: UIContext, applied: boolean) {
    if (!applied) this.pendingShortcuts = [];
    const key = this.pendingShortcuts.shift();
    if (key) this.dispatchShortcut(key, cx);
  }

  dispatchShortcut(key: string, cx: UIContext) {
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

  action(
    label: string,
    action: Action | null,
    selected = false,
    rename: RenameTarget | null = null,
  ): NativeElement {
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
    const button = (
      (rename && ["voyage", "fleet"].includes(rename.kind)) ||
      (action && !["inspect", "create-fleet"].includes(action.operation))
        ? Button.new(`navigation-${key}-${JSON.stringify(action)}`)
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

  saveLayout(fleet: string, cx: UIContext) {
    if (this.layoutName || this.savingLayout) return;
    const state = NameState.new("");
    const editing = { state, fleet, submitted: false };
    this.layoutName = editing;
    const finish = (_event: unknown, task: UIContext) => {
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

  layoutControls(fleet: Fleet): NativeElement {
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

  sidebarToggle(fleet: Fleet | undefined): NativeElement {
    return Button.new("toggle-sidebar")
      .accessibility_label("Toggle sidebar")
      .w(30)
      .h(30)
      .child("◧")
      .on_click((_event, cx) => {
        if (this.busy || !fleet) return;
        this.sidebar = !this.sidebar;
        this.run(
          {
            operation: "dock",
            context: this.sidebar
              ? { kind: "workspace" }
              : { kind: "fleet", id: fleet.id },
          },
          cx,
        );
      });
  }

  statusView(): NativeElement {
    return div()
      .flex()
      .flex_col()
      .px(12)
      .py(6)
      .child(div().text_size(11).text_color("#ffcad3").child(this.status))
      .child(this.action("Refresh", { operation: "inspect" }));
  }

  dock(context: Scope): NativeElement {
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

  pane(
    tree: Split,
    fleet: Fleet,
    path: Extract<Action, { operation: "resize-split" }>["path"] = [],
  ): NativeElement {
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

  content(
    placement: Vessel,
    scope: ContentScope,
    split: Extract<Action, { operation: "split" }> | null = null,
  ): NativeElement {
    const colors = projection();
    const content = this.layout?.contents.find(
      (item) => item.id === placement.content,
    );
    if (!content) throw Error("Placement content is unavailable.");
    const terminal = this.terminals.get(content.id);
    return this.target(
      `${scope.kind}-${placement.id}`,
      scope,
      div()
        .relative()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(0)
        .min_h(0)
        .rounded(3)
        .border_1()
        .border_color(
          this.drag?.kind === "vessel" &&
            (this.drag.id === placement.id || this.drag.target === placement.id)
            ? "#b3d2e5"
            : this.focused === placement.id
              ? "#b07af560"
              : "#00000000",
        )
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
                  this.action(this.contentName(placement), null, false, scope),
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
    );
  }

  render(cx: UIContext): NativeElement {
    try {
      const raw = take_result();
      if (raw !== null) {
        const result: unknown = JSON.parse(raw);
        if (!validateResponse(result))
          throw Error("Invalid native dock response");
        const accepted = this.acceptSnapshot(result, cx);
        if (accepted && result.status === "applied")
          this.dockReceipt = result.requestId;
      }
    } catch (error) {
      this.status = errorMessage(error);
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
      .text_size(13)
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
      .w(280)
      .flex_shrink_0()
      .px(12)
      .border_r_1()
      .border_color("#ffffff0c")
      .bg("#16181c")
      .child(
        div()
          .relative()
          .w(200)
          .h(202)
          .flex_shrink_0()
          .mt(12)
          .mb(14)
          .mx(27.5)
          .child(
            this.target(
              "workspace-dock",
              { kind: "workspace" },
              Brand.new("brand", {}),
            ),
          )
          .child(
            div()
              .absolute()
              .bottom(0)
              .left(88)
              .child(this.chat.toggleView(colors)),
          ),
      );
    const chat = this.chat.render(colors, layout.context, !this.sidebar);
    if (chat && this.sidebar) sidebar.child(chat);
    const compactChat = () => {
      if (!this.sidebar && chat)
        shell.child(
          div().absolute().left(12).top(107).w(256).h(380).child(chat),
        );
    };
    sidebar.child(
      Button.new("home-navigation")
        .accessibility_label("Home")
        .h(38)
        .px(10)
        .justify_start()
        .mb(26)
        .text_size(13)
        .child("Home")
        .on_click((_event, cx) => this.run({ operation: "home" }, cx)),
    );
    sidebar.child(
      div().px(10).pb(8).text_size(10).text_color("#92939d").child("VOYAGES"),
    );
    for (const item of layout.voyages) {
      sidebar.child(
        div()
          .h(42)
          .flex_shrink_0()
          .child(
            this.target(
              `voyage-${item.id}`,
              { kind: "voyage", id: item.id },
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
            ),
          ),
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
    const body = div().flex().flex_col().flex_1().min_w(0).min_h(0);
    const context = layout.context;
    const visibleContext =
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
    let goThere: Action | undefined;
    if (context.kind === "fleet")
      goThere = { operation: "select-fleet", id: context.id };
    else if (context.kind === "voyage")
      goThere = { operation: "select-voyage", id: context.id };
    else if (context.kind === "vessel") {
      goThere = { operation: "reveal-vessel", id: context.id };
    } else if (context.kind === "portal") {
      const original = layout.voyages.find((item) =>
        item.portals.some((portal) => portal.id === context.id),
      );
      if (original) goThere = { operation: "select-voyage", id: original.id };
    }
    body.child(
      div()
        .flex()
        .items_center()
        .h(52)
        .flex_shrink_0()
        .px(18)
        .gap(12)
        .border_b_1()
        .border_color("#ffffff0c")
        .child(this.sidebarToggle(fleet))
        .child(
          div()
            .text_size(11)
            .text_color(colors.muted)
            .child(layout.view === "home" ? "Home" : voyage?.name || "Voyager"),
        )
        .child(div().flex_1())
        .child(
          div()
            .text_size(10)
            .text_color(colors.muted)
            .child(`Context: ${context.kind}`),
        )
        .children(!this.sidebar ? [this.chat.toggleView(colors)] : []),
    );
    if (layout.view === "home") {
      if (!visibleContext) {
        body.child(
          div()
            .w(48)
            .h(45)
            .child(this.target("out-of-view-avatar", context, div(), true)),
        );
        if (goThere) body.child(this.action("Go there", goThere));
      }
      body.child(
        div()
          .flex()
          .flex_col()
          .flex_1()
          .min_h(0)
          .p(20)
          .child(homeOverview(layout, (action, cx) => this.run(action, cx))),
      );
      if (this.sidebar) shell.child(sidebar);
      shell.child(body);
      if (this.status) body.child(this.statusView());
      compactChat();
      return this.layer(shell, layout);
    }
    const tabs = div().flex().items_center().min_w(0).gap(8);
    if (!visibleContext)
      tabs.child(
        div()
          .w(48)
          .h(45)
          .child(this.target("out-of-view-avatar", context, div(), true)),
      );
    for (const item of voyage?.fleets || []) {
      tabs.child(
        div()
          .w(160)
          .h(45)
          .child(
            this.target(
              `fleet-${item.id}`,
              { kind: "fleet", id: item.id },
              div()
                .relative()
                .flex()
                .items_center()
                .h_full()
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
                .child(this.dock({ kind: "fleet", id: item.id }))
                .children(
                  item.id === fleet?.id
                    ? [
                        div()
                          .absolute()
                          .bottom(0)
                          .left(13)
                          .right(13)
                          .h(1)
                          .bg("#b3a3db"),
                      ]
                    : [],
                ),
            ),
          ),
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
    body.child(
      div()
        .flex()
        .items_center()
        .h(45)
        .flex_shrink_0()
        .px(10)
        .gap(3)
        .border_b_1()
        .border_color("#ffffff0c")
        .child(tabs),
    );
    if (!visibleContext && goThere)
      body.child(this.action("Go there", goThere));
    if (fleet && this.layoutMenu === fleet.id)
      body.child(this.layoutControls(fleet));
    if (fleet) {
      const area = div()
        .flex()
        .flex_1()
        .min_h(0)
        .px(7)
        .py(5)
        .gap(6)
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
    if (this.status) body.child(this.statusView());
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
    if (this.sidebar) shell.child(sidebar);
    shell.child(body);
    compactChat();
    return this.layer(shell, layout);
  }
}
