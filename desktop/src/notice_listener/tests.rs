use super::{Listener, register};
use gpui::{
    AnyWindowHandle, AppContext as _, AsyncApp, Bounds, Entity, WindowBounds, WindowOptions, point,
    px, size,
};
use gpui_shell::{
    ComponentRegistry, HostArguments, HostModule, HostValue, ShellRoot, ShellRuntime, Watcher,
    policy::Policy,
};
use std::{
    cell::RefCell,
    fs,
    path::PathBuf,
    rc::Rc,
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

const SCRIPT: &str = r#"
import { View, div } from 'gpui-kit';
import { NoticeListener } from 'voyager_native';
import { record } from 'notice_probe';
export default class extends View {
  constructor() {
    super();
    record('constructed', 'VERSION');
  }
  render() {
    record('rendered', 'VERSION');
    return div().size_full().child(NoticeListener.new(() => record('handled', 'VERSION')));
  }
}
"#;

#[derive(Default)]
struct Probe {
    seen: RefCell<Vec<(String, String)>>,
    raise_while_handling: RefCell<Option<Listener>>,
}

impl Probe {
    fn count(&self, kind: &str, version: &str) -> usize {
        self.seen
            .borrow()
            .iter()
            .filter(|(seen_kind, seen_version)| seen_kind == kind && seen_version == version)
            .count()
    }
}

struct Scene {
    probe: Rc<Probe>,
    listener: Listener,
    window: AnyWindowHandle,
    root: Entity<ShellRoot>,
    runtime: Rc<ShellRuntime>,
    package: PathBuf,
    _watcher: Watcher,
}

impl Drop for Scene {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.package);
    }
}

impl Scene {
    fn draw(&self, cx: &mut AsyncApp) {
        cx.update_window(self.window, |_, window, cx| window.draw(cx).clear(cx))
            .unwrap();
    }

    fn rerender(&self, cx: &mut AsyncApp) {
        cx.update(|cx| self.runtime.refresh(&self.root, cx))
            .unwrap();
        self.draw(cx);
    }
}

fn source(version: &str) -> String {
    SCRIPT.replace("VERSION", version)
}

fn throwing(version: &str) -> String {
    source(version)
        .replace("() => record('handled', '", "() => { record('handled', '")
        .replace("')));", "'); throw Error('broken handler'); }));")
}

fn scratch() -> PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let directory = std::env::temp_dir().join(format!(
        "voyager-notice-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&directory).unwrap();
    directory
}

async fn pause(milliseconds: u64, cx: &mut AsyncApp) {
    cx.background_executor()
        .timer(Duration::from_millis(milliseconds))
        .await;
}

async fn until(probe: &Probe, kind: &str, version: &str, cx: &mut AsyncApp) {
    for _ in 0..60 {
        if probe.count(kind, version) > 0 {
            return;
        }
        pause(50, cx).await;
    }
    panic!("{kind} {version} never happened");
}

fn run(first: String, steps: impl AsyncFnOnce(Scene, &mut AsyncApp) + 'static) {
    let finished = Rc::new(RefCell::new(false));
    let done = finished.clone();
    gpui_platform::headless()
        .with_quit_mode(gpui::QuitMode::Explicit)
        .run(move |cx| {
            let listener = Listener::default();
            let mut registry = ComponentRegistry::new(
                gpui_shell::COMPONENT_REGISTRY_API_VERSION,
                "voyager_native",
            )
            .unwrap();
            register(&mut registry).unwrap();
            cx.set_global(listener.clone());
            let registry = registry.freeze().unwrap();
            gpui_shell::init_with_components(cx, &registry);
            let runtime = ShellRuntime::new_with_components(cx, registry).unwrap();
            let probe = Rc::new(Probe::default());
            let recorder = probe.clone();
            let module = HostModule::new("notice_probe").function(
                "record",
                move |arguments: &HostArguments| {
                    let kind = arguments.string(0)?.to_owned();
                    let version = arguments.string(1)?.to_owned();
                    let handled = kind == "handled";
                    recorder.seen.borrow_mut().push((kind, version));
                    if handled && let Some(listener) = recorder.raise_while_handling.take() {
                        for _ in 0..3 {
                            listener.raise();
                        }
                    }
                    Ok(HostValue::Null)
                },
            );
            let _guard =
                crate::host::LoadGuard::enter(Policy::new().with_host_module(module).unwrap())
                    .unwrap();
            let package = scratch();
            fs::write(package.join("main.js"), first).unwrap();
            let watching = Rc::new(RefCell::new(None));
            let watched = watching.clone();
            let loaded = package.clone();
            let mounting = runtime.clone();
            let window = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.), px(0.)),
                            size(px(400.), px(300.)),
                        ))),
                        focus: false,
                        show: false,
                        ..Default::default()
                    },
                    move |window, cx| {
                        let root = mounting.try_load(&loaded, window, cx).unwrap();
                        watched.replace(Some(mounting.watch(&root, window, cx).unwrap()));
                        root
                    },
                )
                .unwrap();
            let root = window.entity(cx).unwrap();
            let window: AnyWindowHandle = window.into();
            let delivering = listener.clone();
            cx.spawn(async move |cx| delivering.deliver_to(window, cx).await)
                .detach();
            let scene = Scene {
                probe,
                listener,
                window,
                root,
                runtime,
                package,
                _watcher: watching.take().unwrap(),
            };
            cx.spawn(async move |cx| {
                steps(scene, cx).await;
                *done.borrow_mut() = true;
                cx.update(|cx| cx.quit());
            })
            .detach();
        });
    assert!(*finished.borrow(), "Headless steps did not finish");
}

