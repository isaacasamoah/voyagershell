import { View, div } from "gpui-kit";
import {
  SessionState,
  RetainedTitleState as TitleState,
  RetainedTitle as Title,
  RetainedBodyState as BodyState,
  RetainedBody as Body,
} from "voyager_input";
import { theme } from "voyager_content";
import type { NativeElement } from "gpui-kit";

export default class Notes extends View {
  declare session: ReturnType<typeof SessionState.new>;
  declare title: ReturnType<typeof TitleState.new>;
  declare text: ReturnType<typeof BodyState.new>;

  init(): void {
    this.session = SessionState.new();
    this.title = TitleState.new();
    this.text = BodyState.new();
  }

  render(): NativeElement {
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
      .child(
        div()
          .text_size(11)
          .text_color(colors.muted)
          .child(this.session.status()),
      );
  }
}
