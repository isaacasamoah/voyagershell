import { View, div } from "gpui-kit";
import { projection } from "voyager_header";

export default class Header extends View {
  render() {
    const chrome = projection();
    return div()
      .w_full()
      .h_full()
      .p_6()
      .bg(chrome.background)
      .text_color(chrome.foreground)
      .child(div().text_size(24).child("Voyager"))
      .child(div().mt_2().text_color(chrome.muted).child("Let's Go Together"));
  }
}
