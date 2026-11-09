import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import {
  Composer,
  ComposerState,
  MeasureHeight,
  FollowScroll,
} from "voyager_native";
import { observe, send } from "./conversation.js";
export class Chat {
  constructor(cx) {
    this.open = false;
    this.present = false;
    this.transition = 0;
    this.heights = {};
    this.observing = false;
    this.pending = false;
    this.state = null;
    this.error = "";
    this.input = ComposerState.new("Message Voyager");
    this.input.on("submit", (_event, cx) => this.submit(cx));
  }
  toggle(cx) {
    this.open = !this.open;
    const transition = ++this.transition;
    if (this.open) {
      this.present = true;
      this.input.focus();
    } else
      cx.spawn(async (task) => {
        await task.sleep(180);
        if (!this.open && this.transition === transition) {
          this.present = false;
          task.notify();
        }
      });
    if (this.open && !this.observing) {
      this.observing = true;
      cx.spawn(async (task) => {
        try {
          while (this.open) {
            const next = await observe(this.state?.version ?? null);
            if (next) {
              this.state = next;
              task.notify();
            }
            await task.sleep(50);
          }
        } catch (error) {
          this.error = error instanceof Error ? error.message : String(error);
          task.notify();
        }
        this.observing = false;
      });
    }
    cx.notify();
  }
  submit(cx, interrupt = false) {
    if (this.pending) return;
    const text = this.input.value();
    if (!interrupt && !text.trim()) return;
    this.pending = true;
    this.error = "";
    cx.spawn(async (task) => {
      try {
        const result = await send(
          interrupt ? { operation: "interrupt" } : { operation: "send", text },
        );
        if (result.delivery !== "accepted")
          this.error = result.error || "Request refused";
        else if (!interrupt && this.input.value() === text)
          this.input.set_value("");
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
      this.pending = false;
      task.notify();
    });
    cx.notify();
  }
  toggleView(colors) {
    return Button.new("chat-toggle")
      .accessibility_label(this.open ? "Close chat" : "Chat")
      .w(24)
      .h(24)
      .p(3)
      .rounded(5)
      .text_color(this.open ? colors.accent : colors.muted)
      .on_click((_event, cx) => this.toggle(cx))
      .child(svg("chat.svg").w(18).h(16));
  }
  measure(region, height, cx) {
    if (
      !Number.isFinite(height) ||
      height <= 0 ||
      Math.abs((this.heights[region] || 0) - height) < 0.5
    )
      return;
    this.heights[region] = height;
    cx.notify();
  }
  availableHeight() {
    return Math.max(
      0,
      (this.heights.sidebar || 0) -
        (this.heights.heading || 0) -
        (this.heights.navigation || 0),
    );
  }
  render(colors, _context, compact = false) {
    const panel = div()
      .id("voyager-chat")
      .flex()
      .flex_col()
      .w_full()
      .flex_shrink_0()
      .h(
        this.open
          ? Math.min(
              Math.max(48, Math.min(320, this.availableHeight())),
              48 + (this.heights.messages || 0),
            )
          : 0,
      )
      .min_h(0)
      .opacity(this.open ? 1 : 0)
      .transition("height", 180)
      .transition("opacity", 180)
      .overflow_hidden()
      .bg(compact ? "#16181c" : "#00000000");
    if (!this.present) return panel;
    const messages = div()
      .flex()
      .flex_col()
      .w_full()
      .min_h(1)
      .px(12)
      .py(4)
      .gap(10);
    for (const message of this.state?.messages || []) {
      messages.child(
        div()
          .flex()
          .flex_col()
          .gap(5)
          .child(
            div()
              .text_size(8)
              .text_color(colors.muted)
              .child(
                message.role === "user"
                  ? "You"
                  : message.role === "tool"
                    ? "Workspace"
                    : "Voyager",
              ),
          )
          .child(
            div()
              .text_size(11)
              .line_height(1.8)
              .text_color(colors.foreground)
              .child(message.text),
          ),
      );
    }
    const phase = this.state?.phase || "idle";
    const active = phase === "starting" || phase === "working";
    if (active)
      messages.child(
        div().text_size(10).text_color(colors.muted).child("Thinking…"),
      );
    const error = this.error || this.state?.error;
    if (this.state?.limited)
      messages.child(
        div()
          .px(12)
          .py(4)
          .text_size(9)
          .text_color(colors.muted)
          .child("Display limit reached"),
      );
    if (error)
      messages.child(
        div().text_size(11).text_color(colors.foreground).child(error),
      );
    if (this.state && this.state.omitted !== "0")
      messages.child(
        div()
          .text_size(10)
          .text_color(colors.muted)
          .child("Showing recent messages"),
      );
    panel.child(
      FollowScroll.new(
        "voyager-chat-messages",
        `${this.state?.version || "0"}:${this.heights.messages || 0}:${this.heights.sidebar || 0}`,
      )
        .flex_1()
        .min_h(0)
        .child(
          MeasureHeight.new("chat-message-content", (height, cx) =>
            this.measure("messages", height, cx),
          )
            .flex_shrink_0()
            .child(messages),
        ),
    );
    return panel.child(
      div()
        .flex()
        .items_center()
        .h(32)
        .flex_shrink_0()
        .mx(12)
        .mt(4)
        .mb(8)
        .px(5)
        .border_1()
        .border_color("#ffffff14")
        .rounded(8)
        .child(Composer.new(this.input).flex_1().min_w(0))
        .child(
          Button.new("chat-send")
            .accessibility_label(active ? "Interrupt" : "Send")
            .tooltip(active ? "Interrupt" : "Send")
            .w(24)
            .h(24)
            .p(0)
            .justify_center()
            .text_size(15)
            .text_color(colors.muted)
            .on_click((_event, cx) => this.submit(cx, active))
            .child(active ? "■" : "↑"),
        ),
    );
  }
}
