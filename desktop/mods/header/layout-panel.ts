import { div } from "gpui-kit";
import { Button, Textarea, TextareaState } from "gpui-base";
import { Occluding } from "voyager_native";
import { canvas as validateCanvas } from "./validate.js";
import type { Context, NativeElement } from "gpui-kit";
import type { Canvas } from "../../../contract/generated/canvas";
import type { Response } from "../../../contract/generated/response";

export class LayoutPanel {
  input: TextareaState;
  version: string;
  error = "";
  pending = false;
  unconfirmed = false;

  constructor(canvas: Canvas, version: string) {
    this.input = TextareaState.new({
      placeholder: "Workspace layout JSON",
      value: JSON.stringify(canvas, null, 2),
      rows: 14,
    });
    this.version = version;
  }

  release() {
    this.input.release();
  }

  render(
    busy: () => boolean,
    inspect: (cx: Context, done: (result: Response | null) => void) => void,
    apply: (
      canvas: Canvas,
      version: string,
      cx: Context,
      done: (result: Response | null) => void,
    ) => void,
    close: (cx: Context) => void,
  ): NativeElement {
    return Occluding.new()
      .absolute()
      .right(12)
      .top(52)
      .bottom(12)
      .w(430)
      .flex()
      .flex_col()
      .gap(12)
      .p(16)
      .rounded(8)
      .bg("#16181c")
      .border_1()
      .border_color("#ffffff1c")
      .child(div().text_size(13).child("Workspace layout"))
      .child(
        div()
          .text_size(11)
          .text_color("#878994")
          .child(
            "Rows and columns arrange the named canvas blocks. Fleet splits stay separate.",
          ),
      )
      .child(Textarea.new(this.input).flex_1().min_h(140).w_full())
      .child(div().text_size(11).text_color("#ffcad3").child(this.error))
      .child(
        div()
          .flex()
          .gap(8)
          .child(
            Button.new("apply-workspace-layout")
              .accessibility_label("Apply workspace layout")
              .child(this.pending ? "Applying" : "Apply")
              .on_click((_event, cx) => {
                if (this.pending || this.unconfirmed) return;
                if (busy()) {
                  this.error = "Wait for the workspace request to finish.";
                  cx.notify();
                  return;
                }
                try {
                  const canvas: unknown = JSON.parse(this.input.value());
                  if (!validateCanvas(canvas))
                    throw Error("The canvas definition is invalid.");
                  this.pending = true;
                  this.error = "";
                  apply(canvas, this.version, cx, (result) => {
                    this.pending = false;
                    if (result?.status === "applied") close(cx);
                    else {
                      this.unconfirmed =
                        !result || result.status === "uncertain";
                      this.error =
                        result?.message ||
                        "The layout was not confirmed. Inspect before trying another change.";
                    }
                  });
                } catch (error) {
                  this.error =
                    error instanceof Error ? error.message : String(error);
                }
                cx.notify();
              }),
          )
          .child(
            Button.new("reload-workspace-layout")
              .accessibility_label("Reload workspace layout")
              .child("Reload")
              .on_click((_event, cx) => {
                if (this.pending || busy()) return;
                this.pending = true;
                inspect(cx, (result) => {
                  this.pending = false;
                  if (
                    result?.status === "applied" &&
                    result.fresh &&
                    result.layout.canvas
                  ) {
                    this.input.set_value(
                      JSON.stringify(result.layout.canvas, null, 2),
                    );
                    this.version = result.version;
                    this.unconfirmed = false;
                    this.error = "";
                  } else
                    this.error =
                      result?.message ||
                      "The current layout could not be read.";
                  cx.notify();
                });
                cx.notify();
              }),
          )
          .child(
            Button.new("close-workspace-layout")
              .accessibility_label("Close workspace layout")
              .child("Close")
              .on_click((_event, cx) => {
                if (!this.pending) close(cx);
              }),
          ),
      );
  }
}
