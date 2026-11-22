use voyager_contract::socket::SocketReply;
use voyager_contract::{
    Action, ContentDestination, Context, FleetId, Layout, Outcome, PlacementId, PlacementOwner,
    RenameTarget, Reply, Request, Side, Unapplied, VoyageId,
};

struct Intent {
    done: String,
    attempt: String,
}

struct Names<'a>(Option<&'a Layout>);

impl Names<'_> {
    fn voyage(&self, id: &VoyageId) -> Option<&str> {
        self.0?
            .containers()
            .find(|voyage| &voyage.id == id)
            .map(|voyage| voyage.name.as_str())
    }

    fn fleet(&self, id: &FleetId) -> Option<&str> {
        self.0?
            .containers()
            .flat_map(|voyage| &voyage.fleets)
            .find(|fleet| &fleet.id == id)
            .map(|fleet| fleet.name.as_str())
    }

    fn placement(&self, id: &PlacementId) -> Option<&str> {
        self.0?
            .containers()
            .flat_map(|voyage| {
                voyage
                    .fleets
                    .iter()
                    .flat_map(|fleet| &fleet.placements)
                    .chain(&voyage.portals)
            })
            .find(|placement| &placement.id == id)
            .map(|placement| placement.name.as_str())
    }
}

fn noun(kind: &str, name: Option<&str>) -> String {
    match name {
        Some(name) => format!("the {name} {kind}"),
        None => format!("that {kind}"),
    }
}

fn direction(before: bool) -> &'static str {
    if before { "before" } else { "after" }
}

fn side(side: &Side) -> &'static str {
    match side {
        Side::Left => "to the left of",
        Side::Right => "to the right of",
        Side::Top => "above",
        Side::Bottom => "below",
    }
}

