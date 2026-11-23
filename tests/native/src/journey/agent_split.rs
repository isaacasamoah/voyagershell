use super::adopt_by_label::{address, bound_to, typed};
use super::arrangement::{same_rect, union};
use super::socket_dock::{from_another_vessel, maximized, members, set_maximized};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, bound_terminal, fleets, voyages};
use crate::sandbox::{CORE, SECOND_PROJECT};
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
    AgentSplitKeepsMaximize => "agent-split-keeps-maximize",
    NewPieceShowsAfterUnmaximize => "new-piece-shows-after-unmaximize",
    VoyagerSplitClearsMaximize => "voyager-split-clears-maximize";
    "voyager-resizes-a-split" needs "bad-split-places-nothing",
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
const KEPT: &str = "the agent's split saved with the maximized Vessel drawn alone";
const CLEARED: &str = "Voyager's split saved with the maximize cleared and both Vessels drawn";
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

#[derive(Clone, PartialEq, Serialize)]
struct View {
    placement: PlacementId,
    maximized: Option<PlacementId>,
    held: bool,
    drawn: Vec<(String, Rect)>,
}

impl View {
    fn drew(&self, placement: &PlacementId) -> bool {
        self.drawn.iter().any(|(key, _)| key == &placement.0)
    }

    fn alone(&self, maximized: &PlacementId, area: &Rect) -> bool {
        matches!(self.drawn.as_slice(), [(key, drawn)] if key == &maximized.0 && same_rect(drawn, area))
    }

    fn kept(&self, maximized: &PlacementId, area: &Rect) -> bool {
        self.held && self.maximized.as_ref() == Some(maximized) && self.alone(maximized, area)
    }

    fn cleared(&self, was: &PlacementId) -> bool {
        self.held && self.maximized.is_none() && self.drew(was) && self.drew(&self.placement)
    }
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
    let json = body
        .lines()
        .skip_while(|line| !line.starts_with('{'))
        .collect::<Vec<_>>()
        .join("\n");
    (
        serde_json::from_str(json.trim()).unwrap_or(Value::Null),
        code.trim().to_owned(),
    )
}

