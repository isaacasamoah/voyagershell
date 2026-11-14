use super::{Inspection, Mark, Marker, Shown, avatar, install, register, stage, write};
use gpui::{
    AnyWindowHandle, AppContext as _, AsyncApp, Bounds, Context as ViewContext, Entity,
    IntoElement, ParentElement as _, Pixels, Render, Styled as _, Window, WindowBounds,
    WindowOptions, canvas, div, point, px, size,
};
use gpui_base::input::InputState;
use gpui_shell::{ComponentRegistry, HostModule, ScriptView, ShellRuntime, policy::Policy};
use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU32, Ordering},
    },
    time::{Duration, Instant},
};
use voyager_contract::{
    Context, PlacementId,
    inspection::{Element, Frame, Rect, Role, Window as Viewport},
};

const SCRIPT: &str = r#"
import { View, div } from 'gpui-kit';
import { Popover } from 'gpui-base';
import { Marker, Prepared } from 'voyager_native';
import { Measure, collapsed, menu, marked, duplicate, prepared, title } from 'layout_probe';
function control(element, role, key, label) {
  element.child(Measure.new(`${role}:${key}`, {}));
  if (marked())
    element.child(label ? Marker.new(role, key, label) : key ? Marker.new(role, key) : Marker.new(role));
  return element;
}
export default class extends View {
  render() {
    const main = div().flex().flex_col().flex_1().min_w(0)
      .child(div().flex().h(45)
        .child(control(div().w(120).h_full(), 'fleet-name', 'fleet-1', title())))
      .child(div().flex()
        .child(control(div().flex_1().min_w(0).h(35), 'vessel-name', 'placement-2'))
        .child(control(div().w(22).h(22), 'split-right', 'placement-1')))
      .child(Popover.new('chooser').open(menu()).on_open_change(() => {})
        .trigger(div().w(40).h(10))
        .content(div().w(170).child(control(div().h(27), 'create-notes', ''))))
      .child(div().w(100).h(20).overflow_hidden()
        .child(control(div().w(300).h(20).flex_shrink_0(), 'create-worker', 'clipped')))
      .child(div().w(0).h(20).overflow_hidden()
        .child(control(div().w(300).h(20).flex_shrink_0(), 'create-worker', 'hidden')))
      .child(div().flex()
        .child(control(div().flex().gap(8).h(20).child(div().w(50).h(20)), 'portal-name', 'placement-9'))
        .child(control(div().w(30).h(20), 'split-bottom', 'placement-9')));
    if (duplicate()) main.child(control(div().w(10).h(10), 'fleet-name', 'fleet-1'));
    const row = div().flex().size_full();
    if (marked()) row.child(Prepared.new(prepared()));
    if (!collapsed())
      row.child(div().w(260).h_full().flex_shrink_0()
        .child(control(div().h(38), 'voyage-name', 'voyage-1')));
    return row.child(main);
  }
}
"#;

#[derive(Default)]
struct Probe {
    collapsed: Cell<bool>,
    menu: Cell<bool>,
    marked: Cell<bool>,
    duplicate: Cell<bool>,
    prepared: Cell<bool>,
    title: RefCell<String>,
    editor_renders: Cell<u32>,
    prepaints: Cell<u32>,
    avatar: Cell<f32>,
    measured: RefCell<BTreeMap<String, Bounds<Pixels>>>,
}

struct Root {
    script: Entity<ScriptView>,
    editor: Option<Entity<Editor>>,
    probe: Rc<Probe>,
}

struct Editor {
    draft: Entity<InputState>,
    probe: Rc<Probe>,
}

impl Render for Editor {
    fn render(&mut self, _: &mut Window, _: &mut ViewContext<Self>) -> impl IntoElement {
        self.probe
            .editor_renders
            .set(self.probe.editor_renders.get() + 1);
        div().size_full().child(Marker {
            id: "draft".into(),
            mark: Mark::Control {
                role: Role::NameEditor,
                key: "fleet-1".into(),
                shown: Shown::Draft(self.draft.downgrade()),
            },
        })
    }
}

impl Render for Root {
    fn render(&mut self, window: &mut Window, cx: &mut ViewContext<Self>) -> impl IntoElement {
        stage(&dock(), window, cx);
        div()
            .size_full()
            .child(
                self.script
                    .clone()
                    .cached(gpui::StyleRefinement::default().size_full()),
            )
            .children(self.editor.clone().map(|editor| {
                div()
                    .absolute()
                    .left(px(600.))
                    .top(px(400.))
                    .w(px(60.))
                    .h(px(32.))
                    .child(editor.cached(gpui::StyleRefinement::default().size_full()))
            }))
            .child(
                div()
                    .absolute()
                    .left(px(self.probe.avatar.get()))
                    .top(px(20.))
                    .size(px(94.))
                    .child(avatar()),
            )
    }
}

