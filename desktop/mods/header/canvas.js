import { div, Background } from "gpui-kit";
export function composeCanvas(canvas, region) {
  function visit(node, axis, first = true) {
    const block = node.kind === "block";
    const element = block ? region(node.region) : div().relative().flex();
    if (!element) return null;
    element.min_w(0).min_h(0);
    const size = node.size?.kind || "fill";
    if (block && node.region === "sidebar" && canvas.sidebarCollapsed) {
      if (axis === "row") element.w(48);
      else element.h(48);
      element.flex_shrink_0();
    } else if (node.size?.kind === "fixed") {
      if (axis === "row") element.w(node.size.pixels);
      else element.h(node.size.pixels);
      element.flex_shrink_0();
    } else if (size === "fill") element.flex_1();
    else element.flex_shrink_0();
    if (!block) {
      if (node.kind === "column") element.flex_col();
      element.children(
        node.children
          .map((child, index) => visit(child, node.kind, index === 0))
          .filter((child) => child !== null),
      );
    } else if (node.region === "portals" && canvas.portalMode !== "make-room") {
      element.absolute();
      if (axis === "row") {
        element.top(0).bottom(0);
        if (first) element.left(0);
        else element.right(0);
        if (size === "fill") element.w_full();
      } else {
        element.left(0).right(0);
        if (first) element.top(0);
        else element.bottom(0);
        if (size === "fill") element.h_full();
      }
    }
    return element;
  }
  const root = visit(canvas.root, "row");
  if (!root) throw Error("The workspace canvas has no root.");
  return root;
}
export function vesselFrame(surface, selected, arranging) {
  const frame = div()
    .relative()
    .flex()
    .flex_1()
    .min_w(0)
    .min_h(0)
    .p(1)
    .rounded(3)
    .bg(arranging ? "#b3d2e5" : "#00000000");
  if (selected && !arranging)
    frame.children([
      div()
        .absolute()
        .top(0)
        .left(0)
        .right(0)
        .h("50%")
        .rounded_t(3)
        .bg(Background.linear_gradient(135, "#59a5ff65", "#b07af560")),
      div()
        .absolute()
        .bottom(0)
        .left(0)
        .right(0)
        .h("50%")
        .rounded_b(3)
        .bg(Background.linear_gradient(135, "#b07af560", "#f7a34b45")),
    ]);
  return frame.child(surface);
}
