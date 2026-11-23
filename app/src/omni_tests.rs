use super::*;
use std::sync::Mutex;

fn settings(root: &Path) -> Settings {
    Settings {
        cache: root.join("voice"),
        directory: root.join("voice/omni"),
        server: None,
        gpu_layers: 0,
        huggingface: root.join("hf"),
    }
}

fn touch(path: &Path) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"x").unwrap();
}

fn scratch(name: &str) -> PathBuf {
    let root = env::temp_dir().join(format!("voyager-omni-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

fn token(word: &str, others: &[(&str, f64)]) -> Value {
    json!({"token": word, "logprob": 0.0, "top_logprobs": others
        .iter()
        .map(|(other, chance)| json!({"token": other, "logprob": chance.ln()}))
        .collect::<Vec<_>>()})
}

#[test]
fn the_chat_probability_is_read_at_the_kind_token_and_not_at_the_words_after_it() {
    let answer = json!({"choices": [{"logprobs": {"content": [
        token("{\"", &[]),
        token("kind", &[]),
        token("chat", &[("chat", 0.9), ("work", 0.1)]),
        token("work", &[("work", 1.0)]),
    ]}}]});
    let chance = chat_probability(&answer).unwrap();
    assert!((chance - 0.9).abs() < 1e-9, "{chance}");
}

#[test]
fn an_answer_without_logprobs_has_no_probability() {
    assert_eq!(chat_probability(&json!({"choices": [{}]})), None);
}

#[test]
fn a_work_answer_has_no_room_for_words() {
    let body = route_body("Open the roadmap.");
    let shapes = body["response_format"]["json_schema"]["schema"]["anyOf"]
        .as_array()
        .unwrap();
    let work = shapes
        .iter()
        .find(|shape| shape["properties"]["kind"]["enum"][0] == "work")
        .unwrap();
    assert_eq!(work["required"], json!(["kind"]));
    assert_eq!(work["additionalProperties"], json!(false));
    assert_eq!(work["properties"].as_object().unwrap().len(), 1);
}

#[test]
fn the_route_request_is_the_prompt_then_the_examples_then_the_words() {
    let messages = route_messages("Hello.");
    let list = messages.as_array().unwrap();
    assert_eq!(list.len(), 2 + 2 * ROUTE_EXAMPLES.len());
    assert_eq!(list[0]["content"], route_prompt());
    assert_eq!(list[1]["content"], ROUTE_EXAMPLES[0].0);
    assert_eq!(list[4]["content"], r#"{"kind":"work"}"#);
    assert_eq!(list[list.len() - 1]["content"], "Hello.");
}

#[test]
fn nothing_installed_names_every_missing_part() {
    let root = scratch("none");
    let error = locate(&settings(&root)).unwrap_err();
    assert!(error.starts_with("Local voice is not installed."));
    for part in ["llama.cpp server", "Omni model", "audio projector"] {
        assert!(error.contains(part), "{error}");
    }
}

#[test]
fn the_server_comes_from_the_folder_and_the_model_from_the_hugging_face_snapshot() {
    let root = scratch("found");
    let settings = settings(&root);
    touch(&settings.directory.join("llama-server"));
    touch(&settings.huggingface.join(SNAPSHOTS).join("abc").join(MODEL));
    touch(
        &settings
            .huggingface
            .join(SNAPSHOTS)
            .join("abc")
            .join(PROJECTOR),
    );
    let files = locate(&settings).unwrap();
    assert_eq!(files.server, settings.directory.join("llama-server"));
    assert!(files.model.ends_with(format!("abc/{MODEL}")));
}

#[test]
fn a_server_setting_replaces_the_folder_lookup() {
    let root = scratch("server");
    let mut settings = settings(&root);
    let server = root.join("elsewhere/llama-server");
    touch(&server);
    touch(&settings.directory.join(MODEL));
    touch(&settings.directory.join(PROJECTOR));
    settings.server = Some(server.clone());
    assert_eq!(locate(&settings).unwrap().server, server);
}

#[test]
fn the_command_line_binds_loopback_and_takes_the_gpu_layer_count() {
    let files = Files {
        server: "/s/llama-server".into(),
        model: "/m/model.gguf".into(),
        projector: "/m/mmproj.gguf".into(),
    };
    let argv = arguments(&files, 8123, 999);
    let at = |flag: &str| argv.iter().position(|word| word == flag).unwrap();
    assert_eq!(argv[0], "/s/llama-server");
    assert_eq!(argv[at("--host") + 1], "127.0.0.1");
    assert_eq!(argv[at("--port") + 1], "8123");
    assert_eq!(argv[at("-ngl") + 1], "999");
    assert_eq!(argv[at("--reasoning") + 1], "off");
}

#[test]
fn clips_are_kept_once_and_read_back() {
    let root = scratch("clips");
    let settings = settings(&root);
    touch(&settings.directory.join(MODEL));
    let files = Files {
        server: root.join("s"),
        model: settings.directory.join(MODEL),
        projector: root.join("p"),
    };
    let clips = Clips::new(&settings, &files);
    assert!(clips.load(Phrase::Asking).is_none());
    let rendered = Mutex::new(Vec::new());
    struct Counting<'a>(&'a Mutex<Vec<Phrase>>);
    impl Speaking for Counting<'_> {
        fn render(&self, phrase: Phrase) -> Result<Clip, Fault> {
            self.0.lock().unwrap().push(phrase);
            Ok(Clip {
                rate: 24_000,
                pcm: vec![1, 0, 2, 0],
            })
        }
        fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
            Err(Fault::Unavailable("unused".into()))
        }
    }
    prepare_clips(&Counting(&rendered), &clips, &Kept::default()).unwrap();
    prepare_clips(&Counting(&rendered), &clips, &Kept::default()).unwrap();
    assert_eq!(rendered.lock().unwrap().len(), Phrase::ALL.len());
    assert_eq!(clips.load(Phrase::Queued).unwrap().pcm, vec![1, 0, 2, 0]);
}

#[test]
fn changed_words_render_a_new_clip_and_the_old_file_is_not_played() {
    let root = scratch("words");
    let settings = settings(&root);
    touch(&settings.directory.join(MODEL));
    let files = Files {
        server: root.join("s"),
        model: settings.directory.join(MODEL),
        projector: root.join("p"),
    };
    let clips = Clips::new(&settings, &files);
    let old = crate::audio_io::wav(24_000, &[9, 0, 9, 0]);
    fs::create_dir_all(&clips.folder).unwrap();
    fs::write(clips.folder.join("not-running.wav"), &old).unwrap();
    fs::write(
        clips.named(
            "not-running",
            "Voyager isn't running. Resume it in the chat.",
        ),
        &old,
    )
    .unwrap();
    assert!(clips.load(Phrase::NotRunning).is_none());
    struct Fresh;
    impl Speaking for Fresh {
        fn render(&self, _: Phrase) -> Result<Clip, Fault> {
            Ok(Clip {
                rate: 24_000,
                pcm: vec![1, 0, 2, 0],
            })
        }
        fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
            Err(Fault::Unavailable("unused".into()))
        }
    }
    prepare_clips(&Fresh, &clips, &Kept::default()).unwrap();
    assert_eq!(
        clips.load(Phrase::NotRunning).unwrap().pcm,
        vec![1, 0, 2, 0]
    );
}