fn intent(action: &Action, names: &Names) -> Option<Intent> {
    let both = |done: String, attempt: String| Some(Intent { done, attempt });
    match action {
        Action::Inspect => None,
        Action::CreateFleet { voyage, name } => {
            let place = names
                .voyage(voyage)
                .map(|voyage| format!(" in the {voyage} Voyage"))
                .unwrap_or_default();
            both(
                format!("Created the Fleet {name}{place}."),
                format!("create the Fleet {name}{place}"),
            )
        }
        Action::CreateFleetWithVessel { name, type_id, .. } => both(
            format!("Created the Fleet {name} with a new {type_id} Vessel."),
            format!("create the Fleet {name} with a new {type_id} Vessel"),
        ),
        Action::CreateVessel {
            type_id,
            destination: ContentDestination::Placement { owner, .. },
            ..
        } => {
            let target = match owner {
                PlacementOwner::Fleet { id } => format!("to {}", noun("Fleet", names.fleet(id))),
                PlacementOwner::Portals { voyage } => {
                    format!("to the Portals of {}", noun("Voyage", names.voyage(voyage)))
                }
            };
            both(
                format!("Added a {type_id} Vessel {target}."),
                format!("add a {type_id} Vessel {target}"),
            )
        }
        Action::Rename { target, name } => {
            let (kind, current) = match target {
                RenameTarget::Voyage { id } => ("Voyage", names.voyage(id)),
                RenameTarget::Fleet { id } => ("Fleet", names.fleet(id)),
                RenameTarget::Vessel { id } => ("Vessel", names.placement(id)),
                RenameTarget::Portal { id } => ("Portal", names.placement(id)),
            };
            let old = current.filter(|current| current != name).map_or_else(
                || format!("the {kind}"),
                |current| noun(kind, Some(current)),
            );
            both(
                format!("Renamed the {kind} to {name}."),
                format!("rename {old} to {name}"),
            )
        }
        Action::MoveVoyage { id, target, before } => {
            let (moved, other) = (
                noun("Voyage", names.voyage(id)),
                noun("Voyage", names.voyage(target)),
            );
            let way = direction(*before);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::MoveFleet { id, target, before } => {
            let (moved, other) = (
                noun("Fleet", names.fleet(id)),
                noun("Fleet", names.fleet(target)),
            );
            let way = direction(*before);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::MovePlacement {
            id,
            target,
            side: edge,
        } => {
            let (moved, other) = (
                noun("Vessel", names.placement(id)),
                noun("Vessel", names.placement(target)),
            );
            let way = side(edge);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::RemovePlacement { id } => {
            let target = noun("Vessel", names.placement(id));
            both(format!("Removed {target}."), format!("remove {target}"))
        }
        Action::SelectVoyage { id } => {
            let target = noun("Voyage", names.voyage(id));
            both(format!("Opened {target}."), format!("open {target}"))
        }
        Action::SelectFleet { id } => {
            let target = noun("Fleet", names.fleet(id));
            both(format!("Opened {target}."), format!("open {target}"))
        }
        Action::Dock { context } => {
            let target = match context {
                Context::Workspace => "the workspace".to_owned(),
                Context::Voyage { id } => noun("Voyage", names.voyage(id)),
                Context::Fleet { id } => noun("Fleet", names.fleet(id)),
                Context::Vessel { id } => noun("Vessel", names.placement(id)),
                Context::Portal { id } => noun("Portal", names.placement(id)),
            };
            both(
                format!("Took you to {target}."),
                format!("take you to {target}"),
            )
        }
        Action::SetPlacementMaximized { id, maximized } => {
            let target = noun("Vessel", names.placement(id));
            if *maximized {
                both(format!("Maximized {target}."), format!("maximize {target}"))
            } else {
                both(
                    format!("Restored {target} to its normal size."),
                    format!("restore {target} to its normal size"),
                )
            }
        }
        _ => both("Made that change.".into(), "make that change".into()),
    }
}

fn unsettled(intent: &Intent) -> String {
    format!(
        "I asked to {}, but I can't tell yet whether it happened.",
        intent.attempt
    )
}

const NOT_PLAIN: &[&str] = &[
    "applied",
    "canvas",
    "column",
    "expected",
    "id",
    "inspect",
    "inspected",
    "queued",
    "request",
    "revision",
    "split",
    "stored",
    "version",
];

fn plain_reason(message: &str) -> Option<String> {
    let first = message.split(';').next()?.trim().trim_end_matches('.');
    let first = first
        .replace("Layout", "Workspace")
        .replace("layout", "workspace");
    let bare = first
        .chars()
        .all(|letter| letter.is_alphabetic() || matches!(letter, ' ' | ',' | '\''));
    let plain = first.len() <= 100
        && bare
        && first
            .split(|letter: char| !letter.is_alphanumeric())
            .all(|word| {
                let lowered = word.to_lowercase();
                !NOT_PLAIN.contains(&lowered.as_str()) && !lowered.starts_with("placement")
            });
    let mut letters = first.chars();
    let capitalised = letters
        .next()
        .map(|head| head.to_uppercase().chain(letters).collect::<String>());
    capitalised.filter(|_| plain)
}

fn refused(intent: &Intent, message: Option<&str>) -> String {
    let reason = message
        .and_then(plain_reason)
        .map(|reason| format!(" {reason}."))
        .unwrap_or_default();
    format!(
        "I asked to {}, but it was refused, so nothing changed.{reason}",
        intent.attempt
    )
}

pub fn sentence(request: &Request, reply: &SocketReply) -> Option<String> {
    let (outcome, layout, message) = match reply {
        SocketReply::Status { .. } | SocketReply::Focus { .. } | SocketReply::Noted => return None,
        SocketReply::Refused { message } => (Outcome::Refused, None, Some(message.as_str())),
        SocketReply::Workspace {
            reply: Reply::Answered(response),
        } => (
            response.status.clone(),
            Some(&*response.layout),
            response.message.as_deref(),
        ),
        SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        } => (
            match unanswered.status {
                Unapplied::Refused => Outcome::Refused,
                Unapplied::Uncertain => Outcome::Uncertain,
            },
            None,
            Some(unanswered.message.as_str()),
        ),
    };
    let intent = intent(&request.action, &Names(layout))?;
    Some(match outcome {
        Outcome::Applied => intent.done,
        Outcome::Refused => refused(&intent, message),
        Outcome::Uncertain => unsettled(&intent),
    })
}

#[cfg(test)]
#[path = "change_sentence_tests.rs"]
mod tests;