struct Scene {
    probe: Rc<Probe>,
    window: AnyWindowHandle,
    script: Entity<ScriptView>,
    root: Entity<Root>,
}

impl Scene {
    fn draw(&self, cx: &mut AsyncApp) {
        cx.update_window(self.window, |_, window, cx| window.draw(cx).clear(cx))
            .unwrap();
    }

    fn redraw_script(&self, cx: &mut AsyncApp) {
        self.script.update(cx, |script, cx| script.refresh(cx));
        self.draw(cx);
    }

    fn move_avatar(&self, left: f32, cx: &mut AsyncApp) {
        self.probe.avatar.set(left);
        self.root.update(cx, |_, cx| cx.notify());
        self.draw(cx);
    }

    fn edit(&self, text: &str, cx: &mut AsyncApp) -> Entity<InputState> {
        let probe = self.probe.clone();
        let root = self.root.clone();
        cx.update_window(self.window, |_, window, cx| {
            let draft = cx.new(|cx| InputState::new(window, cx).default_value(text.to_owned()));
            let editor = cx.new(|_| Editor {
                draft: draft.clone(),
                probe,
            });
            root.update(cx, |root, cx| {
                root.editor = Some(editor);
                cx.notify();
            });
            draft
        })
        .unwrap()
    }

    fn retype(&self, draft: &Entity<InputState>, text: &str, cx: &mut AsyncApp) {
        cx.update_window(self.window, |_, window, cx| {
            draft.update(cx, |draft, cx| draft.set_value(text.to_owned(), window, cx));
        })
        .unwrap();
    }

    fn resize(&self, width: f32, height: f32, cx: &mut AsyncApp) {
        cx.update_window(self.window, |_, window, cx| {
            window.resize(size(px(width), px(height)));
            window.bounds_changed(cx);
        })
        .unwrap();
    }

    async fn frame(
        &self,
        path: &Path,
        cx: &mut AsyncApp,
        reached: impl Fn(&Frame) -> bool,
    ) -> Frame {
        let mut last = None;
        for _ in 0..400 {
            self.draw(cx);
            pause(5, cx).await;
            last = fs::read(path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Frame>(&bytes).ok());
            if let Some(frame) = last.clone().filter(&reached) {
                return frame;
            }
        }
        panic!("The awaited frame never arrived; the last one was {last:?}");
    }

    fn measured(&self, role: &str, key: &str) -> Rect {
        rect(self.probe.measured.borrow()[&format!("{role}:{key}")])
    }
}

async fn pause(milliseconds: u64, cx: &mut AsyncApp) {
    cx.background_executor()
        .timer(Duration::from_millis(milliseconds))
        .await;
}

fn dock() -> Context {
    Context::Vessel {
        id: PlacementId("placement-2".into()),
    }
}

fn rect(bounds: Bounds<Pixels>) -> Rect {
    Rect {
        x: bounds.origin.x.into(),
        y: bounds.origin.y.into(),
        width: bounds.size.width.into(),
        height: bounds.size.height.into(),
    }
}

