use crate::native::Native;
use anyhow::{Context, Result};
use serde_json::{Value, json};
use std::process::Stdio;
use std::time::Instant;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt as _, ImageFormat};
use x11rb::protocol::xtest::ConnectionExt as _;

pub fn drive(native: &mut Native, cases: &mut Vec<Value>) -> Result<()> {
    let evidence = native.system.evidence.clone();
    let pid = native
        .viewer
        .as_ref()
        .context("Missing viewer")?
        .identity
        .pid
        .to_string();
    let started = Instant::now();
    let status = native
        .system
        .command("python3")
        .args([
            "-I",
            evidence.join("obs.py").to_str().context("path")?,
            evidence.to_str().context("path")?,
            &pid,
            &native.window,
        ])
        .stdin(Stdio::null())
        .stdout(std::fs::File::create(evidence.join("obs.out"))?)
        .stderr(std::fs::File::create(evidence.join("obs.err"))?)
        .status()?;
    cases.push(json!({"case":"observation-script","passed":status.success(),"seconds":started.elapsed().as_secs_f64()}));
    let input = round_trips(native)?;
    crate::system::save(evidence.join("input.json"), &input)?;
    cases.push(json!({"case":"input-round-trip","passed":true,"result":input}));
    Ok(())
}

fn millis(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

fn round_trips(native: &Native) -> Result<Value> {
    let window: u32 = native.window.parse()?;
    let (connection, _) = x11rb::connect(Some(crate::sandbox::DISPLAY))?;
    let geometry = connection.get_geometry(window)?.reply()?;
    let origin = connection
        .translate_coordinates(window, geometry.root, 0, 0)?
        .reply()?;
    let (x, y) = (origin.dst_x + 600, origin.dst_y + 20);
    let mut process_click = Vec::new();
    let mut process_capture = Vec::new();
    let mut process_key = Vec::new();
    let mut process_move = Vec::new();
    let mut xtest_click = Vec::new();
    let mut xtest_capture = Vec::new();
    for _ in 0..20 {
        let start = Instant::now();
        native.system.execute(
            "xdotool",
            &["mousemove", &x.to_string(), &y.to_string(), "click", "1"],
            None,
        )?;
        process_click.push(millis(start));
        let start = Instant::now();
        native
            .system
            .execute("xdotool", &["mousemove", &x.to_string(), &y.to_string()], None)?;
        process_move.push(millis(start));
        let start = Instant::now();
        let path = native.system.evidence.join("capture-probe.png");
        native.system.execute(
            "import",
            &["-window", &native.window, path.to_str().context("path")?],
            None,
        )?;
        let image = image::open(&path)?;
        process_capture.push(millis(start));
        let _ = image;
        let start = Instant::now();
        native.key("shift")?;
        process_key.push(millis(start));
        let start = Instant::now();
        connection.xtest_fake_input(6, 0, 0, geometry.root, x, y, 0)?;
        connection.xtest_fake_input(4, 1, 0, geometry.root, 0, 0, 0)?;
        connection.xtest_fake_input(5, 1, 0, geometry.root, 0, 0, 0)?;
        connection.get_input_focus()?.reply()?;
        xtest_click.push(millis(start));
        let start = Instant::now();
        let reply = connection
            .get_image(
                ImageFormat::Z_PIXMAP,
                window,
                0,
                0,
                geometry.width,
                geometry.height,
                !0,
            )?
            .reply()?;
        xtest_capture.push(millis(start));
        let _ = reply.data.len();
    }
    connection.flush()?;
    let summary = |values: &mut Vec<f64>| {
        values.sort_by(f64::total_cmp);
        json!({"median":values[values.len() / 2],"p90":values[values.len() * 9 / 10],"min":values[0],"max":values[values.len() - 1]})
    };
    Ok(json!({
        "samples": 20,
        "geometry": [geometry.width, geometry.height],
        "processClickMs": summary(&mut process_click),
        "processCaptureMs": summary(&mut process_capture),
        "processVerifiedKeyMs": summary(&mut process_key),
        "processMoveMs": summary(&mut process_move),
        "x11rbClickMs": summary(&mut xtest_click),
        "x11rbCaptureMs": summary(&mut xtest_capture),
    }))
}
