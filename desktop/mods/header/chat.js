import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Composer, ComposerState } from "voyager_native";
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
  button(label, callback, colors) {
    return Button.new(`chat-${label.toLowerCase().replaceAll(" ", "-")}`)
      .accessibility_label(label)
      .h(26)
      .px(8)
      .py(0)
      .rounded(5)
      .text_size(11)
      .text_color(colors.muted)
      .on_click((_event, cx) => callback(cx))
      .child(label);
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
      .h(this.open ? (compact ? 380 : this.availableHeight()) : 0)
      .min_h(0)
      .opacity(this.open ? 1 : 0)
      .transition("height", 180)
      .transition("opacity", 180)
      .overflow_hidden()
      .bg(compact ? "#16181c" : "#00000000");
    if (!this.present) return panel;
    const messages = div()
      .id("voyager-chat-messages")
      .flex()
      .flex_col()
      .flex_1()
      .min_h(0)
      .overflow_y_scroll()
      .px(16)
      .gap(16);
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
    const error = this.error || this.state?.error;
    panel.child(messages);
    if (this.state?.limited)
      panel.child(
        div()
          .px(12)
          .py(4)
          .text_size(9)
          .text_color(colors.muted)
          .child("Display limit reached"),
      );
    if (error)
      panel.child(
        div().text_size(11).text_color(colors.foreground).child(error),
      );
    if (this.state && this.state.omitted !== "0")
      panel.child(
        div()
          .text_size(10)
          .text_color(colors.muted)
          .child("Showing recent messages"),
      );
    return panel.child(
      div()
        .mx(12)
        .mb(12)
        .border_1()
        .border_color("#ffffff14")
        .rounded(12)
        .child(Composer.new(this.input))
        .child(
          div()
            .flex()
            .justify_end()
            .child(
              this.button(
                active ? "Interrupt" : "Send",
                (cx) => this.submit(cx, active),
                colors,
              ),
            ),
        ),
    );
  }
}