#[test]
fn a_failed_render_leaves_no_half_kept_clip() {
    let root = scratch("fail");
    let settings = settings(&root);
    touch(&settings.directory.join(MODEL));
    let files = Files {
        server: root.join("s"),
        model: settings.directory.join(MODEL),
        projector: root.join("p"),
    };
    let clips = Clips::new(&settings, &files);
    struct Down;
    impl Speaking for Down {
        fn render(&self, _: Phrase) -> Result<Clip, Fault> {
            Err(Fault::Failed("engine gone".into()))
        }
        fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
            Err(Fault::Failed("engine gone".into()))
        }
    }
    assert!(prepare_clips(&Down, &clips, &Kept::default()).is_err());
    assert!(
        Phrase::ALL
            .iter()
            .all(|phrase| clips.load(*phrase).is_none())
    );
}

fn lasting(millis: u64) -> Clip {
    let bytes = usize::try_from(millis * 48).unwrap();
    Clip {
        rate: 24_000,
        pcm: vec![1; bytes],
    }
}

fn kept_clips(name: &str) -> Clips {
    let root = scratch(name);
    let settings = settings(&root);
    touch(&settings.directory.join(MODEL));
    let files = Files {
        server: root.join("s"),
        model: settings.directory.join(MODEL),
        projector: root.join("p"),
    };
    Clips::new(&settings, &files)
}