fn scratch(name: &str) -> PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let directory = std::env::temp_dir().join(format!(
        "voyager-inspect-{name}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&directory).unwrap();
    directory
}

fn bounds(frame: &Frame, role: Role, key: &str) -> Option<Rect> {
    let mut found = frame
        .elements
        .iter()
        .filter(|element| element.role == role && element.key == key);
    let element = found.next()?;
    assert!(found.next().is_none(), "{role:?} {key:?} is listed twice");
    Some(element.bounds)
}

fn run<T: 'static>(
    path: Option<PathBuf>,
    marked: bool,
    steps: impl AsyncFnOnce(Scene, &mut AsyncApp) -> T + 'static,
) -> T {
    let outcome = Rc::new(RefCell::new(None));
    let finished = outcome.clone();
    gpui_platform::headless()
        .with_quit_mode(gpui::QuitMode::Explicit)
        .run(move |cx| {
            let mut registry = ComponentRegistry::new(
                gpui_shell::COMPONENT_REGISTRY_API_VERSION,
                "voyager_native",
            )
            .unwrap();
            register(&mut registry).unwrap();
            let registry = registry.freeze().unwrap();
            gpui_shell::init_with_components(cx, &registry);
            let runtime = ShellRuntime::new_with_components(cx, registry).unwrap();
            let probe = Rc::new(Probe::default());
            probe.marked.set(marked);
            probe.menu.set(true);
            probe.title.replace("Fleet 1".into());
            probe.avatar.set(300.);
            let flag = |read: fn(&Probe) -> bool| {
                let probe = probe.clone();
                move |_: &gpui_shell::HostArguments| Ok(read(&probe).into())
            };
            let measured = probe.clone();
            let module = HostModule::new("layout_probe")
                .function("collapsed", flag(|probe| probe.collapsed.get()))
                .function("menu", flag(|probe| probe.menu.get()))
                .function("marked", flag(|probe| probe.marked.get()))
                .function("duplicate", flag(|probe| probe.duplicate.get()))
                .function("prepared", flag(|probe| probe.prepared.get()))
                .function("title", {
                    let probe = probe.clone();
                    move |_: &gpui_shell::HostArguments| Ok(probe.title.borrow().clone().into())
                })
                .component("Measure", move |args, _, _| {
                    let id = args.id().to_owned();
                    let measured = measured.clone();
                    canvas(
                        move |bounds, _, _| {
                            measured.prepaints.set(measured.prepaints.get() + 1);
                            measured.measured.borrow_mut().insert(id, bounds);
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
                crate::host::LoadGuard::enter(Policy::new().with_host_module(module).unwrap())
                    .unwrap();
            let package = scratch("package");
            fs::write(package.join("main.js"), SCRIPT).unwrap();
            let application = runtime.load_application(&package, "main.js").unwrap();
            let view_probe = probe.clone();
            let window = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.), px(0.)),
                            size(px(1450.), px(940.)),
                        ))),
                        focus: false,
                        show: false,
                        ..Default::default()
                    },
                    move |window, cx| {
                        install(path, window, cx);
                        let script = runtime.mount_application(&application, window, cx).unwrap();
                        cx.new(|_| Root {
                            script,
                            editor: None,
                            probe: view_probe,
                        })
                    },
                )
                .unwrap();
            fs::remove_dir_all(package).unwrap();
            let root = window.entity(cx).unwrap();
            let scene = Scene {
                probe,
                window: window.into(),
                script: root.read(cx).script.clone(),
                root,
            };
            cx.spawn(async move |cx| {
                *finished.borrow_mut() = Some(steps(scene, cx).await);
                cx.update(|cx| cx.quit());
            })
            .detach();
        });
    outcome
        .borrow_mut()
        .take()
        .expect("Headless steps did not finish")
}

