use super::socket_dock::{request_line, send_line, show_fleet, voyager_caller};
use super::{Cases, Verdict, cases};
use crate::inspection::{self, Target};
use crate::native::{Decorations, Native, Terminal, bound_terminal, fleets, now_millis};
use anyhow::{Context as _, Result};
use serde_json::json;
use std::time::{Duration, Instant};
use voyager_contract::{Action, FleetId, RenameTarget};

cases! {
    LostFleetClickSweep => "lost-fleet-click-sweep",
}

pub const CONTROL: Case = Case::LostFleetClickSweep;

const GAPS: [u64; 11] = [0, 50, 100, 150, 200, 250, 300, 400, 500, 700, 1000];
const WATCH: Duration = Duration::from_millis(1500);
const REST: Duration = Duration::from_millis(2500);
const SECOND: &str = "Sweep second";

fn status(native: &Native) -> Result<Option<String>> {
    Ok(inspection::read(&native.inspection())?.and_then(|frame| {
        Target::STATUS
            .find(&frame)
            .and_then(|element| element.label.clone())
    }))
}

type Glance = (bool, Option<String>, String, Option<(u64, String, String)>, usize);

struct Log {
    path: std::path::PathBuf,
    offset: u64,
    requests: usize,
}

impl Log {
    fn new(native: &Native) -> Self {
        Self {
            path: native.system.evidence.join("native.log"),
            offset: 0,
            requests: 0,
        }
    }

    fn count(&mut self) -> usize {
        use std::io::{Read, Seek, SeekFrom};
        let Ok(mut file) = std::fs::File::open(&self.path) else {
            return self.requests;
        };
        if file.seek(SeekFrom::Start(self.offset)).is_err() {
            return self.requests;
        }
        let mut fresh = Vec::new();
        if file.read_to_end(&mut fresh).is_err() {
            return self.requests;
        }
        let whole = fresh
            .iter()
            .rposition(|byte| *byte == b'\n')
            .map_or(0, |at| at + 1);
        self.offset += whole as u64;
        self.requests += String::from_utf8_lossy(&fresh[..whole])
            .lines()
            .filter(|line| line.contains("family=workspace phase=actor-receive"))
            .count();
        self.requests
    }
}

fn sample(
    native: &Native,
    dropped: u64,
    timeline: &mut Vec<serde_json::Value>,
    last: &mut Option<Glance>,
    log: &mut Log,
) -> Result<()> {
    let Some(frame) = inspection::read(&native.inspection())? else {
        return Ok(());
    };
    let status = Target::STATUS
        .find(&frame)
        .and_then(|element| element.label.clone());
    let saved = native.document()?.map(|(version, layout)| {
        (
            version,
            layout
                .selected_fleet
                .map(|fleet| fleet.0)
                .unwrap_or_default(),
            serde_json::to_string(&layout.context).unwrap_or_default(),
        )
    });
    let dock = serde_json::to_string(&frame.dock)?;
    let now = (frame.prepared, status, dock, saved, log.count());
    if last.as_ref() != Some(&now) {
        timeline.push(json!({
            "atMs": now_millis().saturating_sub(dropped),
            "picture": frame.sequence,
            "prepared": now.0,
            "status": now.1,
            "frameDock": now.2,
            "savedVersion": now.3.as_ref().map(|saved| saved.0),
            "savedFleet": now.3.as_ref().map(|saved| saved.1.clone()),
            "savedContext": now.3.as_ref().map(|saved| saved.2.clone()),
            "workspaceRequests": now.4,
        }));
        *last = Some(now);
    }
    Ok(())
}

fn tab(id: &FleetId) -> Target {
    Target::name(&RenameTarget::Fleet { id: id.clone() })
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::LostFleetClickSweep, |native| {
        native.launch_as(Decorations::Client)?;
        native.observe("the avatar drawn", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        })?;
        show_fleet(native)?;
        Terminal::first(native)?;
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let first = layout
            .selected_fleet
            .clone()
            .context("The layout has no selected Fleet")?;
        let voyage = layout
            .selected_voyage
            .clone()
            .context("The layout has no selected Voyage")?;
        let caller = voyager_caller(&voyager);
        let request = request_line(
            native,
            &caller,
            "sweep-second-fleet",
            Action::CreateFleet {
                voyage,
                name: SECOND.into(),
            },
        )?;
        send_line(native, &caller, &request)?;
        let second = native.observe("the second Fleet saved", |seen| {
            fleets(seen.document)
                .find(|item| item.name == SECOND)
                .map(|item| item.id.clone())
        })?;
        native.observe("the second Fleet's tab drawn", |seen| {
            seen.shows(&tab(&second)).then_some(())
        })?;
        std::thread::sleep(REST);
        let order: Vec<u64> = GAPS
            .iter()
            .copied()
            .chain(GAPS.iter().rev().copied())
            .chain(GAPS.iter().copied())
            .chain(GAPS.iter().rev().copied())
            .collect();
        let mut log = Log::new(native);
        let mut trials = Vec::new();
        for (index, gap) in order.into_iter().enumerate() {
            let (onto, other) = if index % 2 == 0 {
                (&first, &second)
            } else {
                (&second, &first)
            };
            let before = status(native)?;
            native.drag(&Target::AVATAR, &tab(onto))?;
            let dropped = now_millis();
            let mut timeline = Vec::new();
            let mut last = None;
            let wait = Instant::now();
            loop {
                sample(native, dropped, &mut timeline, &mut last, &mut log)?;
                let left = Duration::from_millis(gap).saturating_sub(wait.elapsed());
                if left.is_zero() {
                    break;
                }
                std::thread::sleep(left.min(Duration::from_millis(20)));
            }
            let prepared_at_click = last.as_ref().map(|glance| glance.0);
            let requests_before_click = log.count();
            let clicked = now_millis();
            native.click(&tab(other))?;
            let sent = now_millis();
            let watch = Instant::now();
            let mut kept = None;
            let mut early = None;
            while watch.elapsed() < WATCH {
                if kept.is_none()
                    && native
                        .document()?
                        .is_some_and(|(_, layout)| layout.selected_fleet.as_ref() == Some(other))
                {
                    kept = Some(now_millis().saturating_sub(sent));
                }
                sample(native, dropped, &mut timeline, &mut last, &mut log)?;
                if early.is_none() && watch.elapsed() >= Duration::from_millis(300) {
                    early = Some(status(native)?);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let (_, layout) = native.document()?.context("Missing saved layout")?;
            let after = status(native)?;
            trials.push(json!({
                "trial": index,
                "gapAskedMs": gap,
                "gapBeforeClickMs": clicked.saturating_sub(dropped),
                "clickTookMs": sent.saturating_sub(clicked),
                "keptAfterClickMs": kept,
                "finalSelectedIsOther": layout.selected_fleet.as_ref() == Some(other),
                "finalContext": layout.context,
                "statusBefore": before,
                "statusAt300Ms": early,
                "statusAfter": after,
                "preparedAtClick": prepared_at_click,
                "workspaceRequestsBeforeClick": requests_before_click,
                "workspaceRequestsAfterWatch": log.count(),
                "clickedAtMsAfterDrop": clicked.saturating_sub(dropped),
                "timeline": timeline,
            }));
            std::thread::sleep(REST);
        }
        native.keep_window("lost-fleet-click-sweep")?;
        Verdict::new()
            .expect("the sweep ran every trial", trials.len() == GAPS.len() * 4)
            .observed("trials", &trials)
    })
}
