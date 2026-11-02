import { div } from "gpui-kit";
import { Input, InputState } from "gpui-base";
import { observe, send } from "./conversation.js";
import type { AsyncContext, Context, NativeElement } from "gpui-kit";
import type { Context as Scope } from "../../../contract/generated/response";
import type { Snapshot } from "../../../contract/generated/conversationSnapshot";
import type { projection } from "voyager_header";

export class Chat {
  open: boolean;
  observing: boolean;
  pending: boolean;
  state: Snapshot | null;
  error: string;
  workspaceChanged: () => void;
  lastEffect: string;
  input: InputState;
  constructor(cx: AsyncContext, workspaceChanged: () => void) {
    this.open = false;
    this.observing = false;
    this.pending = false;
    this.state = null;
    this.error = "";
    this.workspaceChanged = workspaceChanged;
    this.lastEffect = "";
    this.input = InputState.new({ placeholder: "Message Voyager" });
    this.input.on("submit", (_event, cx) => this.submit(cx));
  }

  toggle(cx: Context) {
    this.open = !this.open;
    if (this.open && !this.observing) {
      this.observing = true;
      cx.spawn(async (task) => {
        try {
          while (this.open) {
            const next = await observe(this.state?.version ?? null);
            if (next) {
              this.state = next;
              const effect = next.messages.findLast(
                (message) =>
                  message.tool?.status === "applied" &&
                  message.tool.action.tool === "workspace" &&
                  message.tool.action.action.operation !== "inspect",
              );
              const identity = effect
                ? JSON.stringify([effect.requestId, effect.id])
                : "";
              if (identity && identity !== this.lastEffect) {
                this.lastEffect = identity;
                this.workspaceChanged();
              }
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
    return div()
      .role("button")
      .accessibility_label(label)
      .px(10)
      .py(8)
      .rounded(6)
      .text_size(12)
      .text_color(colors.muted)
      .on_click((_event, cx) => callback(cx))
      .child(label);
  }

  toggleView(colors: ReturnType<typeof projection>): NativeElement {
    return this.button(
      this.open ? "Close chat" : "Chat",
      (cx) => this.toggle(cx),
      colors,
    );
  }

  render(
    colors: ReturnType<typeof projection>,
    context: Scope,
  ): NativeElement | null {
    if (!this.open) return null;
    const messages = div()
      .id("voyager-chat-messages")
      .flex()
      .flex_col()
      .flex_1()
      .min_h(0)
      .overflow_y_scroll()
      .gap(14);
    for (const message of this.state?.messages || []) {
      messages.child(
        div()
          .flex()
          .flex_col()
          .gap(5)
          .child(
            div()
              .text_size(10)
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
              .text_size(13)
              .text_color(colors.foreground)
              .child(message.text),
          ),
      );
    }
    const phase = this.state?.phase || "idle";
    const active = phase === "starting" || phase === "working";
    const error = this.error || this.state?.error;
    const panel = div()
      .absolute()
      .left(14)
      .top(118)
      .w(342)
      .h(600)
      .flex()
      .flex_col()
      .gap(14)
      .p(18)
      .rounded(12)
      .bg(colors.background)
      .border_1()
      .border_color(colors.muted)
      .child(
        div()
          .flex()
          .items_center()
          .child(
            div()
              .flex_1()
              .text_size(13)
              .text_color(colors.foreground)
              .child("Voyager"),
          )
          .child(this.button("Close chat", (cx) => this.toggle(cx), colors)),
      )
      .child(
        div()
          .text_size(10)
          .text_color(colors.muted)
          .child(`Context: ${context?.kind || "workspace"}`),
      )
      .child(messages)
      .child(
        div()
          .text_size(10)
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
    return panel
      .child(Input.new(this.input).accessibility_label("Message Voyager"))
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
      );
  }
}
