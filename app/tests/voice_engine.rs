use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use voyager_app::{
    client::Client,
    core::Core,
    omni::Settings,
    speech::Standing,
    voice_layer::{self, Phase, System, Trace, Voyager},
};

const SERVER: &str = r#"#!/usr/bin/env python3
import http.server, sys
port = int(sys.argv[sys.argv.index("--port") + 1])
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")
    def do_POST(self):
        self.send_response(500)
        self.send_header("Content-Length", "0")
        self.end_headers()
    def log_message(self, *arguments):
        pass
http.server.HTTPServer(("127.0.0.1", port), Handler).serve_forever()
"#;

struct Absent;

impl Voyager for Absent {
    fn standing(&self) -> Standing {
        Standing::NotRunning
    }

    fn say(&self, _: &str) -> Result<(), String> {
        Err("Not sent. Voyager is absent.".into())
    }
}

fn folder(name: &str) -> PathBuf {
    let folder = std::env::temp_dir().join(format!("voyager-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
}

fn engine_folder(root: &Path) -> Settings {
    let engine = root.join("engine");
    fs::create_dir_all(&engine).unwrap();
    let server = engine.join("llama-server");
    fs::write(&server, SERVER).unwrap();
    fs::set_permissions(&server, fs::Permissions::from_mode(0o755)).unwrap();
    for name in [
        "LFM3-Omni-2B-Q4_K_M.gguf",
        "mmproj-LFM3-Omni-2B-Q4_K_M.gguf",
    ] {
        fs::write(engine.join(name), b"stand-in model").unwrap();
    }
    Settings {
        cache: root.join("cache"),
        directory: engine,
        server: None,
        gpu_layers: 0,
        huggingface: root.join("hub"),
    }
}

fn live_engines(core: &mut Core) -> Vec<String> {
    core.terminal_list()
        .unwrap()
        .into_iter()
        .filter(|terminal| {
            terminal.is_live()
                && terminal.labels.get("voyager.service").map(String::as_str)
                    == Some("voice-engine")
        })
        .map(|terminal| terminal.address)
        .collect()
}

#[test]
fn an_engine_that_cannot_warm_up_is_stopped_and_the_reason_is_shown() {
    let session = format!("voyager-voice-engine-{}", std::process::id());
    let root = folder("voice-engine");
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let client = Client::open(session.clone(), root.to_string_lossy().into_owned());
        let layer = voice_layer::start(
            client,
            engine_folder(&root),
            Arc::new(Absent),
            Arc::new(Vec::<String>::new),
            Arc::new(System),
            Trace::off(),
        );
        let until = Instant::now() + Duration::from_secs(60);
        let mut state = layer.snapshot();
        while !matches!(state.phase, Phase::Unavailable(_)) {
            assert!(Instant::now() < until, "Voice never reported a failure");
            state = layer.wait_changed(state.version, Duration::from_millis(250));
        }
        let Phase::Unavailable(reason) = &state.phase else {
            unreachable!()
        };
        assert!(reason.contains("refused speech"), "{reason}");
        let mut core = Core::connect(&session).unwrap();
        assert_eq!(live_engines(&mut core), Vec::<String>::new());
    }));
    let mut cleanup = Core::connect(&session).unwrap();
    let _ = cleanup.server_stop();
    let _ = fs::remove_dir_all(&root);
    if let Err(failure) = checked {
        std::panic::resume_unwind(failure);
    }
}
