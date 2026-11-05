import { div } from "gpui-kit";
import { Button, Popover } from "gpui-base";
import { Name, NameState } from "voyager_native";
import { request_id, worktree } from "voyager_workspace";
import {
  worktreeRequest as validRequest,
  worktreeResponse as validResponse,
} from "./validate.js";
import { menuButton, menuSurface } from "./menu.js";
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
  }
  inspect(voyage, cwd, version, cx) {
    const previous = this.observations.get(voyage);
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
    cx.spawn(async (task) => {
      try {
        const result = await call(voyage, version, { operation: "list" });
        if (this.observations.get(voyage) !== observation) return;
        if (result.status === "applied")
          observation.checkouts = result.checkouts;
      } catch {
        if (this.observations.get(voyage) !== observation) return;
      }
      observation.pending = false;
      task.notify();
    });
  }
  open(voyage, version, cx) {
    this.close();
    const opening = {
      voyage,
      version,
      checkouts: null,
      pending: false,
      message: "",
      form: null,
    };
    this.current = opening;
    this.list(opening, cx);
    cx.notify();
  }
  close() {
    const form = this.current?.form;
    if (form) {
      form.name.release();
      form.branch.release();
      form.base.release();
    }
    this.current = null;
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
          const observation = this.observations.get(opening.voyage);
          if (observation) observation.checkouts = result.checkouts;
        } else opening.message = result.message || "Worktrees are unavailable.";
      } catch (error) {
        if (this.current !== opening) return;
        opening.message =
          error instanceof Error ? error.message : String(error);
      }
      opening.pending = false;
      task.notify();
    });
  }
  apply(opening, action, changed, cx) {
    if (opening.pending || action.operation === "list") return;
    opening.pending = true;
    opening.message = "";
    this.status = "";
    cx.spawn(async (task) => {
      try {
        const result = await call(opening.voyage, opening.version, action);
        opening.pending = false;
        if (result.status === "applied") {
          this.observations.delete(opening.voyage);
          if (this.current === opening) this.close();
          changed(task);
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
  render(changed) {
    const opening = this.current;
    if (!opening) return null;
    const content = menuSurface("worktrees-panel", "Worktrees")
      .w(280)
      .max_h(400)
      .overflow_y_scroll();
    content.child(div().px(10).py(5).text_size(11).child("Worktrees"));
    if (opening.pending)
      content.child(div().px(10).py(5).text_size(11).child("Working…"));
    for (const checkout of opening.checkouts || []) {
      content.child(
        div()
          .px(10)
          .py(4)
          .flex()
          .flex_col()
          .child(div().text_size(11).child(checkout.path))
          .child(
            div()
              .text_size(10)
              .child(
                checkout.branch ||
                  (checkout.main ? "Main checkout" : "Detached"),
              ),
          ),
      );
      content.child(
        menuButton(`worktree-open-${checkout.path}`, `Open ${checkout.path}`)
          .disabled(opening.pending)
          .child("Open")
          .on_click((_event, cx) =>
            this.apply(
              opening,
              { operation: "open", path: checkout.path },
              changed,
              cx,
            ),
          ),
      );
      if (!checkout.main)
        content.child(
          menuButton(
            `worktree-remove-${checkout.path}`,
            `Remove ${checkout.path}`,
          )
            .disabled(opening.pending)
            .child("Remove")
            .on_click((_event, cx) =>
              this.apply(
                opening,
                { operation: "remove", path: checkout.path },
                changed,
                cx,
              ),
            ),
        );
    }
    if (!opening.form) {
      content.child(
        menuButton("worktree-create-form", "Create worktree")
          .disabled(opening.pending)
          .child("Create worktree")
          .on_click((_event, cx) => {
            opening.form = {
              name: NameState.new(""),
              branch: NameState.new(""),
              base: NameState.new("HEAD"),
            };
            opening.form.name.focus();
            cx.notify();
          }),
      );
    } else {
      const form = opening.form;
      for (const [label, state] of [
        ["Name", form.name],
        ["Branch", form.branch],
        ["Base", form.base],
      ])
        content.child(
          div()
            .flex()
            .flex_col()
            .px(10)
            .py(3)
            .child(div().text_size(10).child(label))
            .child(Name.new(state).w_full().h(28)),
        );
      content.child(
        Button.new("worktree-create-submit")
          .accessibility_label("Create worktree")
          .disabled(opening.pending)
          .child("Create")
          .on_click((_event, cx) =>
            this.apply(
              opening,
              {
                operation: "create",
                name: form.name.value().trim(),
                branch: form.branch.value().trim(),
                base: form.base.value().trim(),
              },
              changed,
              cx,
            ),
          ),
      );
    }
    if (opening.message)
      content.child(
        div()
          .px(10)
          .py(5)
          .text_size(10)
          .text_color("#ffcad3")
          .child(opening.message),
      );
    return Popover.new("worktrees-popover")
      .open(true)
      .on_open_change((open, cx) => {
        if (!open) this.close();
        cx.notify();
      })
      .trigger(div().id("worktrees-anchor").size(1))
      .content(content);
  }
}
