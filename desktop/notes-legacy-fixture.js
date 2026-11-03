import { View, div } from "gpui-kit";
import { TitleState, Title, BodyState, Body } from "voyager_input";
import { identity, request_id, changed, invoke, theme } from "voyager_content";
import {
  contentRequest as validateRequest,
  contentResponse as validateResponse,
} from "./validate.js";
export default class Notes extends View {
  init(_props, cx) {
    this.id = identity();
    this.sequence = 0;
    this.generation = 0;
    this.dirty = false;
    this.touched = { title: false, text: false };
    this.revision = null;
    this.status = "";
    this.title = TitleState.new("");
    this.text = BodyState.new("");
    this.title.on("change", (_event, cx) => this.changed("title", cx));
    this.text.on("change", (_event, cx) => this.changed("text", cx));
    this.title.on("blur", (_event, cx) => this.save(cx));
    this.text.on("blur", (_event, cx) => this.save(cx));
    cx.spawn(async (task) => {
      try {
        let after = null;
        while (true) {
          after = await changed(after);
          this.read(task);
        }
      } catch (error) {
        this.status = error.message;
        task.notify();
      }
    });
  }
  changed(field, cx) {
    if (this.hydrating) return;
    this.touched[field] = true;
    this.generation += 1;
    this.dirty = true;
    cx.notify();
  }
  call(operation, extra = {}) {
    const request = {
      version: "1",
      operation,
      requestId: request_id(),
      contentId: this.id,
      ...extra,
    };
    if (!validateRequest(request)) throw Error("Invalid content request");
    return invoke(
      JSON.stringify(request),
      request.requestId,
      request.expectedRevision || "",
    ).then((raw) => {
      const result = JSON.parse(raw);
      if (
        !validateResponse(result) ||
        result.requestId !== request.requestId ||
        result.contentId !== this.id
      )
        throw Error("Invalid content response");
      return result;
    });
  }
  read(cx) {
    if (this.reading) {
      this.readAgain = true;
      return;
    }
    this.reading = true;
    cx.spawn(async (task) => {
      do {
        this.readAgain = false;
        await this.load(task);
      } while (this.readAgain);
      this.reading = false;
    });
  }
  async load(task) {
    const generation = this.generation;
    const revision = this.revision;
    try {
      const result = await this.call("content.inspect");
      if (result.status !== "snapshot")
        throw Error(result.message || "Notes unavailable");
      if (
        this.revision &&
        (this.dirty ||
          generation !== this.generation ||
          revision !== this.revision)
      ) {
        this.status = [
          result.snapshot.warning,
          result.snapshot.revision !== this.revision
            ? "Notes changed outside this draft. Its original revision is retained."
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        task.notify();
        return;
      }
      this.revision = result.snapshot.revision;
      this.hydrating = true;
      try {
        if (
          (!this.dirty || !this.touched.title) &&
          this.title.value() !== result.snapshot.data.title
        )
          this.title.set_value(result.snapshot.data.title);
        if (
          (!this.dirty || !this.touched.text) &&
          this.text.value() !== result.snapshot.data.text
        )
          this.text.set_value(result.snapshot.data.text);
      } finally {
        this.hydrating = false;
      }
      this.status = result.snapshot.warning || "";
      if (this.pendingBlur === this.generation) this.save(task);
    } catch (error) {
      this.status = error.message;
    }
    task.notify();
  }
  save(cx) {
    if (!this.dirty || this.unconfirmed === this.generation) return;
    if (!this.revision || this.saving) {
      this.pendingBlur = this.generation;
      return;
    }
    this.pendingBlur = null;
    const generation = this.generation;
    const data = { title: this.title.value(), text: this.text.value() };
    this.saving = true;
    cx.spawn(async (task) => {
      let applied = false;
      try {
        const result = await this.call("content.update", {
          expectedRevision: this.revision,
          data,
        });
        if (result.status === "rejected") {
          this.status = result.message;
        } else if (result.status !== "applied") {
          throw Error(result.message || "Save unconfirmed");
        } else {
          this.revision = result.snapshot.revision;
          applied = true;
          if (this.generation === generation) {
            this.dirty = false;
            this.status = "Saved";
          }
        }
      } catch (error) {
        this.unconfirmed = generation;
        this.status = error.message;
      }
      this.saving = false;
      if (applied && this.pendingBlur === this.generation && this.dirty) {
        this.pendingBlur = null;
        this.save(task);
      }
      task.notify();
    });
  }
  render() {
    const colors = theme();
    return div()
      .w_full()
      .h_full()
      .p(24)
      .bg(colors.background)
      .text_color(colors.foreground)
      .child(div().text_size(9).text_color("#92939e").child("NOTES"))
      .child(Title.new(this.title).w_full().py(8).text_size(20))
      .child(Body.new(this.text).w_full().min_h(180).py(16).text_size(13))
      .child(div().text_size(11).text_color(colors.muted).child(this.status));
  }
}
