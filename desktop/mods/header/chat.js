import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Composer, ComposerState } from "voyager_native";
import { observe, send } from "./conversation.js";
export class Chat {
  constructor(cx) {
    this.open = false;
    this.observing = false;
    this.pending = false;
    this.state = null;
    this.error = "";
    this.input = ComposerState.new("Message Voyager");
    this.input.on("submit", (_event, cx) => this.submit(cx));
  }
  toggle(cx) {
    this.open = !this.open;
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
  render(colors, context, compact = false) {
    const panel = div()
      .id("voyager-chat")
      .flex()
      .flex_col()
      .w_full()
      .h(this.open ? 380 : 0)
      .min_h(this.open ? 210 : 0)
      .max_h(this.open ? (compact ? "100%" : "40%") : 0)
      .opacity(this.open ? 1 : 0)
      .transition("height", 220)
      .transition("opacity", 180)
      .overflow_hidden()
      .mt(this.open && !compact ? -8 : 0)
      .mb(this.open && !compact ? 14 : 0)
      .rounded(10)
      .bg(compact ? "#16181c" : "#10121580")
      .border_1()
      .border_color(this.open ? "#ffffff0c" : "#00000000");
    if (!this.open) return panel;
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
    panel
      .child(
        div()
          .flex()
          .items_center()
          .h(44)
          .flex_shrink_0()
          .px(12)
          .border_b_1()
          .border_color("#7a9bac25")
          .child(
            div()
              .flex_1()
              .text_size(11)
              .text_color(colors.foreground)
              .child("Voyager"),
          )
          .child(this.button("Close chat", (cx) => this.toggle(cx), colors)),
      )
      .child(
        div()
          .px(16)
          .py(6)
          .text_size(10)
          .text_color(colors.muted)
          .child(`Context: ${context?.kind || "workspace"}`),
      )
      .child(messages)
      .child(
        div()
          .px(16)
          .py(6)
          .text_size(9)
          .text_color(colors.muted)
          .child(
            this.state?.limited
              ? "Display limit reached"
              : active
                ? "Thinking…"
                : phase,
          ),
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
