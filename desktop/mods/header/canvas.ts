import { div, Background } from "gpui-kit";
import type { NativeElement } from "gpui-kit";
import type { Canvas, Node, Region } from "../../../contract/generated/canvas";

export function composeCanvas(
  canvas: Canvas,
  region: (name: Region) => NativeElement | null,
  column: (underlay: NativeElement, portals: NativeElement) => NativeElement,
): NativeElement {
  function visit(node: Node, axis: "row" | "column"): NativeElement | null {
    const block = node.kind === "block";
    const element = block ? region(node.region) : div().relative().flex();
    if (!element) return null;
    element.min_w(0).min_h(0);
    if (block && node.region === "portals") {
      return element.w_full().h_full();
    }
    if (block && node.region === "sidebar" && canvas.sidebarCollapsed) {
      if (axis === "row") element.w(48);
      else element.h(48);
      element.flex_shrink_0();
    } else if (node.size?.kind === "fixed") {
      if (axis === "row") element.w(node.size.pixels);
      else element.h(node.size.pixels);
      element.flex_shrink_0();
    } else if (!node.size || node.size.kind === "fill") element.flex_1();
    else element.flex_shrink_0();
    if (!block) {
      if (node.kind === "column") element.flex_col();
      const children: NativeElement[] = [];
      let portals: NativeElement | null = null;
      for (const child of node.children) {
        const rendered = visit(child, node.kind);
        if (!rendered) continue;
        if (child.kind === "block" && child.region === "portals")
          portals = rendered;
        else children.push(rendered);
      }
      if (portals)
        element.child(
          column(
            div().flex().flex_1().h_full().min_w(0).min_h(0).children(children),
            portals,
          ),
        );
      else element.children(children);
    }
    return element;
  }
  const root = visit(canvas.root, "row");
  if (!root) throw Error("The workspace canvas has no root.");
  return root;
}

export function vesselFrame(
  surface: NativeElement,
  selected: boolean,
  arranging: boolean,
): NativeElement {
  const frame = div()
    .relative()
    .flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .p(1)
    .rounded(10)
    .bg(arranging ? "#b3d2e5" : "#ffffff18");
  if (selected && !arranging)
    frame.children([
      div()
        .absolute()
        .top(0)
        .left(0)
        .right(0)
        .h("50%")
        .rounded_t(10)
        .bg(Background.linear_gradient(135, "#59a5ff65", "#b07af560")),
      div()
        .absolute()
        .bottom(0)
        .left(0)
        .right(0)
        .h("50%")
        .rounded_b(10)
        .bg(Background.linear_gradient(135, "#b07af560", "#f7a34b45")),
    ]);
  return frame.child(surface.rounded(9).overflow_hidden());
}
