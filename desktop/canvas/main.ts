import { View, div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { projection } from "voyager_theme";
import { Layer, Target, PortalArea } from "voyager_avatar";
import { take_animation_notice, window_epoch } from "voyager_avatar";
import {
  workspaceObservation as validateObservation,
  contextFacts as validateFacts,
  reportedActivity as validateReportedActivity,
} from "./validate.js";
import { invoke, openTerminal } from "./workspace.js";
import {
  request_id,
  notice as workspace_notice,
  context_facts,
  workspace_observation,
  reported_activity,
  refresh_activity,
} from "voyager_workspace";
import { NameState, Name, ArrangementCapture } from "voyager_native";
import { TerminalState, Split as NativeSplit, Column } from "voyager_native";
import { Occluding, Marker, Prepared } from "voyager_native";
import { Chat } from "./chat.js";
import {
  changedBesidesRevision,
  errorMessage,
  outcome,
  startingNotice,
  statusLine,
} from "./status.js";
import { composeRegions } from "./regions.js";
import { inspectProcesses } from "./processes.js";
import { agentsShown } from "./agents.js";
import {
  openOrRetry,
  ownCreated,
  reopens,
  terminalStatus,
} from "./terminal-open.js";
import type { Opening } from "./terminal-open.js";
import type { ProcessInfo } from "../../contract/generated/processResponse";
import type { CreationDestination, HiddenChoices } from "./creation.js";
import { CreationPicker } from "./creation.js";
import {
  acceptDockResult,
  inspectNotice,
  focusedPlacement,
  moveFocus,
  refocus,
  renderPanel,
} from "./panel-view.js";
import {
  renderSidebar,
  renderFleets,
  renderContext,
  renderNameEditor,
  renderName,
} from "./navigation-view.js";
import { WorkspaceMenu } from "./menu.js";
import { VoyageClose } from "./voyage-close.js";
import { WorktreeControls } from "./worktrees.js";
import {
  activeGroups,
  currentVoyage,
  openingPlacement,
  panelGroups,
  shownPanels,
  visiblePanels,
  hiddenPanels,
  terminalBacked,
  typeLabel,
} from "./panels.js";
import type { PanelGroup } from "./panels.js";
import type { MenuItem } from "./menu.js";
import type { Projection as ActivityProjection } from "../../contract/generated/reportedActivity";
import type { WorkspaceObservation } from "../../contract/generated/workspaceObservation";
import type { DirectorySource } from "../../contract/generated/request";
import type { Facts } from "../../contract/generated/contextFacts";

import type {
  AsyncContext,
  Context as UIContext,
  FocusHandle,
  NativeElement,
  MouseMoveEvent,
  MouseButtonEvent,
  KeyEvent,
} from "gpui-kit";
import type { Action, RenameTarget } from "../../contract/generated/request";
import type {
  Vessel,
  Context as DockContext,
  Fleet,
  Layout,
  Reply,
  Response,
  PlacementOwner as Owner,
  Voyage,
  Split,
  Placement,
} from "../../contract/generated/response";
import type { TerminalResponse } from "../../contract/generated/terminalResponse";

const CONTEXT_REFRESH_MS = 3000;
const PROCESS_QUIET_MS = 250;

type VesselContext = Extract<DockContext, { kind: "vessel" | "portal" }>;

type Editing = {
  target: RenameTarget;
  state: NameState;
  saving: boolean;
  pending?: boolean;
  name?: string;
  unconfirmed?: string;
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
type LayoutName = { state: NameState; owner: Owner; submitted: boolean };
type PresentationAction = Extract<
  Action,
  { operation: "remove-placement" | "set-portal-presentation" }
>;

export default class Canvas extends View {
  declare creation: CreationPicker | undefined;
  declare menus: WorkspaceMenu;
  worktrees = new WorktreeControls();
  declare expandedVoyages: Set<string>;
  declare version: Response["version"];
  declare contextFacts: Facts | null;
  declare contextRead: number;
  declare observation: WorkspaceObservation | null;
  declare observedPanels: WorkspaceObservation["panels"];
  declare observationRead: number;
  declare fleetChoice: {
    destination: Extract<CreationDestination, { kind: "new-fleet" }>;
    version: string;
  } | null;
  declare sidebar: boolean;
  declare dockReceipt: string;
  declare dockEpoch: string;
  declare layout: Layout | null;
  declare busy: boolean;
  declare pendingPresentation: {
    action: PresentationAction;
    target: string;
    done?: (result: Reply | null, cx: AsyncContext) => void;
  } | null;
  declare fresh: boolean;
  declare focus: FocusHandle;
  declare names: Map<string, { focus: FocusHandle; name: string }>;
  declare status: string;
  declare animationNotice: string | undefined;
  declare activityRevision: string;
  declare reportedActivity: ActivityProjection["terminals"];
  declare activityLimit: string | null;
  declare terminals: Map<string, TerminalState>;
  declare openings: Map<string, Opening>;
  declare created: ReadonlySet<string>;
  declare editing: Editing | null | undefined;
  declare afterRename: Action | null | undefined;
  declare chat: Chat;
  declare refreshRequested: boolean;
  closeVoyage = new VoyageClose();
  declare workspaceNotice: ReturnType<typeof workspace_notice>;
  declare automaticRefresh: boolean;
  declare hoveredPanel: string | null;
  declare hoveredFleet: string | null;
  processes: ProcessInfo[] = [];
  declare processPending: boolean;
  declare processStale: boolean;
  private processRead: {
    version: string;
    pending: Promise<ProcessInfo[]>;
  } | null = null;
  processError = "";
  declare collapsedGroups: Set<string>;
  declare recentOpen: boolean;
  declare splitReset: number;
  declare splitSession: string;
  declare pendingShortcuts: string[];
  declare drag: Drag | null;
  declare layoutName: LayoutName | null | undefined;
  declare savingLayout: boolean | undefined;
  declare pendingLayout:
    Extract<Action, { operation: "save-arrangement" }> | null | undefined;
  init(_props: unknown, cx: AsyncContext) {
    this.menus = new WorkspaceMenu();
    this.expandedVoyages = new Set();
    this.chat = new Chat(cx);
    this.version = "0";
    this.contextFacts = null;
    this.observation = null;
    this.observedPanels = [];
    this.observationRead = 0;
    this.fleetChoice = null;
    this.sidebar = true;
    this.collapsedGroups = new Set(["agents"]);
    this.recentOpen = false;
    this.dockReceipt = "";
    this.dockEpoch = "";
    this.layout = null;
    this.busy = false;
    this.pendingPresentation = null;
    this.fresh = false;
    this.focus = cx.focus_handle();
    this.names = new Map();
    this.refreshRequested = false;
    this.workspaceNotice = startingNotice();
    this.automaticRefresh = false;
    this.status = "Opening workspace";
    this.activityRevision = "";
    this.reportedActivity = {};
    this.activityLimit = null;
    this.terminals = new Map();
    this.openings = new Map();
    this.created = new Set();
    this.hoveredPanel = null;
    this.hoveredFleet = null;
    this.processPending = false;
    this.processStale = false;
    this.processError = "Loading agent status";
    this.splitReset = 0;
    this.splitSession = request_id();
    this.pendingShortcuts = [];
    this.drag = null;
    this.run({ operation: "inspect" }, cx);
    this.startContext(cx);
  }

  startContext(cx: AsyncContext) {
    cx.spawn(async (task) => {
      while (true) {
        await this.readContext(task);
        await this.readObservation(task);
        if (agentsShown(this.layout)) await this.readProcesses(task);
        await task.sleep(CONTEXT_REFRESH_MS);
      }
    });
  }

  get focused(): string | null {
    return focusedPlacement(this);
  }

  activePlacement(): Placement | undefined {
    if (!this.layout) return;
    const shown = shownPanels(this.layout);
    return shown.find((panel) => panel.id === this.focused) || shown[0];
  }

  async readObservation(
    cx: AsyncContext,
  ): Promise<WorkspaceObservation | null> {
    if (!this.layout) return null;
    const version = this.version;
    const active = this.activePlacement()?.id || null;
    const read = ++this.observationRead;
    let result: WorkspaceObservation | null = null;
    try {
      const value: unknown = JSON.parse(
        await workspace_observation(version, active),
      );
      if (!validateObservation(value))
        throw Error("Invalid workspace observation");
      if (value.version !== version || value.active !== active)
        throw Error("Workspace observation changed");
      if (
        value.panels.some(
          (panel) =>
            !this.layout?.vessels.some(
              (content) =>
                content.id === panel.vesselId &&
                (content.backend || null) === panel.backend,
            ),
        )
      )
        throw Error("Workspace observation belongs to different content");
      result = value;
    } catch (_) {
      result = null;
    }
    if (
      version !== this.version ||
      active !== (this.activePlacement()?.id || null)
    )
      return null;
    if (read === this.observationRead) {
      const changed =
        JSON.stringify(result) !== JSON.stringify(this.observation) ||
        JSON.stringify(result?.panels || []) !==
          JSON.stringify(this.observedPanels);
      this.observation = result;
      this.observedPanels = result?.panels || [];
      if (changed) cx.notify();
    }
    return result;
  }

  directorySource(observed: WorkspaceObservation): DirectorySource {
    const directory = observed.directory;
    if (directory.kind === "unavailable")
      throw Error("Working directory is unavailable");
    const panel = observed.panels.find(
      (item) => item.placementId === observed.active,
    );
    if (directory.kind === "live" && panel?.backend)
      return {
        kind: "live",
        placementId: panel.placementId,
        vesselId: panel.vesselId,
        backend: panel.backend,
        cwd: directory.path,
      };
    if (directory.kind === "starting" && panel)
      return {
        kind: "starting",
        placementId: panel.placementId,
        vesselId: panel.vesselId,
        cwd: directory.path,
      };
    const voyage = this.layout && currentVoyage(this.layout);
    if (directory.kind === "voyage" && voyage)
      return { kind: "voyage", voyageId: voyage.id, cwd: directory.path };
    throw Error("Working directory source changed");
  }

  createVoyage(cx: UIContext) {
    cx.spawn(async (task) => {
      try {
        const observed = await this.readObservation(task);
        if (!observed) throw Error("Working directory changed; try again");
        this.run(
          {
            operation: "create-voyage-from-source",
            source: this.directorySource(observed),
          },
          task,
        );
      } catch (error) {
        this.status = errorMessage(error);
        task.notify();
      }
    });
  }

  openFleetChoices(voyage: Voyage, cx: UIContext) {
    cx.spawn(async (task) => {
      try {
        const observed = await this.readObservation(task);
        if (!observed || this.layout?.selectedVoyage !== voyage.id)
          throw Error("Select this Voyage before creating a Fleet");
        const destination = {
          kind: "new-fleet" as const,
          voyage: voyage.id,
          name: `Fleet ${voyage.fleets.length + 1}`,
          source: this.directorySource(observed),
        };
        this.fleetChoice = { destination, version: observed.version };
        this.creation ||= new CreationPicker();
        this.creation.open(
          `fleet-choices-${voyage.id}`,
          destination,
          observed.version,
          task,
        );
      } catch (error) {
        this.status = errorMessage(error);
        task.notify();
      }
    });
  }

  fleetCreationControl(voyage: Voyage, trigger: NativeElement): NativeElement {
    trigger.on_click((_event, cx) => this.openFleetChoices(voyage, cx));
    const choice = this.fleetChoice;
    if (!choice || choice.destination.voyage !== voyage.id || !this.creation)
      return trigger;
    return this.creation.render(
      `fleet-choices-${voyage.id}`,
      choice.destination,
      choice.version,
      (action, version, cx) => {
        if (version !== this.version) {
          this.status = "Workspace changed; reopen the Fleet choices";
          cx.notify();
          return;
        }
        this.run(action, cx);
      },
      trigger,
      undefined,
      false,
    );
  }

  async readContext(cx: AsyncContext) {
    if (!this.layout) return;
    const version = this.version;
    const scope = JSON.stringify(this.layout.context);
    const read = (this.contextRead = (this.contextRead ?? 0) + 1);
    let facts: Facts | null = null;
    try {
      const value: unknown = JSON.parse(await context_facts());
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

  async readProcesses(cx: AsyncContext) {
    this.processStale = this.processPending;
    if (this.processPending) return;
    const version = this.version;
    this.processPending = true;
    try {
      const observed = await this.processSnapshot(version);
      if (
        this.version === version &&
        (this.processError ||
          JSON.stringify(this.processes) !== JSON.stringify(observed))
      ) {
        this.processes = observed;
        this.processError = "";
        cx.notify();
      }
    } catch (error) {
      if (this.version === version) {
        const message = errorMessage(error);
        if (this.processes.length || this.processError !== message) {
          this.processes = [];
          this.processError = message;
          cx.notify();
        }
      }
    } finally {
      if (this.processStale) await cx.sleep(PROCESS_QUIET_MS);
      this.processPending = false;
    }
    if (this.processStale) await this.readProcesses(cx);
  }

  private async processSnapshot(version: string): Promise<ProcessInfo[]> {
    if (this.processRead?.version === version) return this.processRead.pending;
    const read = { version, pending: inspectProcesses(version) };
    this.processRead = read;
    try {
      return await read.pending;
    } finally {
      if (this.processRead === read) this.processRead = null;
    }
  }

  async hiddenChoices(
    destination: Extract<Action, { operation: "create-vessel" }>["destination"],
    version: string,
  ): Promise<HiddenChoices> {
    let observed: ProcessInfo[] = [];
    let error: string | undefined;
    try {
      observed = await this.processSnapshot(version);
    } catch (failure) {
      error = `Running viewers unavailable: ${errorMessage(failure)}`;
    }
    if (!this.layout || this.version !== version)
      throw Error("Workspace changed; reopen the content chooser.");
    return { panels: hiddenPanels(this.layout, destination, observed), error };
  }

  presentationTarget(action: PresentationAction): string | null {
    if (!this.layout) return null;
    const groups = panelGroups(this.layout).filter(
      (group) => !group.voyage.closed,
    );
    if (action.operation === "set-portal-presentation") {
      const group = groups.find(
        (item) =>
          item.owner.kind === "portals" && item.owner.voyage === action.voyage,
      );
      return group
        ? JSON.stringify([group.owner, group.voyage.portalLayout])
        : null;
    }
    const group = groups.find((item) =>
      visiblePanels(item).some((panel) => panel.id === action.id),
    );
    const panel = group?.members.find((item) => item.id === action.id);
    return group && panel
      ? JSON.stringify([
          group.owner,
          group.root,
          group.maximizedPlacement,
          panel.vessel,
        ])
      : null;
  }

  finishPresentation(cx: UIContext, ready: boolean) {
    const pending = this.pendingPresentation;
    if (!pending || (ready && this.busy)) return;
    this.pendingPresentation = null;
    if (!ready) {
      this.status =
        `${this.status} The waiting panel action was not sent.`.trim();
    } else if (this.presentationTarget(pending.action) !== pending.target) {
      this.status = "The panel changed. Its waiting action was not sent.";
    } else {
      this.run(pending.action, cx, pending.done, this.version);
    }
  }

  run(
    action: Action,
    cx: UIContext,
    done?: (result: Reply | null, cx: AsyncContext) => void,
    expectedVersion: string = this.version,
    prepareContents = true,
  ) {
    this.drag = null;
    if (this.busy) {
      if (
        action.operation === "resize-placement-split" ||
        (action.operation === "set-portal-presentation" &&
          action.width !== undefined)
      ) {
        this.splitReset += 1;
        this.status =
          "Resize was not saved while another workspace request was pending.";
        cx.notify();
        return;
      }
      if (
        action.operation === "remove-placement" ||
        action.operation === "set-portal-presentation"
      ) {
        const target = this.presentationTarget(action);
        if (expectedVersion !== this.version || target === null) {
          this.status = "The panel changed. Reopen its controls.";
        } else if (this.pendingPresentation) {
          this.status =
            "A panel action is already waiting for workspace preparation.";
        } else {
          this.pendingPresentation = { action: { ...action }, target, done };
          this.status =
            "Finishing workspace preparation before the panel action.";
        }
        cx.notify();
        return;
      }
      if (action.operation === "save-arrangement" && this.savingLayout) {
        this.pendingLayout = action;
      } else if (this.editing?.saving || this.savingLayout) {
        if (
          ["home", "select-voyage", "select-fleet"].includes(action.operation)
        )
          this.afterRename = action;
        else this.status = "Wait for the name change to finish.";
        cx.notify();
      } else if (action.operation !== "inspect") {
        this.status =
          "Workspace preparation is pending. This action was not sent.";
        cx.notify();
      }
      return;
    }
    const retryRefusals = !this.automaticRefresh;
    if (action.operation === "inspect") this.refreshRequested = false;
    const changesSelection = [
      "create-voyage-from-source",
      "create-fleet-with-vessel",
      "close-fleet",
      "reopen-fleet",
      "close-voyage",
      "reopen-voyage",
      "create-fleet",
      "select-fleet",
      "create-voyage",
      "select-voyage",
    ].includes(action.operation);
    const oldLayout = this.layout;
    const maximization =
      action.operation === "set-placement-maximized" ? action : null;
    const creating =
      ["create-vessel", "reopen-placement"].includes(action.operation) &&
      "destination" in action
        ? action
        : null;
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
          (panel) => this.terminals.get(panel.vessel)?.rememberFocus() === true,
        );
    this.busy = true;
    const dockEpoch = action.operation === "dock" ? window_epoch() : "";
    const previousContents = new Set(
      this.layout?.vessels?.map((item) => item.id) || [],
    );
    cx.spawn(async (task) => {
      let result: Reply | null = null;
      let accepted = false;
      let prepared = false;
      try {
        result = await invoke(action, expectedVersion);
        accepted = this.acceptSnapshot(result, task);
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
            const allowed = ownCreated(action, previousContents, result.layout);
            await this.prepare(task, !result.createdWorkspace, retry, allowed);
            prepared = true;
            const current = this.layout;
            const shown = shownPanels(current);
            const created = shown.find(
              (panel) => !previousContents.has(panel.vessel),
            );
            const opened = openingPlacement(current);
            if (changesSelection) moveFocus(this, "opening", task);
            else if (creating && created)
              moveFocus(this, { placement: created.id }, task);
            if (transferFocus) {
              const target = maximization
                ? shown.find((panel) => panel.id === maximization.id)
                : splitMaximized
                  ? created
                  : opened;
              if (target && (maximization || splitMaximized))
                moveFocus(this, { placement: target.id }, task);
              if (target) this.terminals.get(target.vessel)?.focusIfUnchanged();
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
      try {
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
        this.finishPresentation(
          task,
          accepted &&
            result?.status === "applied" &&
            this.fresh &&
            (prepared || !prepareContents),
        );
        task.notify();
        if (!prepared) this.pendingShortcuts = [];
      } finally {
        if (!this.busy && this.refreshRequested) inspectNotice(this, task);
      }
      if (!this.busy) this.flushShortcuts(task, prepared);
    });
    cx.notify();
  }

  acceptSnapshot(result: Reply, task: AsyncContext) {
    this.drag = null;
    if (!("layout" in result)) {
      this.status = outcome(result);
      if (result.status === "uncertain") this.fresh = false;
      this.splitReset += 1;
      return false;
    }
    if (BigInt(result.version) < BigInt(this.version)) {
      if (result.status !== "applied") this.status = outcome(result);
      return false;
    }
    if (this.menus) this.menus.current = null;
    if (this.creation) this.creation.current = null;
    this.version = result.version;
    this.splitReset += 1;
    this.layout = result.layout;
    this.created = new Set(result.createdVessels);
    if (!this.focused && result.layout.view === "fleet")
      moveFocus(this, "opening", task);
    if (
      this.focused &&
      !shownPanels(result.layout).some((panel) => panel.id === this.focused) &&
      !this.chat?.open &&
      !this.editing &&
      !this.layoutName &&
      !window.has_active_dialog()
    ) {
      moveFocus(this, "opening", task);
      refocus(this, task);
    }
    this.closeVoyage.observe(result.closePlan);
    for (const voyage of result.layout.voyages.filter((item) => !item.closed))
      if (voyage.cwd)
        this.worktrees?.inspect(voyage.id, voyage.cwd, result.version, task);
    this.observedPanels = (this.observedPanels || []).filter((panel) =>
      panelGroups(result.layout).some((group) =>
        group.members.some(
          (placement) =>
            placement.id === panel.placementId &&
            placement.vessel === panel.vesselId &&
            result.layout.vessels.some(
              (content) =>
                content.id === panel.vesselId &&
                (content.backend || null) === panel.backend,
            ),
        ),
      ),
    );
    task.spawn((cx) => this.readProcesses(cx));
    this.observation = null;
    task.spawn((cx) => this.readObservation(cx));
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
    this.status = outcome(result);
    const retain = (target: RenameTarget, name: string) => {
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
        for (const vessel of fleet.placements)
          retain({ kind: "vessel", id: vessel.id }, this.contentName(vessel));
      }
    }
    return true;
  }

  target(
    id: string,
    scope: DockContext,
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

  contentName(placement: Placement): string {
    return (
      (placement.nameOrigin === "automatic" ? this.observedPanels : [])?.find(
        (panel) => panel.placementId === placement.id,
      )?.effectiveName || placement.name
    );
  }

  panelLabel(placement: Placement): string {
    const observed = this.observedPanels?.find(
      (panel) => panel.placementId === placement.id,
    );
    const content = this.layout?.vessels.find(
      (item) => item.id === placement.vessel,
    );
    const directory = observed?.directory;
    const path =
      directory && directory.kind !== "unavailable"
        ? directory.path
        : content?.cwd;
    const folder = path
      ?.replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop();
    const program = observed?.program || typeLabel(content?.typeId);
    const name = this.contentName(placement);
    return [program, folder, name !== folder ? name : null]
      .filter(Boolean)
      .join(" · ");
  }

  visibleVessels(fleet: Fleet | undefined): Placement[] {
    return fleet
      ? visiblePanels({ root: fleet.root ?? null, members: fleet.placements })
      : [];
  }

  displayedVessels(fleet: Fleet | undefined): Placement[] {
    return fleet
      ? visiblePanels(
          {
            root: fleet.root ?? null,
            members: fleet.placements,
            maximizedPlacement: fleet.maximizedPlacement,
          },
          true,
        )
      : [];
  }

  panelGroup(id: string): PanelGroup | undefined {
    return this.layout
      ? panelGroups(this.layout).find((group) =>
          group.members.some((panel) => panel.id === id),
        )
      : undefined;
  }

  async prepare(
    task: AsyncContext,
    existingOnly = false,
    retry: Set<string> = new Set(),
    allowed: Set<string> = new Set(),
  ): Promise<void> {
    const layout = this.layout;
    if (!layout) throw Error("Workspace snapshot is unavailable.");
    for (const id of this.created) allowed.add(id);
    const errors: string[] = [];
    const visited = new Set<string>();
    for (const vessel of shownPanels(layout)) {
      visited.add(vessel.vessel);
      const content = layout.vessels.find((item) => item.id === vessel.vessel);
      if (!content || !terminalBacked(content.typeId)) continue;
      const opening = this.openings.get(vessel.vessel);
      if (allowed.has(vessel.vessel) && reopens(content, opening)) {
        this.openings.delete(vessel.vessel);
        this.terminals.delete(vessel.vessel);
      }
      if (
        content?.backend &&
        !content.startPending &&
        this.openings.get(vessel.vessel)?.status === "unbound"
      )
        this.openings.delete(vessel.vessel);
      if (
        existingOnly &&
        (!content?.backend || content.startPending) &&
        !retry.has(vessel.vessel) &&
        !allowed.has(vessel.vessel)
      ) {
        if (!this.openings.has(vessel.vessel))
          this.openings.set(vessel.vessel, { status: "unbound" });
        continue;
      }
      if (this.openings.has(vessel.vessel)) continue;
      this.openings.set(vessel.vessel, {
        status: "pending",
        intent: content.shellIntent,
      });
      let opened: TerminalResponse;
      try {
        opened = await openOrRetry(
          () => openTerminal(vessel.vessel, this.version),
          async () => {
            const current = await invoke(
              { operation: "inspect" },
              this.version,
            );
            this.acceptSnapshot(current, task);
            const usable = current.status === "applied" && current.fresh;
            return usable ? this.layout : null;
          },
          content,
        );
      } catch (error) {
        this.openings.set(vessel.vessel, {
          status: "uncertain",
          message: errorMessage(error),
          intent: content.shellIntent,
        });
        this.fresh = false;
        throw error;
      }
      this.openings.set(vessel.vessel, {
        ...opened,
        intent: content.shellIntent,
      });
      if (opened.status === "applied")
        this.terminals.set(vessel.vessel, TerminalState.new(vessel.vessel));
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
    if (
      this.layout &&
      shownPanels(this.layout).some((panel) => !visited.has(panel.vessel))
    )
      await this.prepare(task, existingOnly, retry, allowed);
    if (errors.length) throw Error(errors[0]);
  }

  terminalStatus(content: Vessel): string {
    return terminalStatus(content, this.openings.get(content.id));
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
          ? { operation: "move-placement", id, target, side }
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

  maximizeShortcut(id: string, event: KeyEvent, cx: UIContext) {
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
        operation: "set-placement-maximized",
        id,
        maximized: group.maximizedPlacement !== id,
      },
      cx,
    );
  }

  shortcut(event: KeyEvent, cx: UIContext) {
    if (this.editing || this.layoutName || this.menus?.current) return;
    const { control, shift, alt, platform } = event.modifiers;
    if (
      ((control && !platform) || (platform && !control)) &&
      alt &&
      event.key.toLowerCase() === "p"
    ) {
      const voyage = this.layout ? currentVoyage(this.layout) : undefined;
      if (voyage?.portalLayout) {
        if (!shift) {
          this.togglePortals(voyage, cx);
          cx.stop_propagation();
          return;
        }
        const action: Action = {
          operation: "set-portal-presentation",
          voyage: voyage.id,
          mode:
            voyage.portalLayout.mode === "overlay" ? "make-room" : "overlay",
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

  flushShortcuts(cx: UIContext, applied: boolean) {
    if (!applied) this.pendingShortcuts = [];
    while (!this.busy && this.pendingShortcuts.length) {
      const key = this.pendingShortcuts.shift();
      if (key) this.dispatchShortcut(key, cx);
    }
  }

  dispatchShortcut(key: string, cx: UIContext) {
    const layout = this.layout;
    if (!layout) return;
    const voyage = currentVoyage(layout);
    if (!voyage) return;
    if (key === "t") {
      if (layout.view === "home") return;
      this.openFleetChoices(voyage, cx);
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

  refreshActivity(cx: UIContext) {
    cx.spawn(async (task) => {
      try {
        await refresh_activity();
      } catch (error) {
        this.status = errorMessage(error);
      }
      task.notify();
    });
  }

  readActivity(revision: string, cx: UIContext) {
    if (this.activityRevision === revision) return;
    const value: unknown = JSON.parse(reported_activity());
    if (!validateReportedActivity(value))
      throw Error("Invalid reported activity");
    this.reportedActivity = value.terminals;
    this.activityLimit = value.limited
      ? (value.reason ?? "Bound terminal observation limit exceeded")
      : null;
    this.activityRevision = revision;
    if (agentsShown(this.layout)) cx.spawn((task) => this.readProcesses(task));
  }

  action(
    label: string,
    action: Action | null,
    selected = false,
    rename: RenameTarget | null = null,
    displayLabel = label,
  ): NativeElement {
    const colors = projection();
    const key = JSON.stringify(rename);
    const focus = this.names.get(key)?.focus;
    const fleet = rename?.kind === "fleet";
    const voyage = rename?.kind === "voyage";
    const placement = rename?.kind === "vessel" || rename?.kind === "portal";
    if (rename && this.editing && key === JSON.stringify(this.editing.target))
      return renderNameEditor(this, this.editing.state, rename.id);
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
      .bg("#00000000")
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
      .children(renderName(rename, displayLabel));
    if (voyage) button.flex_1().min_w(0).px(0);
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

  saveLayout(owner: Owner, cx: UIContext) {
    if (this.layoutName || this.savingLayout) return;
    const state = NameState.new("");
    const editing = { state, owner, submitted: false };
    this.layoutName = editing;
    const finish = (_event: unknown, task: UIContext) => {
      if (this.layoutName !== editing || editing.submitted) return;
      editing.submitted = true;
      const name = state.value().trim();
      this.layoutName = null;
      state.release();
      if (name) {
        this.savingLayout = true;
        this.run({ operation: "save-arrangement", owner, name }, task, () => {
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

  layoutItems(group: PanelGroup): MenuItem[] {
    const owner = group.owner;
    const items: MenuItem[] = [
      {
        label: "Save layout",
        choose: (_version, cx) => this.saveLayout(owner, cx),
      },
    ];
    for (const saved of this.layout?.arrangements || []) {
      if (JSON.stringify(saved.owner) !== JSON.stringify(owner)) continue;
      items.push(
        {
          label: `Load ${saved.name}`,
          choose: (version, cx) =>
            this.run(
              { operation: "load-arrangement", owner, name: saved.name },
              cx,
              undefined,
              version,
            ),
        },
        {
          label: `Remove saved ${saved.name}`,
          choose: (version, cx) =>
            this.run(
              { operation: "remove-arrangement", owner, name: saved.name },
              cx,
              undefined,
              version,
            ),
        },
      );
    }
    return items;
  }

  closedVoyageItems(): MenuItem[] {
    return (this.layout?.voyages || [])
      .filter((item) => item.closed && this.worktrees.available(item.cwd))
      .sort((a, b) => {
        const first = BigInt(a.closedOrder || "0");
        const second = BigInt(b.closedOrder || "0");
        return first === second ? 0 : first > second ? -1 : 1;
      })
      .slice(0, 10)
      .map((item) => ({
        label: `Reopen ${item.name}`,
        marker: { role: "reopen-voyage", key: item.id },
        choose: (version, cx) =>
          this.run(
            { operation: "reopen-voyage", id: item.id },
            cx,
            undefined,
            version,
          ),
      }));
  }

  closedFleetItems(voyage: Voyage): MenuItem[] {
    return voyage.fleets
      .filter((item) => item.closed)
      .map((item) => ({
        label: `Reopen ${item.name}`,
        choose: (version, cx) =>
          this.run(
            { operation: "reopen-fleet", id: item.id },
            cx,
            undefined,
            version,
          ),
      }));
  }

  fleetMenu(fleet: Fleet, voyage: Voyage): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: "Rename",
        choose: (_version, cx) =>
          this.editName({ kind: "fleet", id: fleet.id }, fleet.name, cx),
      },
      {
        label: "New Fleet",
        choose: (_version, cx) => this.openFleetChoices(voyage, cx),
      },
    ];
    if (voyage.id !== this.layout?.home?.id)
      items.push({
        label: "Close",
        choose: (version, cx) =>
          this.run(
            { operation: "close-fleet", id: fleet.id },
            cx,
            undefined,
            version,
          ),
      });
    items.push(...this.closedFleetItems(voyage));
    const group = this.layout
      ? panelGroups(this.layout).find(
          (group) =>
            group.owner.kind === "fleet" && group.owner.id === fleet.id,
        )
      : undefined;
    return group ? [...items, ...this.layoutItems(group)] : items;
  }

  sidebarToggle(): NativeElement {
    return Button.new("toggle-sidebar")
      .child(Marker.new("sidebar-toggle"))
      .accessibility_label(this.sidebar ? "Collapse sidebar" : "Expand sidebar")
      .tooltip(this.sidebar ? "Collapse sidebar" : "Expand sidebar")
      .w(32)
      .h(32)
      .p(5)
      .child(
        svg(this.sidebar ? "sidebar-collapse.svg" : "sidebar.svg").size(17),
      )
      .on_click((_event, cx) =>
        this.run({ operation: "set-sidebar", collapsed: this.sidebar }, cx),
      );
  }

  contextMenu(
    id: string,
    trigger: NativeElement,
    items: MenuItem[],
  ): NativeElement {
    if (this.editing || this.layoutName || !items.length) return trigger;
    return this.menus.render(
      id,
      this.version,
      trigger,
      items.map((item) => ({
        ...item,
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

  creationControl(
    id: string,
    destination: Extract<Action, { operation: "create-vessel" }>["destination"],
    trigger: NativeElement,
    triggerOpens = true,
  ): NativeElement {
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
      () => this.hiddenChoices(destination, this.version),
      triggerOpens,
      (destination, cx) => {
        if (
          destination.kind !== "placement" ||
          destination.owner.kind !== "portals"
        )
          return;
        const owner = destination.owner;
        const group =
          this.layout &&
          panelGroups(this.layout).find(
            (item) =>
              item.owner.kind === "portals" &&
              item.owner.voyage === owner.voyage,
          );
        if (group?.voyage.portalLayout?.visible && !visiblePanels(group).length)
          this.run(
            {
              operation: "set-portal-presentation",
              voyage: owner.voyage,
              visible: false,
            },
            cx,
          );
      },
    );
  }

  statusView(): NativeElement {
    return statusLine(
      this.status || this.worktrees?.status || "",
      this.action("Refresh", { operation: "inspect" }),
    );
  }

  openSplit(
    group: PanelGroup,
    id: string | undefined,
    side: "left" | "right" | "top" | "bottom",
    cx: UIContext,
  ) {
    if (this.busy || this.editing || this.layoutName) return;
    const insertion = id
      ? { kind: "beside" as const, id, side }
      : { kind: "empty" as const };
    const destination = {
      kind: "placement" as const,
      owner: group.owner,
      insertion,
    };
    (this.creation ??= new CreationPicker()).open(
      id ? `split-${id}-${side}` : `empty-${JSON.stringify(group.owner)}`,
      destination,
      this.version,
      cx,
      () => this.hiddenChoices(destination, this.version),
    );
  }

  pane(
    tree: Split | null,
    group: PanelGroup,
    path: Extract<Action, { operation: "resize-placement-split" }>["path"] = [],
    members = new Map(group.members.map((panel) => [panel.id, panel])),
  ): NativeElement | null {
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
          {
            operation: "resize-placement-split",
            owner: group.owner,
            path,
            share,
          },
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

  splitControl(
    panel: Placement,
    group: PanelGroup,
    side: "right" | "bottom",
  ): NativeElement {
    const entity = group.owner.kind === "portals" ? "Portal" : "Vessel";
    const id = `split-${panel.id}-${side}`;
    return this.creationControl(
      id,
      {
        kind: "placement",
        owner: group.owner,
        insertion: { kind: "beside", id: panel.id, side },
      },
      Button.new(id)
        .child(Marker.new(`split-${side}`, panel.id))
        .accessibility_label(`Split ${entity} ${side}`)
        .tooltip(
          side === "right" ? "Split side by side" : "Split above and below",
        )
        .opacity(
          this.hoveredPanel === panel.id || this.creation?.current?.id === id
            ? 1
            : 0,
        )
        .hover((element) => element.opacity(1))
        .focus((element) => element.opacity(1))
        .w(22)
        .h(22)
        .p(4)
        .child(
          svg(
            side === "right" ? "split-horizontal.svg" : "split-vertical.svg",
          ).size(12),
        ),
    );
  }

  splitPreview(panel: Placement): NativeElement[] {
    const edges: NativeElement[] = [];
    const opening = this.creation?.current;
    if (
      opening?.destination.kind === "placement" &&
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

  content(
    placement: Placement,
    scope: VesselContext,
    group: PanelGroup,
  ): NativeElement {
    return renderPanel(this, placement, scope, group);
  }

  sidebarRegion(layout: Layout, voyage: Voyage | undefined): NativeElement {
    return renderSidebar(this, layout, voyage);
  }

  fleetRegion(
    layout: Layout,
    voyage: Voyage | undefined,
    fleet: Fleet | undefined,
  ): NativeElement {
    return renderFleets(this, layout, voyage, fleet);
  }

  groupRegion(group: PanelGroup): NativeElement {
    const root = group.maximizedPlacement
      ? { kind: "leaf" as const, placement: group.maximizedPlacement }
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
    if (group.owner.kind === "portals") return body;
    const id = `empty-${JSON.stringify(group.owner)}`;
    const trigger = Button.new(`choose-${id}`)
      .accessibility_label("Choose Vessel content")
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
          {
            kind: "placement",
            owner: group.owner,
            insertion: { kind: "empty" },
          },
          trigger,
        ),
      );
    return empty;
  }

  activeRegion(layout: Layout, fleet: Fleet | undefined): NativeElement {
    const group = activeGroups(layout).find(
      (group) => group.owner.kind === "fleet" && group.owner.id === fleet?.id,
    );
    return group ? this.groupRegion(group) : div().flex_1();
  }

  compactPortalContext(): boolean {
    const layout = this.layout;
    const voyage = layout && currentVoyage(layout);
    const context = layout?.context;
    return (
      context?.kind === "portal" &&
      !voyage?.portalLayout?.visible &&
      Boolean(voyage?.portals.some((panel) => panel.id === context.id))
    );
  }

  togglePortals(voyage: Voyage, cx: UIContext) {
    const column = voyage.portalLayout;
    if (!column) return;
    const visible = !column.visible;
    this.run(
      { operation: "set-portal-presentation", voyage: voyage.id, visible },
      cx,
      (result, task) => {
        if (
          !visible ||
          result?.status !== "applied" ||
          !result.fresh ||
          result.version !== this.version
        )
          return;
        const group = panelGroups(result.layout).find(
          (item) =>
            item.owner.kind === "portals" && item.owner.voyage === voyage.id,
        );
        if (
          !group ||
          visiblePanels(group).length ||
          !group.voyage.portalLayout?.visible ||
          !this.layout ||
          currentVoyage(this.layout)?.id !== voyage.id
        )
          return;
        const destination = {
          kind: "placement" as const,
          owner: group.owner,
          insertion: { kind: "empty" as const },
        };
        (this.creation ??= new CreationPicker()).open(
          `portal-choices-${voyage.id}`,
          destination,
          result.version,
          task,
          () => this.hiddenChoices(destination, result.version),
        );
      },
    );
  }

  portalColumn(
    underlay: NativeElement,
    panels: NativeElement,
    voyage: Voyage,
  ): NativeElement {
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

  contextRegion(
    layout: Layout,
    voyage: Voyage | undefined,
    fleet: Fleet | undefined,
  ): NativeElement {
    return renderContext(this, layout, voyage, fleet);
  }

  render(cx: UIContext): NativeElement {
    const animationNotice = take_animation_notice();
    if (animationNotice !== null) {
      if (animationNotice || this.status === this.animationNotice)
        this.status = animationNotice;
      this.animationNotice = animationNotice;
    }
    try {
      acceptDockResult(this, cx);
    } catch (error) {
      this.status = errorMessage(error);
    }
    const ownerNotice = workspace_notice();
    if (ownerNotice.activityRevision !== undefined) {
      try {
        this.readActivity(ownerNotice.activityRevision, cx);
      } catch (error) {
        this.status = errorMessage(error);
      }
    }
    if (
      ownerNotice.revision !== this.workspaceNotice.revision ||
      changedBesidesRevision(ownerNotice, this.workspaceNotice)
    ) {
      this.refreshRequested = true;
      if (!this.busy) inspectNotice(this, cx);
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
      .text_color(colors.foreground)
      .child(Prepared.new(!this.busy));
    const layout = this.layout;
    if (!layout?.canvas || (!layout.voyages.length && !layout.home))
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace canvas unavailable")
        .child(Marker.new("workspace-status", "", this.status || ""))
        .child(this.action("Refresh", { operation: "inspect" }));
    const canvas = layout.canvas;
    const voyage = currentVoyage(layout);
    const fleet =
      layout.view === "home"
        ? voyage?.fleets[0]
        : voyage?.fleets.find((item) => item.id === layout.selectedFleet);
    shell.child(
      composeRegions(
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
              return div()
                .flex()
                .flex_col()
                .size_full()
                .bg(colors.background)
                .child(
                  PortalArea.new(`portal-area-${voyage.id}`, {})
                    .child(this.groupRegion(group))
                    .child(Marker.new("portal-area", voyage.id)),
                );
            }
          }
        },
        (underlay, panels) => {
          if (!voyage) throw Error("Portal owner is unavailable.");
          return this.portalColumn(underlay, panels, voyage);
        },
      ),
    );
    if (!this.sidebar && this.chat.present) {
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