#[test]
fn a_notice_between_a_reload_and_the_first_render_reaches_the_new_script_once() {
    run(source("first"), async move |scene, cx| {
        scene.draw(cx);
        assert_eq!(scene.probe.count("rendered", "first"), 1);
        fs::write(scene.package.join("main.js"), source("second")).unwrap();
        until(&scene.probe, "constructed", "second", cx).await;
        assert_eq!(
            scene.probe.count("rendered", "second"),
            0,
            "the notice must land before the new script's first render"
        );
        scene.listener.raise();
        pause(100, cx).await;
        assert_eq!(scene.probe.count("handled", "first"), 0);
        assert_eq!(scene.probe.count("handled", "second"), 0);
        scene.draw(cx);
        until(&scene.probe, "handled", "second", cx).await;
        pause(100, cx).await;
        assert_eq!(scene.probe.count("handled", "first"), 0);
        assert_eq!(scene.probe.count("handled", "second"), 1);
        scene.draw(cx);
        pause(100, cx).await;
        assert_eq!(scene.probe.count("handled", "second"), 1);
    });
}

#[test]
fn a_burst_of_notices_while_the_handler_runs_gives_exactly_one_more_call() {
    run(source("first"), async move |scene, cx| {
        scene.draw(cx);
        scene
            .probe
            .raise_while_handling
            .replace(Some(scene.listener.clone()));
        for _ in 0..3 {
            scene.listener.raise();
        }
        until(&scene.probe, "handled", "first", cx).await;
        for _ in 0..60 {
            if scene.probe.count("handled", "first") >= 2 {
                break;
            }
            pause(50, cx).await;
        }
        pause(150, cx).await;
        assert_eq!(scene.probe.count("handled", "first"), 2);
        pause(150, cx).await;
        assert_eq!(scene.probe.count("handled", "first"), 2);
    });
}

#[test]
fn a_handler_that_throws_is_retried_once_and_not_on_every_render() {
    run(throwing("first"), async move |scene, cx| {
        scene.draw(cx);
        scene.listener.raise();
        until(&scene.probe, "handled", "first", cx).await;
        for _ in 0..4 {
            scene.rerender(cx);
            pause(50, cx).await;
        }
        assert_eq!(scene.probe.count("handled", "first"), 2);
        scene.listener.raise();
        pause(100, cx).await;
        for _ in 0..4 {
            scene.rerender(cx);
            pause(50, cx).await;
        }
        assert_eq!(scene.probe.count("handled", "first"), 4);
    });
}
