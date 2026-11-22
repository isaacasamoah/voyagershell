use super::adopt_by_label::{address, bound_to, typed};
use super::socket_dock::{from_another_vessel, members};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, bound_terminal, fleets, voyages};
use crate::sandbox::SECOND_PROJECT;
use crate::system::until;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::path::Path;
use voyager_contract::inspection::{Rect, Role};
use voyager_contract::launch::{Launch, LaunchSpec, Permissions};
use voyager_contract::{
    Action, Axis, ContentDestination, FleetId, Layout, PlacementId, PlacementInsertion,
    PlacementOwner, RenameTarget, Side, Split, SplitShare, Vessel, VesselId,
};

cases! {
    LabelSplitsEachSide => "label-splits-each-side",
    CreateVesselSplitsBeside => "create-vessel-splits-beside",
    BadSplitPlacesNothing => "bad-split-places-nothing",
    AgentStartsPlain => "agent-starts-plain",
    PersonKeepsTableDefault => "person-keeps-table-default",
    VoyagerResizesASplit => "voyager-resizes-a-split",
    AgentResizeRefused => "agent-resize-refused",
}

pub const CONTROL: Case = Case::CreateVesselSplitsBeside;

const SIDES: [(Side, &str); 4] = [
    (Side::Left, "left"),
    (Side::Right, "right"),
    (Side::Top, "top"),
    (Side::Bottom, "bottom"),
];
const LOGICAL_TOLERANCE: f32 = 1.0;
const NOWHERE: &str = "placement-nowhere";
const SECOND_FLEET: &str = "Split elsewhere";
const VESSEL_NOT_OFFERED: &str = "create-vessel from a Vessel other than Voyager must place beside a placement of a Fleet; nothing was queued";
const RESIZE_REFUSED: &str = "is offered only to Voyager; nothing was queued";
const RESIZED: u16 = 7000;
const REFUSED_SHARE: u16 = 3000;
const SHARE_TOLERANCE: f32 = 0.03;
const BYPASS: &str = "--dangerously-bypass-approvals-and-sandbox";
const CODEX: &str = "codex";
const UNNAMED_CODEX: &[u8] = br#"{"default":"terminal","entries":[{"id":"terminal","name":"Terminal","launch":{"kind":"terminal"}},{"id":"codex","name":"Codex","launch":{"kind":"codex"}}]}"#;
const TABLE_DEFAULT: [&str; 7] = [
    "codex",
    "--no-daemon",
    "--model",
    "gpt-6.1-sol",
    "-c",
    "model_reasoning_effort=\"high\"",
    "--dangerously-bypass-approvals-and-sandbox",
];
const READ_ONLY: [&str; 10] = [
    "codex",
    "--no-daemon",
    "--model",
    "gpt-6.1-sol",
    "-c",
    "model_reasoning_effort=\"high\"",
    "--sandbox",
    "read-only",
    "--ask-for-approval",
    "on-request",
];

#[derive(Clone, PartialEq, Serialize)]
struct Landed {
    side: Side,
    placement: PlacementId,
    held: Option<Split>,
    drawn: Rect,
    beside: Rect,
}

#[derive(Clone, PartialEq, Serialize)]
struct Created {
    placement: PlacementId,
    held: Option<Split>,
    cwd: String,
    terminal: String,
    launch: Option<Launch>,
}

#[derive(Clone, PartialEq, Serialize)]
struct Divided {
    share: Option<SplitShare>,
    fraction: f32,
}

#[derive(Serialize)]
struct Started {
    created: Option<Created>,
    code: String,
    foreground: Value,
    printed: bool,
}

fn is_leaf(split: &Split, placement: &PlacementId) -> bool {
    matches!(split, Split::Leaf { placement: id } if id == placement)
}

fn holding<'a>(split: &'a Split, placement: &PlacementId) -> Option<&'a Split> {
    let Split::Branch { first, second, .. } = split else {
        return None;
    };
    if is_leaf(first, placement) || is_leaf(second, placement) {
        return Some(split);
    }
    holding(first, placement).or_else(|| holding(second, placement))
}

fn held_by(layout: &Layout, fleet: &FleetId, placement: &PlacementId) -> Option<Split> {
    fleets(layout)
        .find(|item| &item.id == fleet)?
        .root
        .as_ref()
        .and_then(|root| holding(root, placement))
        .cloned()
}