#[test]
fn layout_change_moves_bounds_and_closed_entries_leave() {
    let directory = scratch("layout");
    let path = directory.join("frame.json");
    let report = path.clone();
    run(Some(path), true, async move |scene, cx| {
        let open = scene
            .frame(&report, cx, |frame| {
                bounds(frame, Role::CreateNotes, "").is_some()
            })
            .await;
        assert_eq!(
            open.window,
            Viewport {
                width: 1450.,
                height: 940.,
                scale: 1.
            }
        );
        assert_eq!(open.dock, dock());
        assert_eq!(open.ambiguous, Vec::new());
        let at = |x, y, width, height| {
            Some(Rect {
                x,
                y,
                width,
                height,
            })
        };
        assert_eq!(
            bounds(&open, Role::VoyageName, "voyage-1"),
            at(0., 0., 260., 38.)
        );
        assert_eq!(
            bounds(&open, Role::FleetName, "fleet-1"),
            at(260., 0., 120., 45.)
        );
        assert_eq!(
            bounds(&open, Role::VesselName, "placement-2"),
            at(260., 45., 1168., 35.)
        );
        assert_eq!(
            bounds(&open, Role::SplitRight, "placement-1"),
            at(1428., 45., 22., 22.)
        );
        assert_eq!(bounds(&open, Role::Avatar, ""), at(300., 20., 94., 94.));
        assert_eq!(
            bounds(&open, Role::CreateWorker, "clipped"),
            at(260., 90., 100., 20.)
        );
        assert_eq!(bounds(&open, Role::CreateWorker, "hidden"), None);
        for (role, name, key) in [
            (Role::VoyageName, "voyage-name", "voyage-1"),
            (Role::FleetName, "fleet-name", "fleet-1"),
            (Role::VesselName, "vessel-name", "placement-2"),
            (Role::SplitRight, "split-right", "placement-1"),
            (Role::CreateNotes, "create-notes", ""),
        ] {
            assert_eq!(
                bounds(&open, role, key),
                Some(scene.measured(name, key)),
                "{name}"
            );
        }

        let prepaints = scene.probe.prepaints.get();
        for left in [340., 380., 420., 460.] {
            scene.move_avatar(left, cx);
        }
        let reused = scene
            .frame(&report, cx, |frame| frame.sequence > open.sequence)
            .await;
        assert_eq!(
            scene.probe.prepaints.get(),
            prepaints,
            "the cached script view was prepainted again"
        );
        assert_eq!(bounds(&reused, Role::Avatar, ""), at(460., 20., 94., 94.));
        let header = |frame: &Frame| {
            frame
                .elements
                .iter()
                .filter(|element| element.role != Role::Avatar)
                .cloned()
                .collect::<Vec<Element>>()
        };
        assert_eq!(header(&reused), header(&open));

        scene.probe.collapsed.set(true);
        scene.probe.menu.set(false);
        scene.resize(1180., 820., cx);
        scene.redraw_script(cx);
        let changed = scene
            .frame(&report, cx, |frame| frame.window.width == 1180.)
            .await;
        assert_eq!(
            changed.window,
            Viewport {
                width: 1180.,
                height: 820.,
                scale: 1.
            }
        );
        assert_eq!(bounds(&changed, Role::VoyageName, "voyage-1"), None);
        assert_eq!(bounds(&changed, Role::CreateNotes, ""), None);
        assert_eq!(
            bounds(&changed, Role::FleetName, "fleet-1"),
            at(0., 0., 120., 45.)
        );
        assert_eq!(
            bounds(&changed, Role::VesselName, "placement-2"),
            at(0., 45., 1158., 35.)
        );
        assert_eq!(
            bounds(&changed, Role::SplitRight, "placement-1"),
            at(1158., 45., 22., 22.)
        );
        assert_eq!(bounds(&changed, Role::Avatar, ""), at(460., 20., 94., 94.));
    });
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn a_frame_reports_preparation_and_the_text_a_control_shows() {
    let directory = scratch("shown");
    let path = directory.join("frame.json");
    let report = path.clone();
    run(Some(path), true, async move |scene, cx| {
        let label = |frame: &Frame, role: Role| {
            let mut found = frame.elements.iter().filter(|element| element.role == role);
            let label = found.next()?.label.clone();
            assert!(found.next().is_none(), "{role:?} is listed twice");
            label
        };
        let pending = scene
            .frame(&report, cx, |frame| {
                bounds(frame, Role::FleetName, "fleet-1").is_some()
            })
            .await;
        assert!(!pending.prepared);
        assert_eq!(label(&pending, Role::FleetName).as_deref(), Some("Fleet 1"));
        assert!(
            pending
                .elements
                .iter()
                .all(|element| element.role == Role::FleetName || element.label.is_none()),
            "a control without a label reported one"
        );

        scene.probe.prepared.set(true);
        scene.probe.title.replace("Native Fleet".into());
        scene.redraw_script(cx);
        let ready = scene.frame(&report, cx, |frame| frame.prepared).await;
        assert_eq!(
            label(&ready, Role::FleetName).as_deref(),
            Some("Native Fleet")
        );
        scene.probe.prepared.set(false);
        scene.redraw_script(cx);
        scene.frame(&report, cx, |frame| !frame.prepared).await;

        let draft = scene.edit("Native Fleet", cx);
        let opened = scene
            .frame(&report, cx, |frame| {
                bounds(frame, Role::NameEditor, "fleet-1").is_some()
            })
            .await;
        assert_eq!(
            label(&opened, Role::NameEditor).as_deref(),
            Some("Native Fleet")
        );
        let renders = scene.probe.editor_renders.get();
        scene.retype(&draft, "Discarded", cx);
        scene
            .frame(&report, cx, |frame| {
                label(frame, Role::NameEditor).as_deref() == Some("Discarded")
            })
            .await;
        scene.retype(&draft, "", cx);
        scene
            .frame(&report, cx, |frame| {
                label(frame, Role::NameEditor).as_deref() == Some("")
            })
            .await;
        assert_eq!(
            scene.probe.editor_renders.get(),
            renders,
            "the cached editor view was rendered again"
        );
    });
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn rapid_changes_write_at_most_once_per_period() {
    let directory = scratch("rate");
    let path = directory.join("frame.json");
    let report = path.clone();
    run(Some(path), true, async move |scene, cx| {
        let first = scene.frame(&report, cx, |_| true).await;
        let started = Instant::now();
        for step in 0..80 {
            scene.move_avatar(300. + step as f32, cx);
            pause(2, cx).await;
        }
        let moved = |frame: &Frame| bounds(frame, Role::Avatar, "").map(|bounds| bounds.x);
        let last = scene
            .frame(&report, cx, |frame| moved(frame) == Some(379.))
            .await;
        let allowed = started.elapsed().as_millis() / super::PERIOD.as_millis() + 2;
        let written = u128::from(last.sequence - first.sequence);
        assert!(written <= allowed, "{written} writes, {allowed} allowed");
    });
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn without_a_path_nothing_is_recorded_and_layout_is_unchanged() {
    let directory = scratch("off");
    let path = directory.join("frame.json");
    let measure = |path: Option<PathBuf>, marked: bool| {
        run(path, marked, async move |scene, cx| {
            for collapsed in [false, true, false] {
                scene.probe.collapsed.set(collapsed);
                scene.redraw_script(cx);
                pause(40, cx).await;
            }
            let installed = cx.update(|cx| cx.has_global::<Inspection>());
            (scene.probe.measured.borrow().clone(), installed)
        })
    };
    let (unmarked, _) = measure(None, false);
    let (off, installed) = measure(None, true);
    assert!(!installed);
    let (on, installed) = measure(Some(path.clone()), true);
    assert!(installed);
    assert!(path.exists());
    assert_eq!(unmarked.len(), 9);
    assert_eq!(off, unmarked);
    assert_eq!(on, unmarked);
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn two_controls_with_one_identity_are_listed_as_ambiguous() {
    let directory = scratch("ambiguous");
    let path = directory.join("frame.json");
    let report = path.clone();
    let frame = run(Some(path), true, async move |scene, cx| {
        scene.probe.duplicate.set(true);
        scene.redraw_script(cx);
        scene
            .frame(&report, cx, |frame| !frame.ambiguous.is_empty())
            .await
    });
    assert_eq!(bounds(&frame, Role::FleetName, "fleet-1"), None);
    assert!(bounds(&frame, Role::VesselName, "placement-2").is_some());
    let shared: Vec<_> = frame
        .ambiguous
        .iter()
        .map(|element| (element.role, element.key.as_str(), element.bounds.width))
        .collect();
    assert_eq!(
        shared,
        [
            (Role::FleetName, "fleet-1", 120.),
            (Role::FleetName, "fleet-1", 10.)
        ]
    );
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn a_polling_reader_only_parses_whole_frames() {
    let directory = scratch("torn");
    let path = directory.join("frame.json");
    let frame = |sequence: u64| Frame {
        sequence,
        window: Viewport {
            width: 1450.,
            height: 940.,
            scale: 1.,
        },
        dock: dock(),
        prepared: true,
        elements: (0..1500)
            .map(|index| Element {
                role: Role::VesselName,
                key: format!("placement-{index}"),
                label: None,
                bounds: Rect {
                    x: index as f32,
                    y: 45.,
                    width: 520.,
                    height: 35.,
                },
            })
            .collect(),
        ambiguous: Vec::new(),
    };
    let done = Arc::new(AtomicBool::new(false));
    let reads = Arc::new(AtomicU32::new(0));
    let reader = {
        let (path, done, reads) = (path.clone(), done.clone(), reads.clone());
        std::thread::spawn(move || {
            let mut last = 0;
            while !done.load(Ordering::Relaxed) {
                let Ok(bytes) = fs::read(&path) else {
                    assert_eq!(last, 0, "the frame disappeared after it was written");
                    continue;
                };
                let frame: Frame = serde_json::from_slice(&bytes).unwrap_or_else(|error| {
                    panic!("partial frame, {} bytes: {error}", bytes.len())
                });
                assert!(frame.sequence >= last, "the sequence went backwards");
                assert_eq!(frame.elements.len(), 1500);
                last = frame.sequence;
                reads.fetch_add(1, Ordering::Relaxed);
            }
        })
    };
    let started = Instant::now();
    let mut sequence = 0;
    while (sequence < 400 || reads.load(Ordering::Relaxed) < 200)
        && !reader.is_finished()
        && started.elapsed() < Duration::from_secs(30)
    {
        sequence += 1;
        write(&path, &frame(sequence)).unwrap();
    }
    done.store(true, Ordering::Relaxed);
    reader.join().expect("the reader parsed a partial frame");
    assert!(
        reads.load(Ordering::Relaxed) >= 200,
        "the reader did not overlap the writer"
    );
    fs::remove_dir_all(directory).unwrap();
}
