import { div } from "gpui-kit";
import { VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { Name, NameState } from "voyager_native";
import { request_id, worktree } from "voyager_workspace";
import {
  worktreeRequest as validRequest,
  worktreeResponse as validResponse,
} from "./validate.js";
import { menuButton } from "./menu.js";
import { actionButton, dialogActions } from "./ui.js";
function pathKey(path) {
  return path === "/" ? path : path.replace(/\/+$/, "");
}
async function call(voyage, version, action) {
  const request = {
    requestId: request_id(),
    expectedVersion: version,
    voyage,
    action,
  };
  if (!validRequest(request)) throw Error("Invalid worktree request");
  const raw = JSON.parse(await worktree(JSON.stringify(request)));
  if (!validResponse(raw) || raw.requestId !== request.requestId)
    throw Error("Worktree result was not confirmed");
  return raw;
}
export class WorktreeControls {
  constructor() {
    this.status = "";
    this.observations = new Map();
    this.current = null;
    this.discovery = Promise.resolve();
  }
  inspect(voyage, cwd, version, cx) {
    const previous = this.observations.get(voyage);
    if (previous?.cwd === cwd && previous.pending) {
      previous.latestVersion = version;
      return;
    }
    if (
      previous?.cwd === cwd &&
      (previous.pending || previous.checkouts || previous.version === version)
    )
      return;
    const observation = {
      cwd,
      version,
      pending: true,
      checkouts: null,
    };
    this.observations.set(voyage, observation);
    const before = this.discovery;
    let release;
    this.discovery = new Promise((done) => {
      release = done;
    });
    cx.spawn(async (task) => {
      await before;
      try {
        if (this.observations.get(voyage) !== observation) return;
        observation.version = observation.latestVersion || version;
        const result = await call(voyage, observation.version, {
          operation: "list",
        });
        if (this.observations.get(voyage) !== observation) return;
        if (result.status === "applied")
          observation.checkouts = result.checkouts;
      } catch {
        if (this.observations.get(voyage) !== observation) return;
      } finally {
        observation.pending = false;
        release();
        task.notify();
        if (
          this.observations.get(voyage) === observation &&
          !observation.checkouts &&
          observation.latestVersion &&
          observation.latestVersion !== observation.version
        )
          this.inspect(voyage, cwd, observation.latestVersion, task);
      }
    });
  }
  available(cwd) {
    if (!cwd) return true;
    for (const observation of this.observations.values()) {
      const main = observation.checkouts?.find((checkout) => checkout.main);
      if (
        !main ||
        ![".worktrees", ".worktree"].some((folder) =>
          pathKey(cwd).startsWith(`${main.path}/${folder}/`),
        )
      )
        continue;
      return observation.checkouts.some(
        (checkout) =>
          !checkout.main &&
          !checkout.prunable &&
          (pathKey(cwd) === checkout.path ||
            pathKey(cwd).startsWith(checkout.path + "/")),
      );
    }
    return true;
  }
  canRemove(voyage, cwd) {
    return Boolean(
      this.observations
        .get(voyage)
        ?.checkouts?.some(
          (checkout) =>
            !checkout.main &&
            (pathKey(checkout.path) === pathKey(cwd) ||
              pathKey(cwd).startsWith(checkout.path + "/")),
        ),
    );
  }
  open(voyage, version, cx, mode = "open", cwd = "") {
    this.current?.input.release();
    this.current?.scroll.release();
    this.current = null;
    const opening = {
      voyage,
      version,
      checkouts: null,
      pending: false,
      message: "",
      mode,
      cwd,
      input: NameState.new(""),
      selected: 0,
      scroll: VirtualListScrollHandle.new(),
    };
    opening.input.on("change", (_event, task) => {
      opening.selected = 0;
      if (this.shown(opening).length) opening.scroll.scroll_to_item(0);
      window.refresh();
      task.notify();
    });
    opening.input.on("submit", (_event, task) => this.choose(opening, task));
    this.current = opening;
    window.open_dialog(() => this.render() || div(), {
      escape_dismissable: false,
      backdrop_dismissable: false,
    });
    if (mode !== "remove") opening.input.focus();
    this.list(opening, cx);
    cx.notify();
  }
  close() {
    if (!this.current) return;
    this.current.input.release();
    this.current.scroll.release();
    this.current = null;
    window.close_dialog();
  }
  shown(opening) {
    const filter = opening.input.value().trim().toLowerCase();
    return (opening.checkouts || []).filter(
      (checkout) =>
        !checkout.main &&
        !checkout.prunable &&
        /\/\.worktrees?\//.test(checkout.path) &&
        `${checkout.branch || ""} ${checkout.path}`
          .toLowerCase()
          .includes(filter),
    );
  }
  choose(opening, cx) {
    if (opening.pending || !opening.checkouts) return;
    if (opening.mode === "new") {
      const branch = opening.input.value().trim();
      const name = branch
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!name) {
        opening.message = "Enter a branch name.";
        window.refresh();
        cx.notify();
        return;
      }
      this.apply(
        opening,
        { operation: "create", name, branch, base: "HEAD" },
        cx,
      );
    } else if (opening.mode === "remove") {
      const checkout = opening.checkouts.find(
        (item) =>
          !item.main &&
          (pathKey(item.path) === pathKey(opening.cwd) ||
            pathKey(opening.cwd).startsWith(item.path + "/")),
      );
      if (checkout && checkout.dirty === false)
        this.apply(opening, { operation: "remove", path: checkout.path }, cx);
    } else {
      const checkout = this.shown(opening)[opening.selected];
      if (checkout)
        this.apply(opening, { operation: "open", path: checkout.path }, cx);
    }
  }
  list(opening, cx) {
    if (opening.pending) return;
    opening.pending = true;
    opening.message = "";
    cx.spawn(async (task) => {
      try {
        const result = await call(opening.voyage, opening.version, {
          operation: "list",
        });
        if (this.current !== opening) return;
        if (result.status === "applied") {
          opening.checkouts = result.checkouts;
          const common = result.checkouts[0]?.commonDir;
          for (const [id, observation] of this.observations) {
            if (
              id === opening.voyage ||
              observation.checkouts?.some(
                (checkout) => checkout.commonDir === common,
              )
            )
              observation.checkouts = result.checkouts;
          }
        } else opening.message = result.message || "Worktrees are unavailable.";
      } catch (error) {
        if (this.current !== opening) return;
        opening.message =
          error instanceof Error ? error.message : String(error);
      }
      opening.pending = false;
      window.refresh();
      task.notify();
    });
  }
  apply(opening, action, cx) {
    if (opening.pending || action.operation === "list") return;
    opening.pending = true;
    opening.message = "";
    this.status = "";
    cx.spawn(async (task) => {
      try {
        const result = await call(opening.voyage, opening.version, action);
        opening.pending = false;
        if (result.status === "applied") {
          if (action.operation === "remove") {
            for (const observation of this.observations.values()) {
              if (
                observation.checkouts?.some(
                  (checkout) => checkout.path === action.path,
                )
              ) {
                observation.checkouts = result.checkouts;
              }
            }
          } else {
            const checkout = result.checkouts[0];
            if (checkout)
              for (const observation of this.observations.values()) {
                if (
                  observation.checkouts?.some(
                    (item) => item.commonDir === checkout.commonDir,
                  )
                ) {
                  observation.checkouts = [
                    ...observation.checkouts.filter(
                      (item) => item.path !== checkout.path,
                    ),
                    checkout,
                  ];
                }
              }
            this.observations.delete(opening.voyage);
          }
          if (this.current === opening) this.close();
          return;
        } else {
          this.status =
            result.status === "uncertain"
              ? `Worktree result unconfirmed. Inspect before trying again. ${result.message || ""}`
              : result.message || "The worktree action was refused.";
          if (this.current === opening) opening.message = this.status;
        }
      } catch (error) {
        opening.pending = false;
        this.status = `Worktree result unconfirmed. Inspect before trying again. ${error instanceof Error ? error.message : String(error)}`;
        if (this.current === opening) opening.message = this.status;
      }
      window.refresh();
      task.notify();
    });
  }
  groups(voyages) {
    const roots = voyages.map((voyage) => voyage.id);
    const children = {};
    const grouped = new Set();
    for (const observation of this.observations.values()) {
      if (!observation.checkouts) continue;
      const checkouts = observation.checkouts;
      const main = checkouts.find((checkout) => checkout.main);
      if (!main) continue;
      const lookup = (cwd) => {
        const path = pathKey(cwd);
        return checkouts
          .filter((checkout) => {
            const root = pathKey(checkout.path);
            return (
              path === root || path.startsWith(root === "/" ? root : root + "/")
            );
          })
          .sort((a, b) => b.path.length - a.path.length)[0];
      };
      const parent = voyages.find(
        (voyage) => voyage.cwd && lookup(voyage.cwd)?.path === main.path,
      )?.id;
      if (!parent) continue;
      for (const voyage of voyages) {
        if (!voyage.cwd || voyage.id === parent || grouped.has(voyage.id))
          continue;
        const checkout = lookup(voyage.cwd);
        if (
          !checkout ||
          checkout.path === main.path ||
          checkout.commonDir !== main.commonDir
        )
          continue;
        (children[parent] ||= []).push(voyage.id);
        grouped.add(voyage.id);
      }
    }
    return { roots: roots.filter((id) => !grouped.has(id)), children };
  }
  render() {
    const opening = this.current;
    if (!opening) return null;
    const panel = div()
      .id("worktrees-panel")
      .role("dialog")
      .accessibility_label(
        `${opening.mode === "new" ? "New" : opening.mode === "remove" ? "Remove" : "Open"} worktree`,
      )
      .w(440)
      .max_w("90%")
      .p(16)
      .flex()
      .flex_col()
      .gap(10)
      .rounded(10)
      .border_1()
      .border_color("#c0b1f030")
      .bg("#17191d")
      .text_color("#ded8ef")
      .on_key_down((event, cx) => {
        if (event.key === "escape" && !opening.pending) {
          this.close();
          cx.stop_propagation();
          cx.notify();
          return;
        }
        if (opening.mode === "open" && ["up", "down"].includes(event.key)) {
          const count = this.shown(opening).length;
          opening.selected = count
            ? Math.max(
                0,
                Math.min(
                  count - 1,
                  opening.selected + (event.key === "up" ? -1 : 1),
                ),
              )
            : 0;
          if (count) opening.scroll.scroll_to_item(opening.selected, "center");
          cx.stop_propagation();
          cx.notify();
        }
      });
    const actions = dialogActions().child(
      actionButton("worktree-cancel", "Cancel worktree")
        .disabled(opening.pending)
        .child("Cancel")
        .on_click((_event, cx) => {
          this.close();
          cx.notify();
        }),
    );
    panel.child(
      div()
        .text_size(14)
        .child(
          opening.mode === "new"
            ? "New worktree"
            : opening.mode === "remove"
              ? "Remove worktree"
              : "Open worktree",
        ),
    );
    if (opening.mode !== "remove") {
      panel.child(
        div()
          .text_size(11)
          .child(opening.mode === "new" ? "Branch name" : "Search worktrees"),
      );
      panel.child(Name.new(opening.input).w_full().h(30));
    }
    if (opening.pending) panel.child(div().text_size(11).child("Working…"));
    if (opening.mode === "open") {
      const choices = this.shown(opening);
      const list = v_virtual_list(
        "worktree-results",
        choices.length,
        48,
        (index) => choices[index].path,
        (range) =>
          choices.slice(range.start, range.end).map((checkout, offset) =>
            menuButton(
              `worktree-open-${checkout.path}`,
              `Open ${checkout.branch || checkout.path}`,
            )
              .h(48)
              .w_full()
              .tooltip(checkout.path)
              .bg(
                range.start + offset === opening.selected
                  ? "#c0b1f012"
                  : "#00000000",
              )
              .disabled(opening.pending)
              .child(
                div()
                  .flex()
                  .flex_col()
                  .min_w(0)
                  .flex_1()
                  .child(
                    div()
                      .text_size(12)
                      .truncate()
                      .child(checkout.branch || checkout.path.split("/").pop()),
                  )
                  .child(
                    div()
                      .text_size(10)
                      .text_color("#989ba9")
                      .truncate()
                      .child(checkout.path),
                  ),
              )
              .on_click((_event, cx) =>
                this.apply(
                  opening,
                  { operation: "open", path: checkout.path },
                  cx,
                ),
              ),
          ),
      )
        .h(Math.min(280, choices.length * 48))
        .w_full()
        .track_scroll(opening.scroll);
      if (opening.checkouts && !choices.length)
        panel.child(div().text_size(11).child("No matching worktrees"));
      panel.child(list);
    } else if (opening.mode === "new") {
      panel.child(
        div()
          .text_size(11)
          .text_color("#989ba9")
          .child(
            "Creates a new branch and checkout in the project's .worktrees folder.",
          ),
      );
      actions.child(
        actionButton("worktree-create-submit", "Create worktree")
          .disabled(opening.pending || !opening.checkouts)
          .child("Create")
          .on_click((_event, cx) => this.choose(opening, cx)),
      );
    } else {
      const checkout = opening.checkouts?.find(
        (item) =>
          !item.main &&
          (pathKey(item.path) === pathKey(opening.cwd) ||
            pathKey(opening.cwd).startsWith(item.path + "/")),
      );
      panel.child(
        div()
          .text_size(12)
          .child("Delete this worktree folder? Its branch will be kept."),
      );
      panel.child(div().text_size(11).child(opening.cwd));
      panel.child(
        div()
          .text_size(11)
          .child(
            !checkout
              ? "Checking worktree…"
              : checkout.dirty === true
                ? "Uncommitted changes are present. Commit or move them before removing this worktree."
                : checkout.dirty === false
                  ? "No uncommitted changes."
                  : "Changes could not be checked.",
          ),
      );
      actions.child(
        actionButton("worktree-remove-submit", "Remove worktree")
          .disabled(opening.pending || checkout?.dirty !== false)
          .child("Remove worktree")
          .on_click((_event, cx) => this.choose(opening, cx)),
      );
    }
    if (opening.message)
      panel.child(
        div().text_size(11).text_color("#ffcad3").child(opening.message),
      );
    return panel.child(actions);
  }
}