fn split_beside(side: Side, new: &PlacementId, target: &PlacementId) -> Split {
    let leaf = |placement: &PlacementId| {
        Box::new(Split::Leaf {
            placement: placement.clone(),
        })
    };
    let (axis, first, second) = match side {
        Side::Left => (Axis::Horizontal, leaf(new), leaf(target)),
        Side::Right => (Axis::Horizontal, leaf(target), leaf(new)),
        Side::Top => (Axis::Vertical, leaf(new), leaf(target)),
        Side::Bottom => (Axis::Vertical, leaf(target), leaf(new)),
    };
    Split::Branch {
        axis,
        share: SplitShare::default(),
        first,
        second,
    }
}

fn drawn_beside(side: Side, new: &Rect, target: &Rect) -> bool {
    let across = new.y < target.y + target.height && target.y < new.y + new.height;
    let along = new.x < target.x + target.width && target.x < new.x + new.width;
    match side {
        Side::Left => across && new.x + new.width <= target.x + LOGICAL_TOLERANCE,
        Side::Right => across && new.x >= target.x + target.width - LOGICAL_TOLERANCE,
        Side::Top => along && new.y + new.height <= target.y + LOGICAL_TOLERANCE,
        Side::Bottom => along && new.y >= target.y + target.height - LOGICAL_TOLERANCE,
    }
}

fn content_of<'a>(layout: &'a Layout, placement: &PlacementId) -> Option<&'a Vessel> {
    let vessel = fleets(layout)
        .flat_map(|fleet| &fleet.placements)
        .find(|item| &item.id == placement)?
        .vessel
        .clone();
    layout.vessels.iter().find(|content| content.id == vessel)
}

fn vessel_ids(layout: &Layout) -> Vec<VesselId> {
    layout
        .vessels
        .iter()
        .map(|content| content.id.clone())
        .collect()
}

fn drawn_terminals(seen: &Seen) -> Vec<String> {
    let mut keys: Vec<String> = seen
        .frame
        .elements
        .iter()
        .filter(|element| element.role == Role::Terminal)
        .map(|element| element.key.clone())
        .collect();
    keys.sort();
    keys
}

fn create(
    fleet: &FleetId,
    type_id: &str,
    insertion: PlacementInsertion,
    launch: Option<LaunchSpec>,
) -> Action {
    Action::CreateVessel {
        type_id: type_id.into(),
        destination: ContentDestination::Placement {
            owner: PlacementOwner::Fleet { id: fleet.clone() },
            insertion,
        },
        launch,
    }
}

fn beside(placement: &PlacementId, side: Side) -> PlacementInsertion {
    PlacementInsertion::Beside {
        id: placement.clone(),
        side,
    }
}

fn answered(output: &str) -> (Value, String) {
    let (body, code) = output
        .trim_end()
        .rsplit_once("exit=")
        .unwrap_or((output, ""));
    (
        serde_json::from_str(body.trim()).unwrap_or(Value::Null),
        code.trim().to_owned(),
    )
}

fn created_beside(native: &Native, fleet: &FleetId, before: &[PlacementId]) -> Result<Created> {
    native.observe("the created Vessel drawn with its own terminal", |seen| {
        let placement = members(seen.document, fleet)
            .into_iter()
            .find(|id| !before.contains(id))?;
        let content = content_of(seen.document, &placement)?;
        let terminal = content.backend.as_ref()?.0.clone();
        seen.shows(&Target::terminal(&placement)).then(|| Created {
            held: None,
            cwd: content.cwd.clone(),
            launch: content.launch.clone(),
            terminal,
            placement,
        })
    })
}

fn foreground_argv(native: &Native, terminal: &str) -> Result<Value> {
    until(
        "Core naming the stand-in codex as the foreground program",
        || {
            let reported = native
                .system
                .watch("terminal.get", json!({"terminal":terminal}))?;
            let argv = &reported["foreground"]["argv"];
            let named = argv[0]
                .as_str()
                .and_then(|program| Path::new(program).file_name())
                .is_some_and(|name| name == CODEX);
            Ok(named.then(|| argv.clone()))
        },
    )
}

