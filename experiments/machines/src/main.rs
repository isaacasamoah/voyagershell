use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use voyager_app::core::{Core, Viewer};
use voyager_app::core_shapes::{RunParams, Terminal};

type Events = Arc<Mutex<Vec<(Instant, String, String, Value)>>>;

fn listen() -> Events {
    let events: Events = Arc::default();
    let sink = events.clone();
    let mut child = Command::new("hc")
        .args(["events", "--json"])
        .stdout(Stdio::piped())
        .spawn()
        .expect("hc events");
    let out = child.stdout.take().unwrap();
    thread::spawn(move || {
        for line in BufReader::new(out).lines() {
            let Ok(line) = line else { break };
            let at = Instant::now();
            let Ok(value) = serde_json::from_str::<Value>(&line) else { continue };
            let params = &value["params"];
            let kind = params["type"].as_str().unwrap_or("").to_string();
            let terminal = params["terminal"].as_str().unwrap_or("").to_string();
            sink.lock().unwrap().push((at, kind, terminal, params["data"].clone()));
        }
        let _ = child.wait();
    });
    thread::sleep(Duration::from_millis(300));
    events
}

fn event_after(events: &Events, since: Instant, kind: &str, terminal: &str, limit: Duration) -> Option<f64> {
    let deadline = Instant::now() + limit;
    while Instant::now() < deadline {
        if let Some((at, ..)) = events
            .lock()
            .unwrap()
            .iter()
            .find(|(at, k, t, _)| *at >= since && k == kind && t == terminal)
        {
            return Some(ms(*at - since));
        }
        thread::sleep(Duration::from_micros(200));
    }
    None
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn run(core: &mut Core, on: Option<&str>, argv: &[&str]) -> (Terminal, f64) {
    let mut params = json!({"argv": argv, "no_parent": true, "labels": {"voyager-operation": "probe"}});
    if let Some(on) = on {
        params["on"] = on.into();
    }
    let params: RunParams = serde_json::from_value(params).unwrap();
    let start = Instant::now();
    let terminal = core.terminal_run_with(params).expect("terminal.run");
    (terminal, ms(start.elapsed()))
}

fn attach(core: &mut Core, terminal: &Terminal) -> (Viewer, f64) {
    let start = Instant::now();
    let attached = core.terminal_attach(terminal).expect("terminal.attach");
    let viewer = core.viewer(&attached).expect("viewer");
    (viewer, ms(start.elapsed()))
}

fn pump(viewer: &Viewer, output: &mut Vec<u8>) -> usize {
    let bytes = viewer.take(65536).unwrap_or_default();
    if !bytes.is_empty() {
        let _ = viewer.credit(bytes.len() as u32);
    }
    let count = bytes.len();
    output.extend(bytes);
    count
}

fn until(viewer: &Viewer, output: &mut Vec<u8>, limit: Duration, done: impl Fn(&[u8]) -> bool) -> bool {
    let deadline = Instant::now() + limit;
    while !done(output) {
        if Instant::now() > deadline {
            return false;
        }
        if pump(viewer, output) == 0 {
            thread::sleep(Duration::from_micros(100));
        }
    }
    true
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

fn percentile(samples: &mut [f64], p: f64) -> f64 {
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    samples[((samples.len() as f64 - 1.0) * p).round() as usize]
}

fn probe(core: &mut Core, events: &Events, on: Option<&str>) -> Value {
    let label = on.unwrap_or("local");
    let mut report = json!({"machine": label});

    let (cat, run_ms) = run(core, on, &["cat"]);
    let (viewer, attach_ms) = attach(core, &cat);
    report["address"] = cat.address.clone().into();
    report["run_ms"] = run_ms.into();
    report["attach_ms"] = attach_ms.into();
    let start = Instant::now();
    let got = core.terminal_get(&cat.address);
    report["get_ms"] = ms(start.elapsed()).into();
    report["get_identity_ok"] = got.is_ok().into();
    report["listed"] = core
        .terminal_list()
        .map(|all| all.iter().any(|t| t.address == cat.address))
        .unwrap_or(false)
        .into();

    let mut output = Vec::new();
    until(&viewer, &mut output, Duration::from_millis(500), |_| false);
    let mut echo = Vec::new();
    for _ in 0..200 {
        output.clear();
        let sent = Instant::now();
        viewer.input(b"a".to_vec()).unwrap();
        if !until(&viewer, &mut output, Duration::from_secs(5), |o| o.contains(&b'a')) {
            report["echo_lost"] = true.into();
            break;
        }
        echo.push(ms(sent.elapsed()));
        thread::sleep(Duration::from_millis(2));
    }
    report["echo_ms"] = json!({
        "n": echo.len(),
        "p50": percentile(&mut echo, 0.5),
        "p95": percentile(&mut echo, 0.95),
        "max": percentile(&mut echo, 1.0),
    });
    let start = Instant::now();
    core.terminal_kill(&cat.address).expect("kill");
    report["kill_ms"] = ms(start.elapsed()).into();
    report["finished_event_after_kill_ms"] =
        event_after(events, start, "finished", &cat.address, Duration::from_secs(5)).into();

    let (flood, _) = run(core, on, &["sh", "-c", "read x; seq 1 300000; echo DONE-MARK; read y"]);
    let (viewer, _) = attach(core, &flood);
    let mut output = Vec::new();
    until(&viewer, &mut output, Duration::from_millis(300), |_| false);
    output.clear();
    let sent = Instant::now();
    viewer.input(b"\n".to_vec()).unwrap();
    let done = until(&viewer, &mut output, Duration::from_secs(60), |o| contains(o, b"DONE-MARK"));
    let elapsed = sent.elapsed();
    report["flood"] = json!({
        "done": done,
        "bytes": output.len(),
        "ms": ms(elapsed),
        "mib_per_s": output.len() as f64 / 1048576.0 / elapsed.as_secs_f64(),
    });
    let _ = core.terminal_kill(&flood.address);

    let (exiting, _) = run(core, on, &["sh", "-c", "read x; exit 3"]);
    let (viewer, _) = attach(core, &exiting);
    let mut output = Vec::new();
    until(&viewer, &mut output, Duration::from_millis(300), |_| false);
    let sent = Instant::now();
    viewer.input(b"\n".to_vec()).unwrap();
    let mut stream_closed = None;
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        pump(&viewer, &mut output);
        if viewer.finished().unwrap_or(false) {
            stream_closed = Some(ms(sent.elapsed()));
            break;
        }
        thread::sleep(Duration::from_micros(200));
    }
    let finished_event = event_after(events, sent, "finished", &exiting.address, Duration::from_secs(5));
    let exit_code = core
        .terminal_get(&exiting.address)
        .ok()
        .and_then(|t| serde_json::to_value(t).ok())
        .map(|t| t["exit_code"].clone());
    report["exit"] = json!({
        "stream_closed_ms": stream_closed,
        "finished_event_ms": finished_event,
        "exit_code": exit_code,
    });

    let (status, _) = run(
        core,
        on,
        &["sh", "-c", "read x; printf '\\033]7501;state=working\\033\\\\'; sleep 30"],
    );
    let (viewer, _) = attach(core, &status);
    let mut output = Vec::new();
    until(&viewer, &mut output, Duration::from_millis(300), |_| false);
    let sent = Instant::now();
    viewer.input(b"\n".to_vec()).unwrap();
    let status_event = event_after(events, sent, "status", &status.address, Duration::from_secs(5));
    let status_get = core
        .terminal_get(&status.address)
        .ok()
        .and_then(|t| serde_json::to_value(t).ok())
        .map(|t| t["status"].clone());
    report["status"] = json!({"event_ms": status_event, "get": status_get});
    let _ = core.terminal_kill(&status.address);
    report
}

fn hold(core: &mut Core, on: &str, seconds: u64) {
    let (cat, _) = run(core, Some(on), &["cat"]);
    let (viewer, _) = attach(core, &cat);
    println!("{}", json!({"hold": cat.address}));
    let begin = Instant::now();
    let mut output = Vec::new();
    let mut last_ok = true;
    let mut samples = 0;
    while begin.elapsed() < Duration::from_secs(seconds) {
        output.clear();
        let sent = Instant::now();
        let input = viewer.input(b"a".to_vec());
        let echoed = input.is_ok()
            && until(&viewer, &mut output, Duration::from_millis(400), |o| o.contains(&b'a'));
        let state = json!({
            "t_ms": ms(begin.elapsed()).round(),
            "input_ok": input.is_ok(),
            "echo_ms": echoed.then(|| ms(sent.elapsed())),
            "finished": viewer.finished().ok(),
            "bytes": String::from_utf8_lossy(&output).into_owned(),
        });
        if echoed != last_ok || !echoed || std::env::var_os("PROBE_ALL").is_some() {
            println!("{state}");
        }
        last_ok = echoed;
        samples += 1;
        thread::sleep(Duration::from_millis(100));
    }
    let get = core.terminal_get(&cat.address);
    println!("{}", json!({"samples": samples, "end_get_ok": get.is_ok(), "end_get": format!("{:?}", get.err())}));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut core = Core::connect("voyager-pm").expect("connect");
    if args.first().map(String::as_str) == Some("hold") {
        hold(&mut core, &args[1], args[2].parse().unwrap());
        return;
    }
    if args.first().map(String::as_str) == Some("get") {
        for address in &args[1..] {
            println!("{}", json!({"address": address, "get": format!("{:?}", core.terminal_get(address).map(|t| t.address))}));
        }
        return;
    }
    let events = listen();
    for target in &args {
        let on = (target != "local").then_some(target.as_str());
        println!("{}", probe(&mut core, &events, on));
    }
}
