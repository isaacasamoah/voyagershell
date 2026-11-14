import { div } from "gpui-kit";
import { Marker } from "voyager_native";
import { stop_session } from "voyager_workspace";
import { actionButton, dialogActions } from "./ui.js";
class StopSession {
  constructor() {
    this.open = false;
  }
  show() {
    if (this.open) return;
    this.open = true;
    window.open_dialog(() => this.render() || div(), {
      escape_dismissable: false,
      backdrop_dismissable: false,
    });
    window.refresh();
  }
  close() {
    this.open = false;
    window.close_dialog();
    window.refresh();
  }
  confirm() {
    this.close();
    stop_session();
  }
  render() {
    if (!this.open) return null;
    return div()
      .id("stop-session-dialog")
      .role("dialog")
      .accessibility_label("Stop session")
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
        if (event.key === "escape") {
          this.close();
          cx.stop_propagation();
        }
      })
      .child(div().text_size(14).child("Stop the session?"))
      .child(
        div()
          .text_size(12)
          .child(
            "Voyager closes and Core stops every program it started in this session. A program that detached from its terminal may keep running. Ctrl+Q closes Voyager and keeps programs running.",
          ),
      )
      .child(
        dialogActions()
          .child(
            actionButton("stop-session-cancel", "Cancel stop session")
              .child("Cancel")
              .on_click(() => this.close()),
          )
          .child(
            actionButton("stop-session-confirm", "Confirm stop session")
              .child("Stop session")
              .child(Marker.new("stop-session-confirm"))
              .on_click(() => this.confirm()),
          ),
      );
  }
}
export const stopSession = new StopSession();