fn start_agent(
    native: &mut Native,
    caller: &str,
    fleet: &FleetId,
    target: &PlacementId,
    permissions: Option<Permissions>,
    request: &str,
) -> Result<Started> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let before = members(&layout, fleet);
    let output = from_another_vessel(
        native,
        caller,
        request,
        create(
            fleet,
            "agent",
            beside(target, Side::Right),
            Some(LaunchSpec::Agent {
                kind: CODEX.into(),
                model: None,
                effort: None,
                permissions,
            }),
        ),
    )?;
    let (_, code) = answered(&output);
    if code != "0" {
        return Ok(Started {
            created: None,
            code,
            foreground: Value::Null,
            printed: false,
        });
    }
    let created = created_beside(native, fleet, &before)?;
    let agent = Terminal::bind(native, &created.placement)?;
    let printed = agent.printed(native, "Stand-in codex started with: ")?;
    let foreground = foreground_argv(native, &created.terminal)?;
    Ok(Started {
        created: Some(created),
        code,
        foreground,
        printed,
    })
}

fn divided(
    seen: &Seen,
    fleet: &FleetId,
    left: &PlacementId,
    right: &PlacementId,
) -> Option<Divided> {
    let owner = serde_json::to_value(PlacementOwner::Fleet { id: fleet.clone() }).ok()?;
    let divider = seen
        .frame
        .elements
        .iter()
        .find(|element| {
            element.role == Role::SplitDivider
                && serde_json::from_str::<Value>(&element.key)
                    .is_ok_and(|key| key[1] == owner && key[2] == json!([]))
        })?
        .bounds;
    let first = Target::terminal(left).find(seen.frame)?.bounds;
    let second = Target::terminal(right).find(seen.frame)?.bounds;
    let share = match fleets(seen.document)
        .find(|item| &item.id == fleet)?
        .root
        .as_ref()?
    {
        Split::Branch { share, .. } => Some(*share),
        Split::Leaf { .. } => None,
    };
    Some(Divided {
        share,
        fraction: (divider.x + divider.width / 2.0 - first.x) / (second.x + second.width - first.x),
    })
}

fn at_share(divided: &Divided, share: u16) -> bool {
    divided.share.map(u16::from) == Some(share)
        && (divided.fraction - f32::from(share) / f32::from(SplitShare::TOTAL)).abs()
            <= SHARE_TOLERANCE
}

fn resize(fleet: &FleetId, share: u16) -> Result<Action> {
    Ok(Action::ResizePlacementSplit {
        owner: PlacementOwner::Fleet { id: fleet.clone() },
        path: Vec::new(),
        share: SplitShare::try_from(share).map_err(anyhow::Error::msg)?,
    })
}

fn labelled(native: &Native, first: &Terminal, name: &str, place: &str) -> Result<PlacementId> {
    typed(
        first,
        native,
        &format!("hc run --bg --name {name} --label voyager.place={place} bash"),
    )?;
    let terminal = address(native, name)?;
    native.observe("the labelled shell saved as a Vessel", |seen| {
        bound_to(seen.document, &terminal).map(|placed| placed.id)
    })
}

