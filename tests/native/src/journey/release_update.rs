use super::daily_start::{climbed, count, holds, runs, selected};
use super::layout::{avatar_bounds, avatar_on_dock, born, overlaps};
use super::{Cases, Verdict, cases};
use crate::inspection::{Target, region};
use crate::native::{Build, Native, PAST_FIRST_CHECK, Seen, Site, Terminal, hold, vessels};
use crate::x11::Geometry;
use anyhow::Context as _;
use anyhow::Result;
use serde::Serialize;
use serde_json::json;
use voyager_contract::inspection::Rect;
use voyager_contract::{Context, PlacementId, RenameTarget};

cases! {
    OffersRestart => "offers-restart" setup,
    CardClear => "card-clears-the-avatar",
    BadChecksum => "bad-checksum-changes-nothing",
    FailedDownload => "failed-download-changes-nothing",
    Restart => "restart-runs-the-newer-build",
    SourceBuild => "source-build-stages-nothing";
    "source-build-stages-nothing" needs "restart-runs-the-newer-build",
}

pub const CONTROL: Case = Case::Restart;

const RESTART_WORDS: &str = "Restart now, or the new version starts the next time you open VoyagerShell. Your programs keep running.";
const NARROW: (u16, u16) = (900, 700);
const NO_ROOM: (u16, u16) = (600, 600);
const CARD_BACKGROUND: [u8; 3] = [0x1b, 0x28, 0x38];
const CARD_TEXT: [u8; 3] = [0xd6, 0xe8, 0xff];
const CARD_COLOUR_REACH: u8 = 8;
const CARD_ON_TOP: f32 = 0.9;
const FEWEST_SAMPLED: usize = 100;
const AVATAR_INSET: f32 = 0.3;
const DEFAULT_LATEST: &str =
    "https://github.com/isaacasamoah/voyagershell/releases/latest/download/latest.json";

#[derive(PartialEq, Serialize)]
struct Placed {
    window: (f32, f32),
    card: Rect,
    avatar: Rect,
    buttons: bool,
}

impl Placed {
    fn of(seen: &Seen) -> Option<Self> {
        Some(Self {
            window: (seen.frame.window.width, seen.frame.window.height),
            card: Target::RESTART_OFFER.find(seen.frame)?.bounds,
            avatar: avatar_bounds(seen)?,
            buttons: seen.shows(&Target::RESTART_NOW) && seen.shows(&Target::RESTART_LATER),
        })
    }

    fn clear(&self) -> bool {
        self.buttons && !overlaps(&self.card, &self.avatar)
    }

    fn top_right(&self) -> bool {
        self.buttons
            && (self.card.x + self.card.width - (self.window.0 - 12.)).abs() < 1.
            && (self.card.y - 8.).abs() < 1.
    }
}

#[derive(Serialize)]
struct Drawn {
    region: Geometry,
    sampled: usize,
    card: usize,
}

impl Drawn {
    fn card_on_top(&self) -> bool {
        self.sampled >= FEWEST_SAMPLED && self.card as f32 >= CARD_ON_TOP * self.sampled as f32
    }
}

fn avatar_middle_under_card(seen: &Seen) -> Option<Geometry> {
    let card = Target::RESTART_OFFER.find(seen.frame)?.bounds;
    let avatar = avatar_bounds(seen)?;
    let inset = avatar.width.min(avatar.height) * AVATAR_INSET;
    let left = (avatar.x + inset).max(card.x);
    let top = (avatar.y + inset).max(card.y);
    let right = (avatar.x + avatar.width - inset).min(card.x + card.width);
    let bottom = (avatar.y + avatar.height - inset).min(card.y + card.height);
    (left < right && top < bottom).then(|| {
        region(
            seen.frame,
            &Rect {
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
            },
        )
    })
}

fn card_colour(colour: [u8; 3]) -> bool {
    (0..3).all(|channel| {
        let (background, text) = (CARD_BACKGROUND[channel], CARD_TEXT[channel]);
        let low = background.min(text).saturating_sub(CARD_COLOUR_REACH);
        let high = background.max(text).saturating_add(CARD_COLOUR_REACH);
        (low..=high).contains(&colour[channel])
    })
}

