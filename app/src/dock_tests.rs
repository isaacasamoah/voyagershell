use crate::workspace::Model;
use voyager_contract::{Action, Context};

#[test]
fn a_dock_home_leaves_the_view_the_voyage_and_the_fleet_where_they_were() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    model
        .apply(Action::Dock {
            context: Context::Fleet { id: fleet },
        })
        .unwrap();
    let before = model.layout.clone();
    assert_eq!(before.view, voyager_contract::WorkspaceView::Fleet);
    model
        .apply(Action::Dock {
            context: Context::Workspace,
        })
        .unwrap();
    assert_eq!(model.layout.context, Context::Workspace);
    assert_eq!(model.layout.view, before.view);
    assert_eq!(model.layout.selected_voyage, before.selected_voyage);
    assert_eq!(model.layout.selected_fleet, before.selected_fleet);
    model.apply(Action::Home).unwrap();
    assert_eq!(model.layout.view, voyager_contract::WorkspaceView::Home);
}
