import { View, div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_header";
import { Layer, Target, PortalArea } from "voyager_avatar";
import { take_result, window_epoch } from "voyager_avatar";
import {
  response as validateResponse,
  contextFacts as validateFacts,
  reportedActivity as validateReportedActivity,
} from "./validate.js";
import { invoke, openTerminal } from "./workspace.js";
import {
  request_id,
  notice as workspace_notice,
  context_facts,
  reported_activity,
  refresh_activity,
} from "voyager_workspace";
import { NameState, Name, ArrangementCapture } from "voyager_native";
import { TerminalState, Split as NativeSplit, Column } from "voyager_native";
import { Occluding } from "voyager_native";
import { Chat } from "./chat.js";
import { composeCanvas } from "./canvas.js";
import { CreationPicker } from "./creation.js";
import { renderPanel } from "./panel-view.js";
import {
  renderSidebar,
  renderFleets,
  renderContext,
} from "./navigation-view.js";
import { WorkspaceMenu } from "./menu.js";
import {
  activeGroups,
  currentVoyage,
  panelGroups,
  visiblePanels,
} from "./panels.js";
const CONTEXT_REFRESH_MS = 3000;
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
export default class Workspace extends View {
  init(_props, cx) {
    this.menus = new WorkspaceMenu();
    this.chat = new Chat(cx);
    this.version = "0";
    this.contextFacts = null;
    this.sidebar = true;
    this.dockReceipt = "";
    this.dockEpoch = "";
    this.layout = null;
    this.busy = false;
    this.fresh = false;
    this.focus = cx.focus_handle();
    this.names = new Map();
    this.refreshRequested = false;
    this.workspaceNotice = {
      revision: "0",
      packageRevision: "0",
      activityRevision: "0",
    };
    this.automaticRefresh = false;
    this.status = "Opening workspace";
    this.activityRevision = "";
    this.reportedActivity = {};
    this.activityLimit = null;
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
    const version = this.version;
    const scope = JSON.stringify(this.layout.context);
    const read = (this.contextRead = (this.contextRead ?? 0) + 1);
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
    if (
      read !== this.contextRead ||
      version !== this.version ||
      scope !== JSON.stringify(this.layout?.context)
    )
      return;
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
      if (action.operation === "resize-panel-split") {
        this.splitReset += 1;
        this.status =
          "Resize was not saved while another workspace request was pending.";
        cx.notify();
        return;
      }
      if (action.operation === "save-panel-layout" && this.savingLayout) {
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
    const retryRefusals = !this.automaticRefresh;
    if (action.operation === "inspect") this.refreshRequested = false;
    const changesSelection = [
      "create-fleet",
      "select-fleet",
      "create-voyage",
      "select-voyage",
    ].includes(action.operation);
    const oldLayout = this.layout;
    const maximization =
      action.operation === "set-panel-maximized" ? action : null;
    const creating = action.operation === "create-content" ? action : null;
    const oldGroups = oldLayout ? activeGroups(oldLayout) : [];
    const splitMaximized = Boolean(
      creating &&
      oldGroups.find(
        (group) =>
          JSON.stringify(group.owner) ===
          JSON.stringify(creating.destination.owner),
      )?.maximizedPlacement,
    );
    const transferFocus =
      (changesSelection || Boolean(maximization) || splitMaximized) &&
      oldGroups
        .flatMap((group) => visiblePanels(group, true))
        .some(
          (panel) =>
            this.terminals.get(panel.content)?.rememberFocus() === true,
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
          retryRefusals &&
          action.operation === "inspect" &&
          result.status === "applied" &&
          result.fresh
        ) {
          for (const [content, outcome] of this.openings)
            if (outcome.status === "rejected") {
              this.openings.delete(content);
              if (outcome.reason !== "ended") retry.add(content);
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
              "create-content",
            ].includes(action.operation);
            const allowed = new Set(result.createdContents);
            if (creates)
              for (const item of result.layout.contents)
                if (!previousContents.has(item.id)) allowed.add(item.id);
            await this.prepare(task, !result.createdWorkspace, retry, allowed);
            prepared = true;
            const current = this.layout;
            const shown = current
              ? activeGroups(current).flatMap((group) =>
                  visiblePanels(group, true),
                )
              : [];
            const created = shown.find(
              (panel) => !previousContents.has(panel.content),
            );
            if (creating && created) this.focused = created.id;
            if (transferFocus) {
              const target = maximization
                ? shown.find((panel) => panel.id === maximization.id)
                : splitMaximized
                  ? created
                  : shown[0];
              if (target && (maximization || splitMaximized))
                this.focused = target.id;
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
      if (!this.busy && this.refreshRequested) this.inspectNotice(task);
      if (!this.busy) this.flushShortcuts(task, prepared);
    });
    cx.notify();
  }
  inspectNotice(cx) {
    const notice = workspace_notice();
    const packageChanged =
      notice.packageRevision !== this.workspaceNotice.packageRevision;
    this.workspaceNotice = notice;
    this.refreshRequested = false;
    if (!packageChanged && BigInt(notice.revision) <= BigInt(this.version))
      return;
    this.automaticRefresh = true;
    try {
      this.run({ operation: "inspect" }, cx);
    } finally {
      this.automaticRefresh = false;
    }
  }
  acceptSnapshot(result, task) {
    this.drag = null;
    if (BigInt(result.version) < BigInt(this.version)) {
      if (result.status !== "applied")
        this.status = result.message || result.status;
      return false;
    }
    if (this.menus) this.menus.current = null;
    if (this.creation) this.creation.current = null;
    this.version = result.version;
    this.splitReset += 1;
    this.layout = result.layout;
    this.sidebar = !result.layout.canvas?.sidebarCollapsed;
    if (
      this.contextFacts?.version !== result.version ||
      JSON.stringify(this.contextFacts?.scope) !==
        JSON.stringify(result.layout.context)
    ) {
      this.contextFacts = null;
      task.spawn((cx) => this.readContext(cx));
    }
    this.fresh = result.fresh;
    this.status = result.message || "";
    const retain = (target, name) => {
      const key = JSON.stringify(target);
      const retained = this.names.get(key);
      if (retained) retained.name = name;
      else this.names.set(key, { focus: task.focus_handle(), name });
    };
    for (const voyage of [
      ...this.layout.voyages,
      ...(this.layout.home ? [this.layout.home] : []),
    ]) {
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
    return placement.name;
  }
  visibleVessels(fleet) {
    return fleet
      ? visiblePanels({ root: fleet.root ?? null, members: fleet.vessels })
      : [];
  }
  displayedVessels(fleet) {
    return fleet
      ? visiblePanels(
          {
            root: fleet.root ?? null,
            members: fleet.vessels,
            maximizedPlacement: fleet.maximizedPlacement,
          },
          true,
        )
      : [];
  }
  panelGroup(id) {
    return this.layout
      ? panelGroups(this.layout).find((group) =>
          group.members.some((panel) => panel.id === id),
        )
      : undefined;
  }
  async prepare(
    task,
    existingOnly = false,
    retry = new Set(),
    allowed = new Set(),
  ) {
    const layout = this.layout;
    if (!layout) throw Error("Workspace snapshot is unavailable.");
    const errors = [];
    for (const vessel of activeGroups(layout).flatMap((group) =>
      visiblePanels(group, true),
    )) {
      const content = layout.contents.find(
        (item) => item.id === vessel.content,
      );
      if (content?.typeId !== "terminal") continue;
      if (
        allowed.has(vessel.content) &&
        content.shellIntent &&
        this.openings.get(vessel.content)?.intent !== content.shellIntent
      ) {
        this.openings.delete(vessel.content);
        this.terminals.delete(vessel.content);
      }
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
      this.openings.set(vessel.content, {
        status: "pending",
        intent: content.shellIntent,
      });
      let opened;
      try {
        opened = await openTerminal(vessel.content, this.version);
      } catch (error) {
        this.openings.set(vessel.content, {
          status: "uncertain",
          message: errorMessage(error),
          intent: content.shellIntent,
        });
        this.fresh = false;
        throw error;
      }
      this.openings.set(vessel.content, {
        ...opened,
        intent: content.shellIntent,
      });
      if (opened.status === "applied")
        this.terminals.set(vessel.content, TerminalState.new(vessel.content));
      const current = await invoke({ operation: "inspect" }, this.version);
      this.acceptSnapshot(current, task);
      if (current.status !== "applied" || !current.fresh)
        throw Error(
          this.status ||
            "Workspace refresh is unconfirmed after the terminal request.",
        );
      if (
        opened.status !== "applied" &&
        !(opened.status === "rejected" && opened.reason === "ended")
      )
        errors.push(opened.message || opened.status);
      task.notify();
    }
    if (errors.length) throw Error(errors[0]);
  }
  terminalStatus(content) {
    if (content.startPending)
      return "Terminal start is unconfirmed. Inspect before trying again.";
    const outcome = this.openings.get(content.id);
    if (outcome?.status === "rejected" && outcome.reason === "ended")
      return "This program has ended.";
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
    if (kind === "vessel") {
      const origin = this.panelGroup(this.drag.id);
      const destination = this.panelGroup(id);
      if (
        !origin ||
        !destination ||
        JSON.stringify(origin.owner) !== JSON.stringify(destination.owner)
      ) {
        if (this.drag.target) {
          this.drag.target = undefined;
          this.drag.bounds = undefined;
          cx.notify();
        }
        return;
      }
    }
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
          ? { operation: "move-panel", id, target, side }
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
  maximizeShortcut(id, event, cx) {
    if (this.editing || this.layoutName || this.menus?.current) return;
    const { control, shift, alt, platform } = event.modifiers;
    if (
      !shift ||
      alt ||
      event.modifiers.function ||
      !(
        (control && !platform && event.key.toLowerCase() === "z") ||
        (platform && !control && event.key.toLowerCase() === "enter")
      )
    )
      return;
    const group = this.panelGroup(id);
    if (
      !group ||
      visiblePanels(group).length < 2 ||
      !visiblePanels(group, true).some((panel) => panel.id === id)
    )
      return;
    cx.stop_propagation();
    if (this.busy) {
      this.status =
        "Maximize was not changed while another workspace request was pending.";
      cx.notify();
      return;
    }
    this.run(
      {
        operation: "set-panel-maximized",
        id,
        maximized: group.maximizedPlacement !== id,
      },
      cx,
    );
  }
  shortcut(event, cx) {
    if (this.editing || this.layoutName || this.menus?.current) return;
    const { control, shift, alt, platform } = event.modifiers;
    if (
      ((control && !platform) || (platform && !control)) &&
      alt &&
      event.key.toLowerCase() === "p"
    ) {
      const voyage = this.layout ? currentVoyage(this.layout) : undefined;
      if (voyage?.portalLayout) {
        const action = shift
          ? {
              operation: "set-portal-presentation",
              voyage: voyage.id,
              mode:
                voyage.portalLayout.mode === "overlay"
                  ? "make-room"
                  : "overlay",
            }
          : {
              operation: "set-portal-presentation",
              voyage: voyage.id,
              visible: !voyage.portalLayout.visible,
            };
        this.run(action, cx);
        cx.stop_propagation();
      }
      return;
    }
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
    while (!this.busy && this.pendingShortcuts.length) {
      const key = this.pendingShortcuts.shift();
      if (key) this.dispatchShortcut(key, cx);
    }
  }
  dispatchShortcut(key, cx) {
    const layout = this.layout;
    if (!layout) return;
    const voyage = currentVoyage(layout);
    if (!voyage) return;
    if (key === "t") {
      if (layout.view === "home") return;
      this.run(
        {
          operation: "create-fleet",
          voyage: voyage.id,
          name: `Fleet ${voyage.fleets.length + 1}`,
        },
        cx,
      );
      return;
    }
    const groups = activeGroups(layout);
    const group =
      groups.find((group) =>
        visiblePanels(group, true).some((panel) => panel.id === this.focused),
      ) || groups[0];
    if (!group) return;
    const panels = visiblePanels(group, true);
    const panel =
      panels.find((panel) => panel.id === this.focused) || panels[0];
    this.openSplit(group, panel?.id, key === "o" ? "right" : "bottom", cx);
  }
  refreshActivity(cx) {
    cx.spawn(async (task) => {
      try {
        await refresh_activity();
      } catch (error) {
        this.status = errorMessage(error);
      }
      task.notify();
    });
  }
  readActivity(revision) {
    if (this.activityRevision === revision) return;
    const value = JSON.parse(reported_activity());
    if (!validateReportedActivity(value))
      throw Error("Invalid reported activity");
    this.reportedActivity = value.terminals;
    this.activityLimit = value.limited
      ? (value.reason ?? "Bound terminal observation limit exceeded")
      : null;
    this.activityRevision = revision;
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
        action?.operation === "create-fleet" ? "Create Fleet" : label,
      )
      .h(fleet ? 45 : placement ? 35 : 38)
      .px(fleet ? 15 : 10)
      .py(0)
      .rounded(fleet ? 0 : 5)
      .overflow_hidden()
      .whitespace_nowrap()
      .tooltip(label)
      .text_size(fleet ? 11 : placement ? 10 : 13)
      .text_color(selected ? "#ded8ef" : colors.muted)
      .bg(selected && voyage ? "#c0b1f00b" : "#00000000")
      .on_click((event, cx) => {
        if (focus) focus.focus();
        else if (!["create-fleet", "inspect"].includes(action?.operation || ""))
          this.focus.focus();
        if (event.click_count === 2 && rename) this.editName(rename, label, cx);
        else if (action) {
          if (label === "Refresh" && action.operation === "inspect")
            this.refreshActivity(cx);
          this.run(action, cx);
        }
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
  saveLayout(owner, cx) {
    if (this.layoutName || this.savingLayout) return;
    const state = NameState.new("");
    const editing = { state, owner, submitted: false };
    this.layoutName = editing;
    const finish = (_event, task) => {
      if (this.layoutName !== editing || editing.submitted) return;
      editing.submitted = true;
      const name = state.value().trim();
      this.layoutName = null;
      state.release();
      if (name) {
        this.savingLayout = true;
        this.run({ operation: "save-panel-layout", owner, name }, task, () => {
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
  retainedPanels(group) {
    const visible = new Set(visiblePanels(group).map((panel) => panel.id));
    return group.members
      .filter((panel) => !visible.has(panel.id))
      .map((panel) => ({
        label: `Show ${panel.name}`,
        choose: (version, cx) =>
          this.run(
            { operation: "reveal-panel", id: panel.id },
            cx,
            undefined,
            version,
          ),
      }));
  }
  layoutItems(group) {
    const owner = group.owner;
    const items = [
      {
        label: "Save layout",
        choose: (_version, cx) => this.saveLayout(owner, cx),
      },
    ];
    for (const saved of this.layout?.savedLayouts || []) {
      if (JSON.stringify(saved.owner) !== JSON.stringify(owner)) continue;
      items.push(
        {
          label: `Load ${saved.name}`,
          choose: (version, cx) =>
            this.run(
              { operation: "load-panel-layout", owner, name: saved.name },
              cx,
              undefined,
              version,
            ),
        },
        {
          label: `Remove saved ${saved.name}`,
          choose: (version, cx) =>
            this.run(
              { operation: "remove-panel-layout", owner, name: saved.name },
              cx,
              undefined,
              version,
            ),
        },
      );
    }
    return [...items, ...this.retainedPanels(group)];
  }
  fleetMenu(fleet, voyage) {
    const items = [
      {
        label: "Rename",
        choose: (_version, cx) =>
          this.editName({ kind: "fleet", id: fleet.id }, fleet.name, cx),
      },
      {
        label: "New Fleet",
        choose: (_version, cx) =>
          this.run(
            {
              operation: "create-fleet",
              voyage: voyage.id,
              name: `Fleet ${voyage.fleets.length + 1}`,
            },
            cx,
          ),
      },
    ];
    const group = this.layout
      ? panelGroups(this.layout).find(
          (group) =>
            group.owner.kind === "fleet" && group.owner.id === fleet.id,
        )
      : undefined;
    return group ? [...items, ...this.layoutItems(group)] : items;
  }
  sidebarToggle() {
    return Button.new("toggle-sidebar")
      .accessibility_label(this.sidebar ? "Collapse sidebar" : "Expand sidebar")
      .tooltip(this.sidebar ? "Collapse sidebar" : "Expand sidebar")
      .w(28)
      .h(28)
      .p(4)
      .child("◧")
      .on_click((_event, cx) =>
        this.run({ operation: "set-sidebar", collapsed: this.sidebar }, cx),
      );
  }
  contextMenu(id, trigger, items) {
    if (this.editing || this.layoutName) return trigger;
    return this.menus.render(
      id,
      this.version,
      trigger,
      items.map((item) => ({
        label: item.label,
        choose: (version, cx) => {
          if (version !== this.version) {
            this.status = "The layout changed. Open the menu again.";
            cx.notify();
            return;
          }
          item.choose(version, cx);
        },
      })),
    );
  }
  creationControl(id, destination, trigger) {
    const creation = (this.creation ??= new CreationPicker());
    return creation.render(
      id,
      destination,
      this.version,
      (action, version, cx) => {
        if (this.busy) {
          this.status =
            "Wait for the pending workspace request. No Vessel was created.";
          cx.notify();
          return;
        }
        this.run(action, cx, undefined, version);
      },
      trigger,
    );
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
  openSplit(group, id, side, cx) {
    if (this.busy || this.editing || this.layoutName) return;
    const insertion = id ? { kind: "beside", id, side } : { kind: "empty" };
    const destination = {
      kind: "panel",
      owner: group.owner,
      insertion,
    };
    (this.creation ??= new CreationPicker()).open(
      id ? `split-${id}-${side}` : `empty-${JSON.stringify(group.owner)}`,
      destination,
      this.version,
      cx,
    );
  }
  pane(
    tree,
    group,
    path = [],
    members = new Map(group.members.map((panel) => [panel.id, panel])),
  ) {
    if (!tree) return null;
    if (tree.kind === "leaf") {
      const panel = members.get(tree.placement);
      if (!panel) throw Error("Split placement is unavailable.");
      if (panel.hidden) return null;
      return this.content(
        panel,
        {
          kind: group.owner.kind === "portals" ? "portal" : "vessel",
          id: panel.id,
        },
        group,
      );
    }
    const first = this.pane(tree.first, group, [...path, "first"], members);
    const second = this.pane(tree.second, group, [...path, "second"], members);
    if (!first || !second) return first || second;
    return NativeSplit.new(
      JSON.stringify([this.splitSession, group.owner, path]),
      tree.axis,
      tree.share ?? 5000,
      this.version,
      this.splitReset,
      (revision, share, cx) =>
        this.run(
          { operation: "resize-panel-split", owner: group.owner, path, share },
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
      .child(first)
      .child(second);
  }
  splitEdges(panel, group) {
    const edges = ["left", "right", "top", "bottom"].map((side) => {
      const id = `split-${panel.id}-${side}`;
      const trigger = Button.new(id)
        .accessibility_label(
          `Split ${group.owner.kind === "portals" ? "Portal" : "Vessel"} ${side}`,
        )
        .tooltip(`Split ${side}`)
        .opacity(
          this.splitHover === id || this.creation?.current?.id === id ? 1 : 0,
        )
        .hover((element) => element.opacity(1))
        .focus((element) => element.opacity(1))
        .w(18)
        .h(18)
        .p(0)
        .rounded(5)
        .bg("#16181cf0")
        .child({ left: "‹", right: "›", top: "⌃", bottom: "⌄" }[side]);
      const edge = div()
        .absolute()
        .w(18)
        .h(18)
        .on_hover((hovered, cx) => {
          this.splitHover = hovered ? id : null;
          cx.notify();
        });
      if (side === "left" || side === "right") {
        edge.top("50%");
        if (side === "left") edge.left(0);
        else edge.right(0);
      } else {
        edge.left("50%");
        if (side === "top") edge.top(0);
        else edge.bottom(0);
      }
      return edge.child(
        this.creationControl(
          id,
          {
            kind: "panel",
            owner: group.owner,
            insertion: { kind: "beside", id: panel.id, side },
          },
          trigger,
        ),
      );
    });
    const opening = this.creation?.current;
    if (
      opening?.destination.kind === "panel" &&
      opening.destination.insertion.kind === "beside" &&
      opening.destination.insertion.id === panel.id
    ) {
      const side = opening.destination.insertion.side;
      edges.unshift(
        div()
          .absolute()
          .left(side === "right" ? "50%" : 0)
          .top(side === "bottom" ? "50%" : 0)
          .w(side === "left" || side === "right" ? "50%" : "100%")
          .h(side === "top" || side === "bottom" ? "50%" : "100%")
          .bg("#b3d2e514")
          .border_1()
          .border_color("#b3d2e540"),
      );
    }
    return edges;
  }
  content(placement, scope, group) {
    return renderPanel(this, placement, scope, group);
  }
  sidebarRegion(layout, voyage) {
    return renderSidebar(this, layout, voyage);
  }
  fleetRegion(layout, voyage, fleet) {
    return renderFleets(this, layout, voyage, fleet);
  }
  groupRegion(group) {
    const root = group.maximizedPlacement
      ? { kind: "leaf", placement: group.maximizedPlacement }
      : group.root;
    const panel = this.pane(root, group);
    const body = div()
      .relative()
      .flex()
      .flex_col()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .p(8);
    if (
      this.layoutName &&
      JSON.stringify(this.layoutName.owner) === JSON.stringify(group.owner) &&
      (group.owner.kind === "portals" || this.layout?.view === "home")
    )
      body.child(Name.new(this.layoutName.state).w(160).h(29));
    if (panel) return body.child(panel);
    const id = `empty-${JSON.stringify(group.owner)}`;
    const trigger = Button.new(`choose-${id}`)
      .accessibility_label(
        group.owner.kind === "portals"
          ? "Choose Portal content"
          : "Choose Vessel content",
      )
      .h(28)
      .px(10)
      .text_size(12)
      .child("Choose content");
    const empty = body
      .items_center()
      .justify_center()
      .child(
        this.creationControl(
          id,
          { kind: "panel", owner: group.owner, insertion: { kind: "empty" } },
          trigger,
        ),
      );
    const retained = group.members.map((panel) => ({
      label: `Show ${panel.name}`,
      choose: (version, cx) =>
        this.run(
          { operation: "reveal-panel", id: panel.id },
          cx,
          undefined,
          version,
        ),
    }));
    return this.contextMenu(id, empty, retained);
  }
  activeRegion(layout, fleet) {
    const group = activeGroups(layout).find(
      (group) => group.owner.kind === "fleet" && group.owner.id === fleet?.id,
    );
    return group ? this.groupRegion(group) : div().flex_1();
  }
  portalControls(voyage) {
    const column = voyage.portalLayout;
    if (!column) return div();
    const controls = div().flex().items_center().gap(4).flex_shrink_0();
    const label = column.visible ? "Hide Portals" : "Show Portals";
    controls.child(
      Button.new("toggle-portals")
        .accessibility_label(label)
        .tooltip(`${label} · Ctrl+Alt+P / ⌘⌥P`)
        .w(32)
        .h(26)
        .p(3)
        .text_size(11)
        .child(column.visible ? "P ›" : "‹ P")
        .on_click((_event, cx) =>
          this.run(
            {
              operation: "set-portal-presentation",
              voyage: voyage.id,
              visible: !column.visible,
            },
            cx,
          ),
        ),
    );
    if (column.visible)
      controls.child(
        Button.new("portal-presentation")
          .accessibility_label(
            column.mode === "overlay" ? "Embed Portals" : "Overlay Portals",
          )
          .tooltip(
            `${column.mode === "overlay" ? "Embed Portals" : "Overlay Portals"} · Ctrl+Alt+Shift+P / ⌘⌥⇧P`,
          )
          .w(26)
          .h(26)
          .p(4)
          .child(
            svg(column.mode === "overlay" ? "embed.svg" : "overlay.svg").size(
              14,
            ),
          )
          .on_click((_event, cx) =>
            this.run(
              {
                operation: "set-portal-presentation",
                voyage: voyage.id,
                mode: column.mode === "overlay" ? "make-room" : "overlay",
              },
              cx,
            ),
          ),
      );
    return controls;
  }
  portalColumn(underlay, panels, voyage) {
    const column = voyage.portalLayout;
    if (!column) throw Error("Portal presentation is unavailable.");
    const revision = this.version;
    const split = Column.new(
      `portal-column-${this.splitSession}-${voyage.id}`,
      column.width,
      revision,
      this.splitReset,
      (version, width, cx) =>
        this.run(
          { operation: "set-portal-presentation", voyage: voyage.id, width },
          cx,
          undefined,
          version,
        ),
    )
      .min_w(0)
      .min_h(0)
      .flex_1();
    if (column.mode === "make-room") return split.child(underlay).child(panels);
    return div()
      .relative()
      .flex()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .child(underlay)
      .child(
        split
          .absolute()
          .left(0)
          .right(0)
          .top(0)
          .bottom(0)
          .child(div().size_full())
          .child(panels),
      );
  }
  contextRegion(layout, voyage, fleet) {
    return renderContext(this, layout, voyage, fleet);
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
    const ownerNotice = workspace_notice();
    if (ownerNotice.activityRevision !== undefined) {
      try {
        this.readActivity(ownerNotice.activityRevision);
      } catch (error) {
        this.status = errorMessage(error);
      }
    }
    if (
      ownerNotice.revision !== this.workspaceNotice.revision ||
      ownerNotice.packageRevision !== this.workspaceNotice.packageRevision
    ) {
      this.refreshRequested = true;
      if (!this.busy) this.inspectNotice(cx);
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
    if (!layout?.canvas || (!layout.voyages.length && !layout.home))
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace canvas unavailable")
        .child(this.action("Refresh", { operation: "inspect" }));
    const canvas = layout.canvas;
    const voyage = currentVoyage(layout);
    const fleet =
      layout.view === "home"
        ? voyage?.fleets[0]
        : voyage?.fleets.find((item) => item.id === layout.selectedFleet);
    shell.child(
      composeCanvas(
        canvas,
        (region) => {
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
              if (!voyage?.portalLayout?.visible) return null;
              const group = panelGroups(layout).find(
                (group) =>
                  group.owner.kind === "portals" &&
                  group.owner.voyage === voyage.id,
              );
              if (!group) return null;
              return PortalArea.new(`portal-area-${voyage.id}`, {})
                .flex()
                .flex_col()
                .bg(colors.background)
                .child(this.groupRegion(group));
            }
          }
        },
        (underlay, panels) => {
          if (!voyage) throw Error("Portal owner is unavailable.");
          return this.portalColumn(underlay, panels, voyage);
        },
      ),
    );
    if (!this.sidebar) {
      const chat = this.chat.render(colors, layout.context, true);
      if (chat)
        shell.child(
          Occluding.new().absolute().left(52).top(48).w(256).h(380).child(chat),
        );
    }
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