fn drawn_in(native: &Native, at: Geometry) -> Result<Drawn> {
    let pixels = native.look_at(at)?;
    let colours = pixels
        .rows()
        .flat_map(|row| row.as_chunks::<4>().0)
        .map(|pixel| [pixel[2], pixel[1], pixel[0]]);
    let (sampled, card) = colours.fold((0, 0), |(sampled, card), colour| {
        (sampled + 1, card + usize::from(card_colour(colour)))
    });
    Ok(Drawn {
        region: at,
        sampled,
        card,
    })
}

fn placed(native: &Native, at: &str) -> Result<Placed> {
    native.observe(&format!("the Restart card and the avatar {at}"), Placed::of)
}

fn docked(native: &Native, onto: Target, scope: &Context, at: &str) -> Result<Placed> {
    native.drag(&Target::AVATAR, &onto)?;
    native.settle(
        &format!("the avatar docked and the Restart card drawn {at}"),
        |seen| {
            let docked = &seen.document.context == scope
                && &seen.frame.dock == scope
                && (!matches!(scope, Context::Vessel { .. }) || avatar_on_dock(seen));
            docked.then(|| Placed::of(seen)).flatten()
        },
        |_| true,
    )
}

fn card_under_avatar(seen: &Seen) -> Option<Rect> {
    let card = Target::RESTART_OFFER.find(seen.frame)?.bounds;
    overlaps(&card, &avatar_bounds(seen)?).then_some(card)
}

fn park(native: &Native, docked: &PlacementId) -> Result<Placed> {
    let (_, layout) = native
        .document()?
        .context("The layout document is missing")?;
    let voyage = layout
        .selected_voyage
        .clone()
        .context("The layout has no selected Voyage")?;
    let shown = layout.selected_fleet.clone();
    native.click(&Target::create_fleet(&voyage))?;
    native.click(&Target::worker("terminal"))?;
    native.settle(
        "another Fleet shown with the avatar parked small",
        |seen| {
            let away = seen.document.selected_fleet.is_some()
                && seen.document.selected_fleet != shown
                && !seen.shows(&Target::terminal(docked));
            away.then(|| Placed::of(seen)).flatten()
        },
        |placed| placed.avatar.width < 60.,
    )
}

fn split(native: &Native, from: &PlacementId, side: Target) -> Result<PlacementId> {
    let (_, before) = native
        .document()?
        .context("The layout document is missing")?;
    native.hover(&Target::name(&RenameTarget::Vessel { id: from.clone() }))?;
    native.click(&side)?;
    native.click(&Target::worker("terminal"))?;
    native.observe("a new Vessel's terminal drawn", |seen| {
        let made = born(vessels(&before), vessels(seen.document), |vessel| {
            &vessel.id
        });
        let id = made.first()?.id.clone();
        seen.shows(&Target::terminal(&id)).then_some(id)
    })
}

