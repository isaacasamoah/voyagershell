use super::layout::born;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Terminal, vessels};
use anyhow::{Context as _, Result};
use std::fs;
use voyager_contract::{RenameTarget, VesselId};

cases! {
    Listed => "the-declared-type-is-listed-in-the-picker" setup,
    Opens => "the-declared-type-opens-and-shows-its-state" setup,
    Acts => "a-declared-action-changes-the-shown-state" setup,
    LastGood => "a-broken-manifest-keeps-the-last-good-type-listed",
}

pub const CONTROL: Case = Case::LastGood;

pub(super) const TYPE: &str = "flag";
const MANIFEST: &str = "vessels/flag/manifest.json";

fn open_picker(native: &Native, terminal: &Terminal) -> Result<()> {
    native.hover(&Target::name(&RenameTarget::Vessel {
        id: terminal.placement().clone(),
    }))?;
    native.click(&Target::split_right(terminal.placement()))
}

fn opened(native: &Native, before: &voyager_contract::Layout) -> Result<VesselId> {
    native.observe("the declared Vessel's state drawn", |seen| {
        let made = born(vessels(before), vessels(seen.document), |vessel| &vessel.id);
        let placement = made.first()?;
        let id = seen
            .document
            .vessels
            .iter()
            .find(|vessel| vessel.id == placement.vessel && vessel.type_id == TYPE)?
            .id
            .clone();
        seen.shows(&Target::manifest_state(&id)).then_some(id)
    })
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    let (_, before) = native
        .document()?
        .context("The layout document is missing")?;
    cases.check(native, Case::Listed, |native| {
        open_picker(native, &terminal)?;
        let listed = native.observe("the declared type in the picker", |seen| {
            seen.shows(&Target::create_manifest(TYPE)).then_some(())
        });
        Ok(Verdict::new().expect(
            "the picker lists the type that only a manifest declares",
            listed.is_ok(),
        ))
    })?;
    let vessel = cases.make(native, Case::Opens, |native| {
        native.click(&Target::create_manifest(TYPE))?;
        let id = opened(native, &before)?;
        let shown = native.observe("the declared Vessel's initial state", |seen| {
            seen.label(&Target::manifest_state(&id))
                .filter(|label| label.contains("\"raised\":false"))
                .map(str::to_owned)
        })?;
        Ok((
            Verdict::new()
                .expect(
                    "the Vessel opens at revision 0 with the declared initial state",
                    shown.contains("revision 0"),
                )
                .observed("state label", shown)?,
            Some(id),
        ))
    })?;
    let Some(vessel) = vessel else { return Ok(()) };
    cases.check(native, Case::Acts, |native| {
        native.click(&Target::manifest_action(&vessel, "flip"))?;
        let shown = native.observe("the state after the declared action", |seen| {
            seen.label(&Target::manifest_state(&vessel))
                .filter(|label| label.contains("\"raised\":true"))
                .map(str::to_owned)
        })?;
        Verdict::new()
            .expect(
                "the shown revision advanced to 1",
                shown.contains("revision 1"),
            )
            .observed("state label", shown)
    })?;
    cases.check(native, Case::LastGood, |native| {
        fs::write(native.profile_path(MANIFEST), "{\"contract\": 1}")?;
        open_picker(native, &terminal)?;
        let listed = native.observe("the last good type still in the picker", |seen| {
            seen.shows(&Target::create_manifest(TYPE)).then_some(())
        });
        Ok(Verdict::new().expect(
            "the type of the last good manifest stays listed after a broken edit",
            listed.is_ok(),
        ))
    })
}
