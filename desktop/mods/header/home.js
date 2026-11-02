import { div } from "gpui-kit";
import { Button } from "gpui-base";

export function homeOverview(layout, navigate) {
  const overview = div().flex().flex_col().flex_1().gap(12).p(18);
  overview.child(div().text_size(22).child("Home"));
  overview.child(div().text_size(12).child("Your Voyages and Fleets"));
  for (const voyage of layout.voyages) {
    const row = div().flex().flex_col().gap(6);
    row.child(
      Button.new(`home-voyage-${voyage.id}`)
        .accessibility_label(`Open Voyage ${voyage.name}`)
        .child(voyage.name)
        .on_click((_event, cx) =>
          navigate({ operation: "select-voyage", id: voyage.id }, cx),
        ),
    );
    const fleets = div().flex().gap(8);
    for (const fleet of voyage.fleets)
      fleets.child(
        Button.new(`home-fleet-${fleet.id}`)
          .accessibility_label(`Open Fleet ${fleet.name}`)
          .child(fleet.name)
          .on_click((_event, cx) =>
            navigate({ operation: "select-fleet", id: fleet.id }, cx),
          ),
      );
    row.child(fleets);
    overview.child(row);
  }
  return overview;
}