struct Renders {
    hum: Mutex<Vec<u64>>,
    rendered: Mutex<Vec<Phrase>>,
}

impl Renders {
    fn hum(lengths: &[u64]) -> Self {
        Self {
            hum: Mutex::new(lengths.iter().rev().copied().collect()),
            rendered: Mutex::default(),
        }
    }

    fn of(&self, phrase: Phrase) -> usize {
        self.rendered
            .lock()
            .unwrap()
            .iter()
            .filter(|each| **each == phrase)
            .count()
    }
}

impl Speaking for Renders {
    fn render(&self, phrase: Phrase) -> Result<Clip, Fault> {
        self.rendered.lock().unwrap().push(phrase);
        let millis = match phrase {
            Phrase::Hum => self.hum.lock().unwrap().pop().unwrap_or(28_880),
            _ => 1_000,
        };
        Ok(lasting(millis))
    }
    fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
        Err(Fault::Unavailable("unused".into()))
    }
}

#[test]
fn the_length_rule_holds_every_measured_good_render_and_no_measured_run_on() {
    let good = [
        ("Mm-hm.", 1_920),
        ("Okay, asking Voyager.", 2_400),
        ("Voyager needs you on Home first.", 2_880),
        (
            "Voyager can't take that right now. Try again in a moment.",
            4_480,
        ),
    ];
    for (words, millis) in good {
        assert!(longest(words) >= Duration::from_millis(millis), "{words}");
    }
    for millis in [2_960, 3_120, 3_680, 7_440, 28_880, 40_960] {
        assert!(
            longest("Mm-hm.") < Duration::from_millis(millis),
            "{millis}"
        );
    }
}

#[test]
fn a_run_on_render_is_rendered_again_and_only_the_one_that_fits_is_kept() {
    let clips = kept_clips("run-on");
    let renders = Renders::hum(&[28_880, 1_120]);
    let kept = Kept::default();
    prepare_clips(&renders, &clips, &kept).unwrap();
    assert_eq!(renders.of(Phrase::Hum), 2);
    assert_eq!(kept.get(Phrase::Hum), Some(lasting(1_120)));
    assert_eq!(clips.load(Phrase::Hum), Some(lasting(1_120)));
}

#[test]
fn a_kept_run_on_clip_is_dropped_on_load_and_rendered_again() {
    let clips = kept_clips("cached-run-on");
    clips.store(Phrase::Hum, &lasting(28_880)).unwrap();
    assert_eq!(clips.load(Phrase::Hum), None);
    let renders = Renders::hum(&[960]);
    let kept = Kept::default();
    prepare_clips(&renders, &clips, &kept).unwrap();
    assert_eq!(renders.of(Phrase::Hum), 1);
    assert_eq!(clips.load(Phrase::Hum), Some(lasting(960)));
}

#[test]
fn a_phrase_that_never_fits_keeps_nothing_and_every_other_clip_is_kept() {
    let clips = kept_clips("never-fits");
    let renders = Renders::hum(&[]);
    let kept = Kept::default();
    prepare_clips(&renders, &clips, &kept).unwrap();
    assert_eq!(renders.of(Phrase::Hum), RENDERS_PER_CLIP);
    assert_eq!(kept.get(Phrase::Hum), None);
    assert_eq!(clips.load(Phrase::Hum), None);
    assert!(
        Phrase::ALL
            .into_iter()
            .filter(|phrase| *phrase != Phrase::Hum)
            .all(|phrase| kept.get(phrase).is_some() && clips.load(phrase).is_some())
    );
}