fn said_before_json(output: &str) -> Option<&str> {
    let sentence = output.lines().next()?.trim();
    (!sentence.starts_with('{') && !sentence.is_empty() && sentence.ends_with('.'))
        .then_some(sentence)
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

fn create_codex(native: &mut Native, fleet: &FleetId, left: &PlacementId) -> Result<Started> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let before = members(&layout, fleet);
    Terminal::bind(native, left)?.focus(native)?;
    native.press(Key::Char('o').ctrl().shift())?;
    native.click(&Target::worker(CODEX))?;
    let created = created_beside(native, fleet, &before)?;
    let agent = Terminal::bind(native, &created.placement)?;
    let printed = agent.printed(native, "Stand-in codex started with: ")?;
    let foreground = foreground_argv(native, &created.terminal)?;
    Ok(Started {
        created: Some(created),
        code: String::new(),
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

fn terminal_of(layout: &Layout, placement: &PlacementId) -> Option<String> {
    content_of(layout, placement)
        .and_then(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
}

fn view(seen: &Seen, fleet: &FleetId, placement: &PlacementId) -> View {
    let placed = members(seen.document, fleet);
    let mut drawn: Vec<(String, Rect)> = seen
        .frame
        .elements
        .iter()
        .filter(|element| {
            element.role == Role::Terminal && placed.iter().any(|member| member.0 == element.key)
        })
        .map(|element| (element.key.clone(), element.bounds))
        .collect();
    drawn.sort_by(|a, b| a.0.cmp(&b.0));
    View {
        placement: placement.clone(),
        maximized: maximized(seen.document, fleet),
        held: held_by(seen.document, fleet, placement).is_some(),
        drawn,
    }
}

fn settled(
    native: &Native,
    fleet: &FleetId,
    placement: &PlacementId,
    expected: &str,
    wanted: impl Fn(&View) -> bool,
) -> Result<View> {
    native
        .settle(expected, |seen| Some(view(seen, fleet, placement)), wanted)
        .or_else(|_| native.observe(expected, |seen| Some(view(seen, fleet, placement))))
}

fn joined(native: &Native, fleet: &FleetId, before: &[PlacementId]) -> Result<PlacementId> {
    native.observe("the created Vessel saved in the Fleet", |seen| {
        members(seen.document, fleet)
            .into_iter()
            .find(|id| !before.contains(id))
    })
}

fn maximize(
    native: &Native,
    voyager: &str,
    fleet: &FleetId,
    placement: &PlacementId,
    request: &str,
) -> Result<()> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    if maximized(&layout, fleet).as_ref() != Some(placement) {
        from_another_vessel(native, voyager, request, set_maximized(placement, true))?;
    }
    native
        .settle(
            "the placement saved as maximized by Voyager",
            |seen| Some(maximized(seen.document, fleet)),
            |held| held.as_ref() == Some(placement),
        )
        .map(drop)
}

fn started_from(native: &Native, terminal: &str, name: &str, place: &str) -> Result<String> {
    native.system.execute(
        "env",
        &[
            &format!("HC_TERMINAL_ID={terminal}"),
            CORE,
            "run",
            "--bg",
            "--cwd",
            SECOND_PROJECT,
            "--name",
            name,
            "--label",
            &format!("voyager.place={place}"),
            "bash",
        ],
        None,
    )?;
    address(native, name)
}

fn drawn_within(inner: &Rect, outer: &Rect) -> bool {
    inner.width > 0.0
        && inner.height > 0.0
        && inner.x >= outer.x - LOGICAL_TOLERANCE
        && inner.y >= outer.y - LOGICAL_TOLERANCE
        && inner.x + inner.width <= outer.x + outer.width + LOGICAL_TOLERANCE
        && inner.y + inner.height <= outer.y + outer.height + LOGICAL_TOLERANCE
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
    let caller = terminal_of(&layout, &anchor).context("The first Vessel has no terminal")?;

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
                "the command said in plain words what it added, before the JSON",
                said_before_json(&output)
                    .is_some_and(|sentence| sentence.starts_with("Added a terminal Vessel to ")),
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
        let seeded = create_codex(native, &fleet, &left)?;
        native.edit_profile_file("launches.json", UNNAMED_CODEX)?;
        let unnamed = create_codex(native, &fleet, &left)?;
        native.keep_window("person-keeps-table-default")?;
        let table: Vec<String> = TABLE_DEFAULT.iter().map(|argument| (*argument).to_owned()).collect();
        let saved = |started: &Started| started.created.as_ref().and_then(|made| made.launch.clone()) == Some(Launch::Program { argv: table.clone() });
        let got = |started: &Started| {
            started.printed
                && arguments(&started.foreground) == table[1..]
                && arguments(&started.foreground).iter().any(|argument| argument == BYPASS)
        };
        Verdict::new()
            .expect(
                "with the Codex entry as shipped, the person's Create Codex saved the arguments that entry names",
                saved(&seeded),
            )
            .expect(
                "with the Codex entry as shipped, the started stand-in codex got those arguments, bypass flag included",
                got(&seeded),
            )
            .expect(
                "with a Codex entry that names no permissions, the person's Create Codex saved the table's default launch",
                saved(&unnamed),
            )
            .expect(
                "with a Codex entry that names no permissions, the started stand-in codex got the table's default arguments, bypass flag included",
                got(&unnamed),
            )
            .observed("seeded", &seeded)?
            .observed("unnamed", &unnamed)
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
    })?;

    let kept = cases.make(native, Case::AgentSplitKeepsMaximize, |native| {
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let shell_terminal = terminal_of(&layout, &left);
        let before = native.observe("both Vessels of the second Fleet drawn", |seen| {
            let drawn = view(seen, &second, &left).drawn;
            (drawn.len() == 2).then_some(drawn)
        })?;
        let area = union(&before).context("No Vessel of the second Fleet is drawn")?;
        let shell = Terminal::bind(native, &left)?;
        maximize(native, &voyager, &second, &left, "keep-max-side")?;
        let side = labelled(
            native,
            &shell,
            "keep-side",
            &format!("fleet:{}:right:{}", second.0, left.0),
        )?;
        let side = settled(native, &second, &side, KEPT, |view| view.kept(&left, &area))?;
        maximize(native, &voyager, &second, &left, "keep-max-fleet")?;
        let plain = labelled(native, &shell, "keep-fleet", &format!("fleet:{}", second.0))?;
        let plain = settled(native, &second, &plain, KEPT, |view| view.kept(&left, &area))?;
        maximize(native, &voyager, &second, &left, "keep-max-beside")?;
        let (_, standing) = native.document()?.context("Missing saved layout")?;
        let output = from_another_vessel(
            native,
            &caller,
            "keep-beside",
            create(&second, "terminal", beside(&right, Side::Top), None),
        )?;
        let (reply, code) = answered(&output);
        let made = match code.as_str() {
            "0" => {
                let created = joined(native, &second, &members(&standing, &second))?;
                Some(settled(native, &second, &created, KEPT, |view| {
                    view.kept(&left, &area)
                })?)
            }
            _ => None,
        };
        maximize(native, &voyager, &second, &left, "keep-max-child")?;
        let child_terminal = started_from(
            native,
            &voyager,
            "voyager-child",
            &format!("fleet:{}:bottom:{}", second.0, left.0),
        )?;
        let parent = native
            .system
            .rpc("terminal.get", json!({"terminal":child_terminal}))?["parent"]
            .clone();
        let child_placed = native.observe(
            "the shell started from Voyager's terminal saved as a Vessel",
            |seen| bound_to(seen.document, &child_terminal).map(|placed| placed.id),
        )?;
        let child = settled(native, &second, &child_placed, KEPT, |view| {
            view.kept(&left, &area)
        })?;
        native.keep_window("agent-split-keeps-maximize")?;
        let views: Vec<&View> = [&side, &plain, &child].into_iter().chain(&made).collect();
        let every =
            |holds: &dyn Fn(&View) -> bool| views.len() == 4 && views.iter().all(|&view| holds(view));
        let verdict = Verdict::new()
            .expect(
                "neither the labelling shell nor the create-vessel caller is Voyager's terminal",
                shell_terminal.as_deref().is_some_and(|terminal| terminal != voyager)
                    && caller != voyager,
            )
            .expect(
                "voyager do workspace applied create-vessel beside a placement from that Vessel and exited 0",
                code == "0" && reply["reply"]["status"] == "applied",
            )
            .expect(
                "after each agent split the saved layout still names the same maximized Vessel",
                every(&|view| view.maximized.as_ref() == Some(&left)),
            )
            .expect(
                "each new Vessel is saved in the Fleet's split tree",
                every(&|view| view.held),
            )
            .expect(
                "the canvas draws only the maximized Vessel, filling the area both Vessels filled",
                every(&|view| view.alone(&left, &area)),
            )
            .expect(
                "a labelled shell started from Voyager's terminal still keeps the maximize",
                child.kept(&left, &area),
            )
            .observed("area", area)?
            .observed("child", &child)?
            .observed(
                "parent",
                json!({"reported":parent,"voyager":voyager,"isVoyager":parent == voyager.as_str()}),
            )?
            .observed("side", &side)?
            .observed("fleet", &plain)?
            .observed("beside", &made)?
            .observed("reply", &output)?;
        Ok((verdict, Some((area, side.placement.clone()))))
    })?;
    let Some((area, piece)) = kept else {
        return Ok(());
    };

    cases.check(native, Case::NewPieceShowsAfterUnmaximize, |native| {
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let output = from_another_vessel(
            native,
            &voyager,
            "keep-restore",
            set_maximized(&left, false),
        )?;
        let (reply, code) = answered(&output);
        let restored = native
            .observe("the Fleet restored with the new Vessel drawn", |seen| {
                maximized(seen.document, &second).is_none().then_some(())?;
                Some((
                    Target::terminal(&piece).find(seen.frame)?.bounds,
                    Target::terminal(&left).find(seen.frame)?.bounds,
                ))
            })
            .ok();
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let printed = match restored {
            Some(_) => {
                let shell = Terminal::bind(native, &piece)?;
                shell.line(native, "echo PIECE-$((6*7))")?;
                shell.printed(native, "PIECE-42")?
            }
            None => false,
        };
        native.keep_window("new-piece-shows-after-unmaximize")?;
        Verdict::new()
            .expect(
                "voyager do workspace applied the restore from Voyager's terminal and exited 0",
                code == "0" && reply["reply"]["status"] == "applied",
            )
            .expect(
                "the saved layout holds no maximized Vessel",
                maximized(&layout, &second).is_none(),
            )
            .expect(
                "the new Vessel is drawn with a non-empty frame inside the area the Fleet's Vessels filled",
                restored.is_some_and(|(drawn, _)| drawn_within(&drawn, &area)),
            )
            .expect(
                "the new Vessel is drawn right of the Vessel that was maximized, without overlapping it",
                restored.is_some_and(|(drawn, was)| drawn_beside(Side::Right, &drawn, &was)),
            )
            .expect("the new Vessel's shell printed PIECE-42", printed)
            .observed("area", area)?
            .observed("restored", restored)?
            .observed("reply", &output)
    })?;

    cases.check(native, Case::VoyagerSplitClearsMaximize, |native| {
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        maximize(native, &voyager, &second, &left, "clear-max-beside")?;
        let (_, standing) = native.document()?.context("Missing saved layout")?;
        let output = from_another_vessel(
            native,
            &voyager,
            "clear-beside",
            create(&second, "terminal", beside(&right, Side::Bottom), None),
        )?;
        let (reply, code) = answered(&output);
        let made = match code.as_str() {
            "0" => {
                let created = joined(native, &second, &members(&standing, &second))?;
                Some(settled(native, &second, &created, CLEARED, |view| {
                    view.cleared(&left)
                })?)
            }
            _ => None,
        };
        native.keep_window("voyager-split-clears-maximize")?;
        Verdict::new()
            .expect(
                "voyager do workspace applied create-vessel beside a placement from Voyager's terminal and exited 0",
                code == "0" && reply["reply"]["status"] == "applied",
            )
            .expect(
                "after Voyager's create-vessel the saved layout holds the new Vessel in the Fleet's split tree and no maximized Vessel",
                made.as_ref()
                    .is_some_and(|view| view.held && view.maximized.is_none()),
            )
            .expect(
                "after Voyager's create-vessel the canvas draws the Vessel that was maximized and the new Vessel",
                made.as_ref()
                    .is_some_and(|view| view.drew(&left) && view.drew(&view.placement)),
            )
            .observed("beside", &made)?
            .observed("reply", &output)
    })
}
