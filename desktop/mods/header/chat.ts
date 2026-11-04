import { div, svg } from "gpui-kit";
import { Button } from "gpui-base";
import { Composer, ComposerState } from "voyager_native";
import { observe, send } from "./conversation.js";
import type { AsyncContext, Context, NativeElement } from "gpui-kit";
import type { Context as Scope } from "../../../contract/generated/response";
import type { Snapshot } from "../../../contract/generated/conversationSnapshot";
import type { projection } from "voyager_header";

export class Chat {
  open: boolean;
  present: boolean;
  transition: number;
  heights: Record<string, number>;
  observing: boolean;
  pending: boolean;
  state: Snapshot | null;
  error: string;
  input: ComposerState;
  constructor(cx: AsyncContext) {
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

  toggle(cx: Context) {
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

  submit(cx: Context, interrupt = false) {
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

  button(
    label: string,
    callback: (cx: Context) => void,
    colors: ReturnType<typeof projection>,
  ): NativeElement {
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

  toggleView(colors: ReturnType<typeof projection>): NativeElement {
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

  measure(
    region: "sidebar" | "heading" | "navigation",
    height: number,
    cx: Context,
  ) {
    if (
      !Number.isFinite(height) ||
      height <= 0 ||
      Math.abs((this.heights[region] || 0) - height) < 0.5
    )
      return;
    this.heights[region] = height;
    cx.notify();
  }

  availableHeight(): number {
    return Math.max(
      0,
      (this.heights.sidebar || 0) -
        (this.heights.heading || 0) -
        (this.heights.navigation || 0),
    );
  }

  render(
    colors: ReturnType<typeof projection>,
    _context: Scope,
    compact = false,
  ): NativeElement | null {
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
