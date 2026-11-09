use voyager_app::workspace::Model;
use voyager_contract::{
    Action, Context, Layout,
    canvas::{Canvas, Node, Region, Size},
};

#[test]
fn outer_canvas_preserves_the_fleet_tree_and_rejects_invalid_replacement() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    assert_eq!(model.layout.voyages[0].fleets[0].name, "Fleet 1");
    let placement = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    model
        .apply(Action::Dock {
            context: Context::Vessel { id: placement },
        })
        .unwrap();
    let original = model.layout.clone();
    let mut canvas = original.canvas.clone();
    canvas.sidebar_collapsed = true;
    model
        .apply(Action::UpdateCanvas {
            canvas: canvas.clone(),
        })
        .unwrap();
    assert_eq!(model.layout.canvas, canvas);
    assert_eq!(model.layout.voyages, original.voyages);
    assert_eq!(model.layout.contents, original.contents);
    assert_eq!(model.layout.context, original.context);
    model
        .apply(Action::SetSidebar { collapsed: false })
        .unwrap();
    assert!(!model.layout.canvas.sidebar_collapsed);
    assert_eq!(model.layout.context, original.context);
    let before = model.layout.clone();
    canvas.root = Node::Row {
        size: Size::Fill,
        children: vec![
            Node::Block {
                region: Region::ActiveFleet,
                size: Size::Fill,
            },
            Node::Block {
                region: Region::ActiveFleet,
                size: Size::Fill,
            },
        ],
    };
    assert!(model.apply(Action::UpdateCanvas { canvas }).is_err());
    assert_eq!(model.layout, before);
    let mut legacy = serde_json::to_value(&original).unwrap();
    legacy.as_object_mut().unwrap().remove("canvas");
    legacy["voyages"][0]["fleets"][0]["name"] = "Personal tab".into();
    let restored: Layout = serde_json::from_value(legacy).unwrap();
    assert_eq!(restored.canvas, Canvas::default());
    assert_eq!(restored.voyages[0].fleets[0].name, "Personal tab");
}