fn refused_update(
    native: &mut Native,
    terminal: &Terminal,
    served: Site,
    reason: &str,
    said: &'static str,
) -> Result<Verdict> {
    let counted = count(terminal, native)?;
    let links = native.install_links()?;
    let folders = native.install_folders()?;
    let viewer = native.candidate()?.clone();
    let program = terminal.program(native)?;
    let manifest = native.install_publish(served)?;
    let update = native.install_network_update()?;
    let links_after = native.install_links()?;
    let folders_after = native.install_folders()?;
    let same_app = native.candidate().ok() == Some(&viewer) && native.verify().is_ok();
    let program_after = terminal.program(native)?;
    let climbing = climbed(terminal, native, counted)?;
    native.install_publish(Site::Second)?;
    Verdict::new()
        .expect(
            said,
            update.code == Some(1) && update.stderr.contains(reason),
        )
        .expect(
            "current, previous and next are as they were",
            links_after == links,
        )
        .expect(
            "the builds folder holds the same builds and no .part folder",
            folders_after == folders,
        )
        .expect("the running app is the same process", same_app)
        .expect(
            "the first Vessel's terminal runs the same live program, with the same pid",
            program_after.same
                && program_after.pid == program.pid
                && program_after.state.as_deref() == Some("live"),
        )
        .expect(
            "the counter in the first Vessel kept climbing",
            climbing.is_some(),
        )
        .observed("manifest", &manifest)?
        .observed("update", &update)?
        .observed("links", json!({"before":links,"after":links_after}))?
        .observed("folders", json!({"before":folders,"after":folders_after}))?
        .observed("program", json!({"before":program,"after":program_after}))?
        .observed("counter", json!({"before":counted,"after":climbing}))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = native.install_sha256(Build::First)?;
    let second = native.install_sha256(Build::Second)?;
    let versions = native.install_versions()?;
    let terminal = cases.make(native, Case::OffersRestart, |native| {
        let terminal = Terminal::first(native)?;
        let program = terminal.program(native)?;
        let staged = native.install_staged(&versions.second)?;
        let ready = format!("VoyagerShell {} is ready.", versions.second);
        let offer = native
            .observe("the Restart card", |seen| {
                seen.label(&Target::RESTART_OFFER).map(str::to_owned)
            })
            .ok();
        let buttons = native
            .observe("the Restart and Later buttons", |seen| {
                (seen.shows(&Target::RESTART_NOW) && seen.shows(&Target::RESTART_LATER))
                    .then_some(())
            })
            .is_ok();
        let folders = native.install_folders()?;
        let program_after = terminal.program(native)?;
        let counting = climbed(&terminal, native, Some(0))?;
        let verdict = Verdict::new()
            .expect(
                "the release build staged the newer build as next and left current on itself",
                staged.as_ref().is_some_and(|links| {
                    holds(&links.next, &second)
                        && holds(&links.current, &first)
                        && links.previous.is_none()
                }),
            )
            .expect(
                "the builds folder holds the two builds and no .part folder",
                folders == [versions.first.clone(), versions.second.clone()],
            )
            .expect(
                "the card names the newer version and says programs keep running",
                offer
                    .as_deref()
                    .is_some_and(|text| text.contains(&ready) && text.contains(RESTART_WORDS)),
            )
            .expect("the card offers Restart and Later", buttons)
            .expect(
                "the first Vessel's terminal runs the same live program, with the same pid",
                program_after.same
                    && program_after.pid == program.pid
                    && program_after.state.as_deref() == Some("live"),
            )
            .expect(
                "the counter that the first Vessel's shell starts is printing",
                counting.is_some(),
            )
            .observed("versions", &versions)?
            .observed("links", &staged)?
            .observed("folders", &folders)?
            .observed("offer", &offer)?
            .observed("program", json!({"before":program,"after":program_after}))?;
        Ok((verdict, Some(terminal)))
    })?;
    let Some(terminal) = terminal else {
        return Ok(());
    };
    cases.check(native, Case::CardClear, |native| {
        let native: &Native = native;
        let size = native.window_size()?;
        let home = placed(native, "with the avatar at home")?;
        native.keep_window("card-home")?;
        let below = split(native, terminal.placement(), Target::split_bottom(terminal.placement()))?;
        let corner = split(native, &below, Target::split_right(&below))?;
        let vessel = Target::name(&RenameTarget::Vessel { id: corner.clone() });
        let on_vessel = Context::Vessel { id: corner.clone() };
        let docked_wide = docked(native, vessel.clone(), &on_vessel, "on the bottom-right Vessel")?;
        native.keep_window("card-docked")?;
        let mut held = native.hold(&Target::AVATAR)?;
        held.toward(native.point_in(&Target::RESTART_OFFER, 0.5, 0.5)?)?;
        let during = held
            .until("the held avatar drawn over the Restart card", card_under_avatar)
            .and_then(|_| {
                held.until(
                    "the Restart card still under the held avatar",
                    card_under_avatar,
                )
            });
        held.toward(native.point_in(&Target::terminal(&corner), 0.5, 0.5)?)?;
        held.release()?;
        let after_drag = native.settle(
            "the avatar docked again on the bottom-right Vessel",
            |seen| {
                (seen.document.context == on_vessel && avatar_on_dock(seen))
                    .then(|| Placed::of(seen))
                    .flatten()
            },
            |_| true,
        )?;
        native.resize_window(NARROW.0, NARROW.1)?;
        let docked_narrow = placed(native, "on the bottom-right Vessel at 900x700")?;
        native.keep_window("card-docked-narrow")?;
        let parked = park(native, &corner)?;
        native.keep_window("card-parked-narrow")?;
        native.click(&Target::AVATAR)?;
        native.settle(
            "the bottom-right Vessel shown again with the avatar docked on it",
            |seen| {
                (seen.document.context == on_vessel
                    && seen.frame.dock == on_vessel
                    && seen.shows(&Target::terminal(&corner)))
                .then(|| Placed::of(seen))
                .flatten()
            },
            |placed| placed.avatar.width > 60.,
        )?;
        let home_narrow = docked(
            native,
            Target::WORKSPACE_DOCK,
            &Context::Workspace,
            "at home at 900x700",
        )?;
        native.keep_window("card-home-narrow")?;
        native.resize_window(NO_ROOM.0, NO_ROOM.1)?;
        let (no_room, under) =
            native.observe("the Restart card and the avatar at home at 600x600", |seen| {
                Some((Placed::of(seen)?, avatar_middle_under_card(seen)))
            })?;
        native.keep_window("card-no-room")?;
        let drawn = under.map(|at| drawn_in(native, at)).transpose()?;
        native.resize_window(size.0, size.1)?;
        let restored = placed(native, "at home at the starting size")?;
        Verdict::new()
            .expect(
                "at the starting size the card clears the avatar at home and draws Restart and Later",
                home.clear(),
            )
            .expect(
                "at the starting size the card clears the avatar docked on the bottom-right Vessel",
                docked_wide.clear(),
            )
            .expect(
                "while the avatar is dragged over the card, the card holds still",
                during.as_ref().ok() == Some(&docked_wide.card),
            )
            .expect(
                "after the drag the avatar docks again and the card clears it",
                after_drag.clear(),
            )
            .expect(
                "at 900x700 the card clears the avatar docked on the bottom-right Vessel and draws Restart and Later",
                docked_narrow.clear(),
            )
            .expect(
                "at 900x700, with the docked Vessel's Fleet not shown, the card clears the avatar parked in the status row and draws Restart and Later",
                parked.clear(),
            )
            .expect(
                "at 900x700 the card clears the avatar at home and draws Restart and Later",
                home_narrow.clear(),
            )
            .expect(
                "at 600x600 there is no room beside or above the avatar, so the card takes the top-right corner and draws Restart and Later",
                no_room.top_right(),
            )
            .expect(
                "at 600x600 the card is drawn over the middle of the avatar, so its words can be read",
                drawn.as_ref().is_some_and(Drawn::card_on_top),
            )
            .expect(
                "back at the starting size the card is where it was",
                restored.card == home.card,
            )
            .observed("home", &home)?
            .observed("docked", &docked_wide)?
            .observed("held", during.as_ref().ok())?
            .observed("after drag", &after_drag)?
            .observed("docked at 900x700", &docked_narrow)?
            .observed("parked at 900x700", &parked)?
            .observed("home at 900x700", &home_narrow)?
            .observed("no room at 600x600", &no_room)?
            .observed("drawn over the avatar at 600x600", &drawn)?
            .observed("restored", &restored)?
            .observed("window", json!({"starting":size,"narrow":NARROW,"no room":NO_ROOM}))
    })?;
    cases.check(native, Case::BadChecksum, |native| {
        refused_update(
            native,
            &terminal,
            Site::Damaged,
            "The download is damaged",
            "voyager update exited 1 and said the download is damaged",
        )
    })?;
    cases.check(native, Case::FailedDownload, |native| {
        refused_update(
            native,
            &terminal,
            Site::Missing,
            "The download of",
            "voyager update exited 1 and said the download failed",
        )
    })?;
    cases.check(native, Case::Restart, |native| {
        let counted = count(&terminal, native)?;
        let voyage = selected(native)?;
        let roster = native.live_terminals()?;
        let program = terminal.program(native)?;
        let ran = native.install_restart()?;
        let links = native.install_links()?;
        let running = runs(native, &second);
        let voyage_after = selected(native)?;
        let program_after = terminal.program(native)?;
        let roster_after = native.live_terminals()?;
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the restart",
                climbing.is_some(),
            )
            .expect(
                "Restart ran voyager start once, which exited 0 and launched the newer build and nothing else",
                ran.code == Some(0) && ran.launched_only(&second) && ran.strays.is_empty(),
            )
            .expect(
                "current names the newer build, previous the first, and next is gone",
                holds(&links.current, &second)
                    && holds(&links.previous, &first)
                    && links.next.is_none(),
            )
            .expect("the running app is the newer build", running)
            .expect(
                "the newer build has the same Voyage selected",
                voyage.is_some() && voyage == voyage_after,
            )
            .expect(
                "the first Vessel's terminal runs the same live program, with the same pid",
                program_after.same
                    && program_after.pid == program.pid
                    && program_after.state.as_deref() == Some("live"),
            )
            .expect("Core lists the same live terminals", roster_after == roster)
            .observed("counter", json!({"before":counted,"after":climbing}))?
            .observed("restart", &ran)?
            .observed("links", &links)?
            .observed("voyage", json!({"before":voyage,"after":voyage_after}))?
            .observed("program", json!({"before":program,"after":program_after}))?
            .observed("roster", json!({"before":roster,"after":roster_after}))
    })?;
    cases.check(native, Case::SourceBuild, |native| {
        let manifest = native.install_publish(Site::Ahead)?;
        let interfaces = native.install_interfaces()?;
        let earlier = native.install_requests()?.len();
        let links = native.install_links()?;
        let folders = native.install_folders()?;
        let update = native.install_network_update()?;
        native.close()?;
        native.install_launch(&versions.second)?;
        hold(PAST_FIRST_CHECK)?;
        let offered = native.observe("the source build past the first check", |seen| {
            Some(seen.shows(&Target::RESTART_OFFER))
        })?;
        let requests: Vec<String> = native
            .install_requests()?
            .into_iter()
            .skip(earlier)
            .collect();
        let links_after = native.install_links()?;
        let folders_after = native.install_folders()?;
        Verdict::new()
            .expect(
                "the sandbox has no network but loopback, so no build reaches the real releases address",
                interfaces == ["lo"],
            )
            .expect(
                "the stand-in release site received no request from the source build",
                requests.is_empty(),
            )
            .expect(
                "voyager update from the source build exited 1 and read the default releases address, not the stand-in",
                update.code == Some(1) && update.stderr.contains(DEFAULT_LATEST),
            )
            .expect(
                "the source build staged nothing while a newer release was published",
                links_after == links && links_after.next.is_none(),
            )
            .expect(
                "the builds folder gained no build and no .part folder",
                folders_after == folders,
            )
            .expect(
                "the source build, relaunched past its first check, shows no Restart card",
                !offered,
            )
            .expect("the source build is running", runs(native, &second))
            .observed("manifest", &manifest)?
            .observed("interfaces", &interfaces)?
            .observed("requests", &requests)?
            .observed("update", &update)?
            .observed("waited", PAST_FIRST_CHECK.within().as_secs())?
            .observed("links", json!({"before":links,"after":links_after}))?
            .observed("folders", json!({"before":folders,"after":folders_after}))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARTWORK_INSET: f32 = 0.14;
    const ARTWORK_SIDE: f32 = 0.72;

    #[test]
    fn the_card_colours_match_its_words_and_not_the_middle_of_the_avatar() {
        let blend = |along: f32| {
            std::array::from_fn(|channel| {
                let from = f32::from(CARD_BACKGROUND[channel]);
                (from + along * (f32::from(CARD_TEXT[channel]) - from)).round() as u8
            })
        };
        assert!(
            [0., 0.3, 0.7, 1.]
                .into_iter()
                .all(|along| card_colour(blend(along)))
        );
        assert!(card_colour([
            CARD_TEXT[0],
            CARD_BACKGROUND[1],
            CARD_TEXT[2]
        ]));
        assert!(!card_colour([0, 0, 0]) && !card_colour([255, 255, 255]));
        let artwork = crate::native::artwork().unwrap();
        let side = artwork.width() as f32;
        let edge = |at: f32| ((at - ARTWORK_INSET) / ARTWORK_SIDE * side) as u32;
        let (first, last) = (edge(AVATAR_INSET), edge(1. - AVATAR_INSET));
        let middle: Vec<_> = (first..last)
            .flat_map(|y| (first..last).map(move |x| (x, y)))
            .map(|(x, y)| artwork.get_pixel(x, y).0)
            .collect();
        let card_through = middle
            .iter()
            .filter(|[red, green, blue, alpha]| *alpha < 255 || card_colour([*red, *green, *blue]))
            .count();
        assert!((card_through as f32) < CARD_ON_TOP * middle.len() as f32);
    }
}
