use crate::split::register;
use gpui::{
    Bounds, Entity, InteractiveElement as _, IntoElement as _, ParentElement as _, Pixels,
    Styled as _, canvas, div, px,
};
use gpui_shell::ComponentRegistry;
use std::rc::Rc;

#[test]
fn shared_canvas_keeps_single_and_split_frames_inside_their_region() {
    use gpui::{
        AppContext as _, Context, Render, Window, WindowBounds, WindowOptions, point, size,
    };
    use gpui_shell::{HostModule, ScriptView, ShellRuntime, policy::Policy};
    use std::{
        cell::{Cell, RefCell},
        collections::BTreeMap,
        time::Duration,
    };

    struct LayoutView(Entity<ScriptView>);
    impl Render for LayoutView {
        fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl gpui::IntoElement {
            div().size_full().child(
                self.0
                    .clone()
                    .cached(gpui::StyleRefinement::default().size_full()),
            )
        }
    }

    let records = Rc::new(RefCell::new(Vec::new()));
    let results = records.clone();
    let completed = Rc::new(Cell::new(false));
    let finished = completed.clone();
    gpui_platform::headless().with_quit_mode(gpui::QuitMode::Explicit).run(move |cx| {
        let mut registry = ComponentRegistry::new(
            gpui_shell::COMPONENT_REGISTRY_API_VERSION,
            "voyager_native",
        ).unwrap();
        register(&mut registry).unwrap();
        let registry = registry.freeze().unwrap();
        gpui_shell::init_with_components(cx, &registry);
        let runtime = ShellRuntime::new_with_components(cx, registry).unwrap();
        let mut windows = Vec::new();
        for (axis, portals, intrinsic) in [
        ("single", false, 100),
        ("vertical", false, 900),
        ("horizontal", true, 900),
    ] {
        let observed = Rc::new(RefCell::new(BTreeMap::new()));
        results.borrow_mut().push((axis, observed.clone()));
        let measured = observed.clone();
        let probes = HostModule::new("layout_probe")
            .component("Target", |mut args, _, _| {
                crate::avatar::target_frame()
                    .id(args.id().to_owned())
                    .children(args.take_children())
                    .into_any_element()
            })
            .component("Bounds", move |args, _, _| {
                let id = args.id().to_owned();
                let measured = measured.clone();
                canvas(
                    move |bounds, _, _| {
                        measured.borrow_mut().insert(id, bounds);
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .into_any_element()
            });
        let _guard =
            crate::host::LoadGuard::enter(Policy::new().with_host_module(probes).unwrap())
                .unwrap();
        let package = std::env::temp_dir().join(format!(
            "voyager-frame-layout-{}-{axis}",
            std::process::id()
        ));
        std::fs::create_dir(&package).unwrap();
        std::fs::write(
            package.join("canvas.js"),
            include_str!("../mods/header/canvas.js"),
        )
        .unwrap();
        let source = format!(
            r#"
import {{ View, div }} from 'gpui-kit';
import {{ Split, Column }} from 'voyager_native';
import {{ Target, Bounds }} from 'layout_probe';
import {{ composeCanvas, vesselFrame }} from './canvas.js';
function leaf(id) {{
  return Target.new(id, {{}}).child(vesselFrame(div().flex().flex_col().flex_1().min_w(0).min_h(0)
.child(div().h(30).flex_shrink_0())
.child(div().flex_1().min_h(0).child(div().h({intrinsic})))
.child(Bounds.new(id, {{}})), false, false));
}}
export default class extends View {{
  render() {{
const panel = '{axis}' === 'single' ? leaf('first') : Split.new('panels', '{axis}', 5000, '1', 0, () => {{}}).flex_1().min_w(0).min_h(0).child(leaf('first')).child(leaf('second'));
const region = name => name === 'portals' ? ({portals} ? div().flex().flex_col().size_full().child(leaf('portal')) : null)
  : name === 'active-fleet' ? div().flex().flex_col().flex_1().min_w(0).min_h(0).p(8).child(panel)
  : name === 'context-bar' ? div().h(30) : div();
return div().flex().size_full().child(composeCanvas({canvas}, region,
  (underlay, panels) => Column.new('column', 340, '1', 0, () => {{}}).flex_1().min_w(0).min_h(0).child(underlay).child(panels)));
  }}
}}
"#,
            canvas =
                serde_json::to_string(&voyager_contract::canvas::Canvas::default()).unwrap()
        );
        std::fs::write(package.join("main.js"), source).unwrap();
        let application = runtime.load_application(&package, "main.js").unwrap();
        let runtime = runtime.clone();
        let window = cx.open_window(WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(point(px(0.), px(0.)), size(px(1200.), px(800.))))),
            focus: false,
            show: false,
            ..Default::default()
        }, move |window, cx| {
            cx.new(|cx| LayoutView(runtime.mount_application(&application, window, cx).unwrap()))
        }).unwrap();
        windows.push(window);
        std::fs::remove_dir_all(package).unwrap();
        }
        cx.spawn(async move |cx| {
            for _ in 0..4 {
                for window in &windows {
                    cx.update_window((*window).into(), |_, window, cx| window.draw(cx).clear(cx)).unwrap();
                }
                cx.background_executor().timer(Duration::from_millis(10)).await;
            }
            finished.set(true);
            cx.update(|cx| cx.quit());
        }).detach();
    });
    assert!(completed.get(), "Headless layout did not complete");
    for (axis, observed) in records.borrow().iter() {
        eprintln!("Shared canvas {axis}: {:?}", observed.borrow());
    }
    for (axis, observed) in records.borrow().iter() {
        let observed = observed.borrow();
        let first: &Bounds<Pixels> = observed.get("first").unwrap();
        let expected_height = if *axis == "vertical" { 351. } else { 712. };
        assert!(
            (first.size.height - px(expected_height)).abs() <= px(2.),
            "{axis}: {observed:?}"
        );
        assert!(
            first.origin.y >= px(48.) && first.bottom() <= px(762.),
            "{axis}: {observed:?}"
        );
        if *axis == "horizontal" {
            let second = observed.get("second").unwrap();
            assert!(
                (first.size.width - second.size.width).abs() <= px(1.),
                "{observed:?}"
            );
            assert!(second.right() <= px(852.), "{observed:?}");
        }
    }
}
