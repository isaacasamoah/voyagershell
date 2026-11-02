import { View, div } from "gpui-kit";
import { projection } from "voyager_header";
import { invoke } from "./workspace.js";
import { Chat } from "./chat.js";

export default class Workspace extends View {
  init(_props, cx) {
    this.chat = new Chat(cx, () => {
      this.refreshRequested = true;
      if (!this.busy) this.run({ operation: "inspect" }, cx);
    });
    this.version = "0";
    this.layout = null;
    this.busy = false;
    this.refreshRequested = false;
    this.status = "Opening workspace";
    this.run({ operation: "inspect" }, cx);
  }

  run(action, cx) {
    if (this.busy) return;
    if (action.operation === "inspect") this.refreshRequested = false;
    this.busy = true;
    cx.spawn(async (task) => {
      try {
        const result = await invoke(action, this.version);
        this.version = result.version;
        this.layout = result.layout;
        this.status = result.message || "";
      } catch (error) {
        this.status = error.message;
      }
      this.busy = false;
      task.notify();
      if (this.refreshRequested) this.run({ operation: "inspect" }, task);
    });
    cx.notify();
  }

  action(label, action, selected = false) {
    const colors = projection();
    return div()
      .role("button")
      .accessibility_label(label === "+" ? `Create ${action.operation}` : label)
      .px(12)
      .py(9)
      .rounded(6)
      .text_size(12)
      .text_color(selected ? colors.foreground : colors.muted)
      .bg(selected ? "#23232d" : "#00000000")
      .on_click((_event, cx) => this.run(action, cx))
      .child(label);
  }

  dock(context) {
    const colors = projection();
    const selected =
      JSON.stringify(context) === JSON.stringify(this.layout.context);
    return div()
      .role("button")
      .accessibility_label(`Dock to ${context.kind}`)
      .w(24)
      .h(24)
      .rounded(12)
      .text_size(13)
      .text_color(selected ? colors.accent : colors.muted)
      .on_click((_event, cx) => this.run({ operation: "dock", context }, cx))
      .child(selected ? "●" : "○");
  }

  pane(tree, fleet) {
    const colors = projection();
    if (tree.kind === "branch") {
      const row = div().flex().flex_1().min_w(0).min_h(0).gap(6);
      if (tree.axis === "vertical") row.flex_col();
      else row.flex_row();
      return row
        .child(this.pane(tree.first, fleet))
        .child(this.pane(tree.second, fleet));
    }
    const placement = fleet.vessels.find((item) => item.id === tree.placement);
    const content = this.layout.contents.find(
      (item) => item.id === placement.content,
    );
    return div()
      .flex()
      .flex_col()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .rounded(8)
      .bg("#14161a")
      .child(
        div()
          .flex()
          .items_center()
          .px(16)
          .py(10)
          .child(
            div()
              .flex_1()
              .text_size(11)
              .text_color(colors.muted)
              .child("Terminal"),
          )
          .child(this.dock({ kind: "vessel", id: placement.id })),
      )
      .child(
        div()
          .flex_1()
          .p(20)
          .text_size(12)
          .text_color(colors.muted)
          .child(content.cwd)
          .child(
            div().mt(12).child("Terminal connection is the next integration."),
          ),
      )
      .child(
        div()
          .flex()
          .items_center()
          .px(12)
          .py(8)
          .child(div().flex_1())
          .child(
            this.action("+", {
              operation: "split",
              fleet: fleet.id,
              after: placement.id,
              axis: "horizontal",
            }),
          ),
      );
  }

  render() {
    const colors = projection();
    const shell = div()
      .relative()
      .flex()
      .w_full()
      .h_full()
      .bg(colors.background)
      .text_color(colors.foreground);
    if (!this.layout?.voyages.length)
      return shell
        .flex_col()
        .p(24)
        .child(this.status || "Workspace unavailable")
        .child(this.action("Refresh", { operation: "inspect" }));
    const voyage = this.layout.voyages.find(
      (item) => item.id === this.layout.selectedVoyage,
    );
    const fleet = voyage?.fleets.find(
      (item) => item.id === this.layout.selectedFleet,
    );
    const sidebar = div()
      .flex()
      .flex_col()
      .w(220)
      .p(18)
      .gap(8)
      .bg("#16181c")
      .child(div().text_size(23).child("Voyager"))
      .child(
        div().text_size(11).text_color(colors.muted).child("Let's Go Together"),
      )
      .child(this.chat.toggleView(colors))
      .child(div().h(26))
      .child(
        this.action("Workspace", {
          operation: "dock",
          context: { kind: "workspace" },
        }),
      );
    for (const item of this.layout.voyages) {
      sidebar.child(
        div()
          .flex()
          .items_center()
          .child(
            div()
              .flex_1()
              .child(
                this.action(
                  item.name,
                  { operation: "select-voyage", id: item.id },
                  item.id === voyage?.id,
                ),
              ),
          )
          .child(this.dock({ kind: "voyage", id: item.id })),
      );
    }
    sidebar.child(
      this.action("+ Voyage", {
        operation: "create-voyage",
        name: `Voyage ${this.layout.voyages.length + 1}`,
        cwd: this.layout.contents[0].cwd,
      }),
    );
    sidebar.child(div().flex_1());
    sidebar.child(
      div()
        .text_size(10)
        .text_color(colors.muted)
        .child(`Context: ${this.layout.context.kind}`),
    );
    const body = div().flex().flex_col().flex_1().min_w(0).p(12).gap(10);
    const tabs = div().flex().items_center().gap(6);
    for (const item of voyage?.fleets || []) {
      tabs.child(
        div()
          .flex()
          .items_center()
          .child(
            this.action(
              item.name,
              { operation: "select-fleet", id: item.id },
              item.id === fleet?.id,
            ),
          )
          .child(this.dock({ kind: "fleet", id: item.id })),
      );
    }
    if (voyage)
      tabs.child(
        this.action("+", {
          operation: "create-fleet",
          voyage: voyage.id,
          name: `Fleet ${voyage.fleets.length + 1}`,
        }),
      );
    body.child(tabs);
    if (fleet) body.child(this.pane(fleet.root, fleet));
    if (this.status) {
      body.child(div().text_size(11).text_color("#ffcad3").child(this.status));
      body.child(this.action("Refresh", { operation: "inspect" }));
    }
    shell.child(sidebar).child(body);
    if (this.chat.open)
      shell.child(this.chat.render(colors, this.layout.context));
    return shell;
  }
}