fn endless_speech() -> (u16, std::thread::JoinHandle<usize>) {
    use std::io::{BufRead, BufReader, Read, Write};
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(socket);
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            if line == "\r\n" {
                break;
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        let mut socket = reader.into_inner();
        let mut header = crate::audio_io::wav(24_000, &[]);
        header[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        header[40..44].copy_from_slice(&u32::MAX.to_le_bytes());
        let head = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n";
        socket.write_all(head.as_bytes()).unwrap();
        let mut sent = 0;
        let mut write = |bytes: &[u8]| {
            write!(socket, "{:x}\r\n", bytes.len())
                .and_then(|()| socket.write_all(bytes))
                .and_then(|()| socket.write_all(b"\r\n"))
        };
        write(&header).unwrap();
        let piece = vec![1; 3_840];
        while sent < 24_000 * 2 * 41 && write(&piece).is_ok() {
            sent += piece.len();
            std::thread::sleep(Duration::from_millis(1));
        }
        sent
    });
    (port, server)
}

#[test]
fn a_clip_render_that_runs_on_is_cut_once_it_passes_the_clip_limit() {
    let (port, server) = endless_speech();
    let clip = Omni::new(port).render(Phrase::Hum).unwrap();
    let limit = bytes_within(longest(Phrase::Hum.words()), 24_000);
    assert!(clip.pcm.len() > limit, "{} <= {limit}", clip.pcm.len());
    assert!(
        clip.pcm.len() <= limit + 3_840,
        "{} past {limit}",
        clip.pcm.len()
    );
    assert!(!fits(Phrase::Hum, &clip));
    assert!(server.join().unwrap() < 24_000 * 2 * 41);
}

fn opening(silent_ms: u64, soft_ms: u64, loud_ms: u64) -> Clip {
    let samples = |millis: u64, level: i16| vec![level; usize::try_from(millis * 24).unwrap()];
    let pcm: Vec<u8> = [
        samples(silent_ms, 0),
        samples(soft_ms, 60),
        samples(loud_ms, 2_000),
    ]
    .concat()
    .into_iter()
    .flat_map(i16::to_le_bytes)
    .collect();
    Clip { rate: 24_000, pcm }
}

#[test]
fn a_clip_keeps_the_pad_before_its_first_sound_and_drops_the_silence_before_that() {
    let clip = trimmed(opening(300, 40, 500));
    assert_eq!(clip.pcm.len(), opening(105, 40, 500).pcm.len());
    assert_eq!(clip, opening(105, 40, 500));
}

#[test]
fn a_clip_whose_sound_starts_within_the_pad_is_kept_whole() {
    assert_eq!(trimmed(opening(100, 40, 500)), opening(100, 40, 500));
    assert_eq!(trimmed(opening(1_000, 0, 0)), opening(1_000, 0, 0));
}

#[test]
fn trimming_twice_is_trimming_once() {
    let once = trimmed(opening(340, 95, 500));
    assert_eq!(trimmed(once.clone()), once);
}

#[test]
fn a_kept_clip_with_a_long_silence_before_its_sound_is_trimmed_on_load_and_when_rendered() {
    let clips = kept_clips("lead");
    clips.store(Phrase::Asking, &opening(340, 20, 900)).unwrap();
    assert_eq!(clips.load(Phrase::Asking), Some(opening(125, 20, 900)));
    struct Late;
    impl Speaking for Late {
        fn render(&self, _: Phrase) -> Result<Clip, Fault> {
            Ok(opening(260, 10, 600))
        }
        fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
            Err(Fault::Unavailable("unused".into()))
        }
    }
    let fresh = kept_clips("lead-render");
    let kept = Kept::default();
    prepare_clips(&Late, &fresh, &kept).unwrap();
    assert_eq!(kept.get(Phrase::Hum), Some(opening(135, 10, 600)));
    assert_eq!(fresh.load(Phrase::Hum), Some(opening(135, 10, 600)));
}
