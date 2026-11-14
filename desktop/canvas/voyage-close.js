import { div } from "gpui-kit";
import { Marker } from "voyager_native";
import { invoke } from "./workspace.js";
import { actionButton, dialogActions } from "./ui.js";
export class VoyageClose {
  constructor() {
    this.current = null;
    this.pending = false;
    this.message = "";
    this.inspection = false;
  }
  observe(plan) {
    if (!plan || plan.phase === "closed") {
      if (this.current) window.close_dialog();
      this.current = null;
      this.pending = false;
      return;
    }
    this.inspection = false;
    const opening = this.current?.id !== plan.id;
    this.current = plan;
    this.pending = plan.phase === "saving";
    this.message = plan.message || "";
    if (opening)
      window.open_dialog(() => this.render() || div(), {
        escape_dismissable: false,
        backdrop_dismissable: false,
      });
    window.refresh();
  }
  act(confirm, cx) {
    const plan = this.current;
    if (!plan || this.pending) return;
    this.pending = true;
    this.message = confirm ? "Saving Notes and closing programs…" : "";
    cx.spawn(async (task) => {
      try {
        const result = await invoke(
          {
            operation: confirm ? "confirm-voyage-close" : "cancel-voyage-close",
            id: plan.voyage,
            plan: plan.id,
          },
          plan.version,
        );
        if (this.current?.id !== plan.id) return;
        if (result.status === "applied") this.observe(result.closePlan);
        else {
          this.pending = false;
          this.current = result.closePlan || plan;
          this.message =
            result.message ||
            "Shutdown was not confirmed. Inspect the Voyage before trying again.";
        }
      } catch (error) {
        if (this.current?.id !== plan.id) return;
        this.inspection = true;
        this.message = `Shutdown result unconfirmed. Inspect before another request. ${error instanceof Error ? error.message : String(error)}`;
      }
      window.refresh();
      task.notify();
    });
    window.refresh();
    cx.notify();
  }
  inspect(cx) {
    this.inspection = false;
    cx.spawn(async (task) => {
      try {
        const result = await invoke({ operation: "inspect" }, "0");
        if (result.status === "applied" && result.fresh)
          this.observe(result.closePlan);
        else {
          this.inspection = true;
          this.message = result.message || "Shutdown could not be inspected.";
        }
      } catch (error) {
        this.inspection = true;
        this.message = error instanceof Error ? error.message : String(error);
      }
      window.refresh();
      task.notify();
    });
    cx.notify();
  }
  render() {
    const plan = this.current;
    if (!plan) return null;
    const panel = div()
      .id("voyage-close-dialog")
      .role("dialog")
      .accessibility_label(`Close Voyage ${plan.name}`)
      .w(380)
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
        if (event.key === "escape" && !this.pending) {
          this.act(false, cx);
          cx.stop_propagation();
        }
      })
      .child(div().text_size(14).child(`Close ${plan.name}?`))
      .child(
        div()
          .text_size(12)
          .child(
            "Save Notes and stop this Voyage's programs. Other Voyages stay open.",
          ),
      );
    const inventory = div()
      .id("voyage-close-contents")
      .max_h(220)
      .overflow_y_scroll()
      .flex()
      .flex_col()
      .gap(5);
    for (const entry of plan.entries)
      inventory.child(
        div()
          .text_size(12)
          .child(`${entry.typeId} · ${entry.name}`)
          .child(Marker.new("voyage-close-entry", entry.content)),
      );
    panel.child(inventory);
    if (
      plan.uncommittedChanges !== null &&
      plan.uncommittedChanges !== undefined
    )
      panel.child(
        div()
          .text_size(12)
          .child(
            `${plan.uncommittedChanges} uncommitted ${plan.uncommittedChanges === 1 ? "change" : "changes"}. Files and the branch will remain on disk.`,
          ),
      );
    if (this.message) panel.child(div().text_size(11).child(this.message));
    const actions = dialogActions().child(
      actionButton("voyage-close-cancel", "Cancel Voyage close")
        .disabled(this.pending)
        .child(plan.phase === "incomplete" ? "Dismiss" : "Cancel")
        .child(Marker.new("voyage-close-cancel", plan.voyage))
        .on_click((_event, cx) => this.act(false, cx)),
    );
    if (this.inspection)
      actions.child(
        actionButton("voyage-close-inspect", "Inspect Voyage close")
          .child("Inspect")
          .on_click((_event, cx) => this.inspect(cx)),
      );
    if (plan.phase === "ready" && !this.inspection)
      actions.child(
        actionButton("voyage-close-confirm", "Confirm Voyage close")
          .disabled(this.pending)
          .child("Close Voyage")
          .child(Marker.new("voyage-close-confirm", plan.voyage))
          .on_click((_event, cx) => this.act(true, cx)),
      );
    return panel.child(actions);
  }
}