fn arguments(argv: &Value) -> Vec<String> {
    argv.as_array()
        .into_iter()
        .flatten()
        .skip(1)
        .filter_map(|argument| argument.as_str().map(str::to_owned))
        .collect()
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let anchor = first.placement().clone();
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = layout
        .selected_fleet
        .clone()
        .context("The layout has no selected Fleet")?;
    let voyage = voyages(&layout)
        .find(|item| item.fleets.iter().any(|member| member.id == fleet))
        .map(|item| item.id.clone())
        .context("The first Fleet has no Voyage")?;
    let caller = content_of(&layout, &anchor)
        .and_then(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
        .context("The first Vessel has no terminal")?;

    let landed = cases.make(native, Case::LabelSplitsEachSide, |native| {
        first.enter(native, SECOND_PROJECT)?;
        let mut landed = Vec::new();
        for (side, word) in SIDES {
            let name = format!("split-{word}");
            typed(
                &first,
                native,
                &format!(
                    "hc run --bg --name {name} --label voyager.place=fleet:{}:{word}:{} bash",
                    fleet.0, anchor.0
                ),
            )?;
            let terminal = address(native, &name)?;
            landed.push(native.observe(
                "the labelled shell drawn beside the named placement",
                |seen| {
                    let placed = bound_to(seen.document, &terminal)?;
                    Some(Landed {
                        side,
                        drawn: Target::terminal(&placed.id).find(seen.frame)?.bounds,
                        beside: Target::terminal(&anchor).find(seen.frame)?.bounds,
                        held: held_by(seen.document, &fleet, &anchor),
                        placement: placed.id,
                    })
                },
            )?);
        }
        native.keep_window("label-splits-each-side")?;
        let saved = landed.iter().all(|item| {
            item.held.as_ref() == Some(&split_beside(item.side, &item.placement, &anchor))
        });
        let drawn = landed
            .iter()
            .all(|item| drawn_beside(item.side, &item.drawn, &item.beside));
        let verdict = Verdict::new()
            .expect(
                "each labelled shell is saved on its side of the named placement at an even share",
                saved,
            )
            .expect(
                "each labelled shell is drawn on its side of the named placement",
                drawn,
            )
            .observed("landed", &landed)?;
        let placed: Vec<(Side, PlacementId)> = landed
            .into_iter()
            .map(|item| (item.side, item.placement))
            .collect();
        Ok((verdict, Some(placed)))
    })?;
    let Some(placed) = landed else {
        return Ok(());
    };
    let split = |wanted: Side| {
        placed
            .iter()
            .find(|(side, _)| *side == wanted)
            .map(|(_, placement)| placement.clone())
            .context("A labelled split is missing")
    };
    let right = split(Side::Right)?;
    let left = split(Side::Left)?;
    let top = split(Side::Top)?;

    cases.check(native, Case::CreateVesselSplitsBeside, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let before = members(&layout, &fleet);
        let target_cwd = content_of(&layout, &right).map(|content| content.cwd.clone());
        let voyager = bound_terminal(native);
        let output = from_another_vessel(
            native,
            &caller,
            "split-beside-1",
            create(&fleet, "terminal", beside(&right, Side::Bottom), None),
        )?;
        let (reply, code) = answered(&output);
        let made = if code == "0" {
            let mut made = created_beside(native, &fleet, &before)?;
            let (_, after) = native.document()?.context("Missing saved layout")?;
            made.held = held_by(&after, &fleet, &right);
            Some(made)
        } else {
            None
        };
        let started_in = match &made {
            Some(made) => native
                .system
                .rpc("terminal.get", json!({"terminal":made.terminal}))?["cwd"]
                .clone(),
            None => Value::Null,
        };
        let (_, standing) = native.document()?.context("Missing saved layout")?;
        let refusal_output = from_another_vessel(
            native,
            &caller,
            "split-empty-1",
            create(&fleet, "terminal", PlacementInsertion::Empty, None),
        )?;
        let (refusal, refused_code) = answered(&refusal_output);
        let (_, after) = native.document()?.context("Missing saved layout")?;
        native.keep_window("create-vessel-splits-beside")?;
        Verdict::new()
            .expect(
                "the caller is a Vessel other than the bound Voyager",
                voyager.as_deref() != Some(caller.as_str()),
            )
            .expect(
                "voyager do workspace applied create-vessel beside a placement from that Vessel and exited 0",
                code == "0" && reply["reply"]["status"] == "applied",
            )
            .expect(
                "the saved layout holds the new Vessel below the named placement at an even share",
                made.as_ref().is_some_and(|made| {
                    made.held.as_ref() == Some(&split_beside(Side::Bottom, &made.placement, &right))
                }),
            )
            .expect(
                "the new Vessel's saved folder is the folder of the placement it was created beside",
                made.as_ref()
                    .is_some_and(|made| Some(&made.cwd) == target_cwd.as_ref()),
            )
            .expect(
                "Core started the new terminal in that folder",
                target_cwd.as_deref().is_some_and(|cwd| started_in == cwd),
            )
            .expect(
                "create-vessel with an empty insertion from that Vessel was refused with nothing queued and exited 1",
                refusal == json!({"kind":"refused","message":VESSEL_NOT_OFFERED})
                    && refused_code == "1",
            )
            .expect(
                "the refused create-vessel left the saved Vessels and the Fleet's split as they were",
                vessel_ids(&standing) == vessel_ids(&after)
                    && fleets(&standing).find(|item| item.id == fleet).map(|item| &item.root)
                        == fleets(&after).find(|item| item.id == fleet).map(|item| &item.root),
            )
            .observed("caller", &caller)?
            .observed("created", &made)?
            .observed("targetCwd", &target_cwd)?
            .observed("startedIn", &started_in)?
            .observed("refused", &refusal_output)
    })?;

    cases.check(native, Case::BadSplitPlacesNothing, |native| {
        let made = from_another_vessel(
            native,
            &caller,
            "split-second-fleet",
            Action::CreateFleet {
                voyage: voyage.clone(),
                name: SECOND_FLEET.into(),
            },
        )?;
        let second = native.observe("the second Fleet saved", |seen| {
            fleets(seen.document)
                .find(|item| item.name == SECOND_FLEET)
                .map(|item| item.id.clone())
        })?;
        native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
        let drawn_before = native.observe("the first Fleet selected and drawn again", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet)
                && seen.shows(&Target::terminal(&anchor)))
            .then(|| drawn_terminals(seen))
        })?;
        let (_, before) = native.document()?.context("Missing saved layout")?;
        let labels = [
            ("split-middle", format!("fleet:{}:middle:{}", fleet.0, anchor.0)),
            ("split-nowhere", format!("fleet:{}:left:{NOWHERE}", fleet.0)),
            ("split-foreign", format!("fleet:{}:right:{}", second.0, anchor.0)),
        ];
        let mut notices = Vec::new();
        for (name, place) in &labels {
            typed(
                &first,
                native,
                &format!("hc run --bg --name {name} --label voyager.place={place} bash"),
            )?;
            let terminal = address(native, name)?;
            let notice = native.screen_status(
                "the misplaced split named in the status line",
                |label| label.contains(&format!("Terminal {terminal} was not placed")),
            )?;
            notices.push((terminal, notice));
        }
        let unknown = from_another_vessel(
            native,
            &caller,
            "split-unknown",
            create(
                &fleet,
                "terminal",
                beside(&PlacementId(NOWHERE.into()), Side::Right),
                None,
            ),
        )?;
        let (reply, code) = answered(&unknown);
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let drawn_after = native.observe("the Fleet drawn after the bad splits", |seen| {
            Some(drawn_terminals(seen))
        })?;
        native.keep_window("bad-split-places-nothing")?;
        Verdict::new()
            .expect(
                "no misplaced terminal became a Vessel",
                notices
                    .iter()
                    .all(|(terminal, _)| bound_to(&after, terminal).is_none()),
            )
            .expect(
                "the saved layout holds no new Vessel",
                vessel_ids(&before) == vessel_ids(&after),
            )
            .expect(
                "the canvas draws no new terminal",
                drawn_before == drawn_after,
            )
            .expect(
                "the status line named each misplaced terminal",
                notices
                    .iter()
                    .all(|(terminal, notice)| notice.contains(terminal.as_str())),
            )
            .expect(
                "create-vessel beside an unknown placement was refused as a structured workspace reply and exited 1",
                reply["kind"] == "workspace"
                    && reply["reply"]["requestId"] == "split-unknown"
                    && reply["reply"]["status"] == "refused"
                    && reply["reply"]["message"]
                        .as_str()
                        .is_some_and(|message| !message.is_empty())
                    && code == "1",
            )
            .observed("secondFleet", &made)?
            .observed("notices", &notices)?
            .observed("unknown", &unknown)
    })?;

    cases.check(native, Case::AgentStartsPlain, |native| {
        let plain = start_agent(native, &caller, &fleet, &left, None, "split-agent-plain")?;
        let read_only = start_agent(
            native,
            &caller,
            &fleet,
            &top,
            Some(Permissions::ReadOnly),
            "split-agent-read-only",
        )?;
        native.keep_window("agent-starts-plain")?;
        let launch_of = |started: &Started| started.created.as_ref().and_then(|made| made.launch.clone());
        let table: Vec<String> = READ_ONLY.iter().map(|argument| (*argument).to_owned()).collect();
        Verdict::new()
            .expect(
                "create-vessel of a codex agent naming no permissions exited 0",
                plain.code == "0",
            )
            .expect(
                "the saved agent's launch is exactly codex",
                launch_of(&plain)
                    == Some(Launch::Program {
                        argv: vec![CODEX.into()],
                    }),
            )
            .expect(
                "the started stand-in codex got no arguments and no bypass flag",
                plain.printed && arguments(&plain.foreground).is_empty(),
            )
            .expect(
                "create-vessel of a codex agent naming read-only permissions exited 0",
                read_only.code == "0",
            )
            .expect(
                "the saved read-only agent's launch is the table's read-only arguments",
                launch_of(&read_only) == Some(Launch::Program { argv: table.clone() }),
            )
            .expect(
                "the started read-only stand-in codex got the table's read-only arguments and no bypass flag",
                read_only.printed
                    && arguments(&read_only.foreground) == table[1..]
                    && !arguments(&read_only.foreground).iter().any(|argument| argument == BYPASS),
            )
            .observed("plain", &plain)?
            .observed("readOnly", &read_only)
    })?;

    cases.check(native, Case::PersonKeepsTableDefault, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let before = members(&layout, &fleet);
        native.edit_profile_file("launches.json", UNNAMED_CODEX)?;
        Terminal::bind(native, &left)?.focus(native)?;
        native.press(Key::Char('o').ctrl().shift())?;
        native.click(&Target::worker(CODEX))?;
        let created = created_beside(native, &fleet, &before)?;
        let agent = Terminal::bind(native, &created.placement)?;
        let printed = agent.printed(native, "Stand-in codex started with: ")?;
        let foreground = foreground_argv(native, &created.terminal)?;
        native.keep_window("person-keeps-table-default")?;
        let table: Vec<String> = TABLE_DEFAULT.iter().map(|argument| (*argument).to_owned()).collect();
        Verdict::new()
            .expect(
                "the person's Create Codex, from a launch entry that names no permissions, saved the table's default launch, permission flag included",
                created.launch == Some(Launch::Program { argv: table.clone() }),
            )
            .expect(
                "the started stand-in codex got the table's arguments, bypass flag included",
                printed
                    && arguments(&foreground) == table[1..]
                    && arguments(&foreground).iter().any(|argument| argument == BYPASS),
            )
            .observed("created", &created)?
            .observed("foreground", &foreground)
    })?;

    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let second = fleets(&layout)
        .find(|item| item.name == SECOND_FLEET)
        .map(|item| item.id.clone())
        .context("The second Fleet is missing")?;
    let pair = cases.make(native, Case::VoyagerResizesASplit, |native| {
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let left = labelled(native, &first, "pair-left", &format!("fleet:{}", second.0))?;
        let right = labelled(
            native,
            &first,
            "pair-right",
            &format!("fleet:{}:right:{}", second.0, left.0),
        )?;
        native.click(&Target::name(&RenameTarget::Fleet { id: second.clone() }))?;
        let before = native.observe("the two Vessels of the second Fleet drawn side by side", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&second))
                .then(|| divided(seen, &second, &left, &right))
                .flatten()
        })?;
        let output = from_another_vessel(native, &voyager, "split-resize-1", resize(&second, RESIZED)?)?;
        let (reply, code) = answered(&output);
        let after = native.settle(
            "the split saved and drawn at the requested share",
            |seen| divided(seen, &second, &left, &right),
            |divided| at_share(divided, RESIZED),
        )?;
        native.keep_window("voyager-resizes-a-split")?;
        let verdict = Verdict::new()
            .expect(
                "the split was drawn at an even share before the resize",
                at_share(&before, SplitShare::TOTAL / 2),
            )
            .expect(
                "voyager do workspace applied resize-placement-split from Voyager's terminal and exited 0",
                code == "0" && reply["reply"]["status"] == "applied",
            )
            .expect(
                "the saved share and the drawn divider moved to the requested share",
                at_share(&after, RESIZED),
            )
            .observed("before", &before)?
            .observed("after", &after)?
            .observed("reply", &output)?;
        Ok((verdict, Some((left, right))))
    })?;
    let Some((left, right)) = pair else {
        return Ok(());
    };

    cases.check(native, Case::AgentResizeRefused, |native| {
        let (_, before) = native.document()?.context("Missing saved layout")?;
        let output = from_another_vessel(
            native,
            &caller,
            "split-resize-refused",
            resize(&second, REFUSED_SHARE)?,
        )?;
        let (refusal, code) = answered(&output);
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let drawn = native.observe("the second Fleet's split drawn after the refusal", |seen| {
            divided(seen, &second, &left, &right)
        })?;
        let root = |layout: &Layout| {
            fleets(layout)
                .find(|item| item.id == second)
                .and_then(|item| item.root.clone())
        };
        native.keep_window("agent-resize-refused")?;
        Verdict::new()
            .expect(
                "resize-placement-split from a Vessel other than Voyager was refused and exited 1",
                refusal["kind"] == "refused"
                    && refusal["message"]
                        .as_str()
                        .is_some_and(|message| message.ends_with(RESIZE_REFUSED))
                    && code == "1",
            )
            .expect(
                "the saved split kept Voyager's share",
                root(&before) == root(&after) && at_share(&drawn, RESIZED),
            )
            .observed("refused", &output)?
            .observed("drawn", &drawn)
    })
}
