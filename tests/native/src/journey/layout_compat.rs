use super::workspace::{Finish, Open, rename};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::Native;
use anyhow::Result;
use serde_json::{Value, json};
use voyager_contract::RenameTarget;
use voyager_contract::layout_document::DOCUMENT;

cases! {
    NewerLayoutOpens => "newer-layout-opens",
    RenameKeepsAddedFields => "rename-keeps-added-fields",
}

pub const CONTROL: Case = Case::RenameKeepsAddedFields;

const RENAMED: &str = "Renamed after opening";
const ADDED: [&str; 5] = [
    "/canvas/density",
    "/voyages/0/fleets/0/pinned",
    "/vessels/0/badge",
    "/bookmarks",
    "/vessels/1/packageVersion",
];

fn fleet_name(document: &Value) -> Option<&str> {
    document.pointer("/voyages/0/fleets/0/name")?.as_str()
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let seeded = native.seeded_document(DOCUMENT)?.clone();
    let voyage = RenameTarget::Voyage {
        id: voyager_contract::VoyageId("voyage-1".into()),
    };
    let fleet = RenameTarget::Fleet {
        id: voyager_contract::FleetId("fleet-1".into()),
    };
    cases.check(native, Case::NewerLayoutOpens, |native| {
        native.observe("the seeded Voyage and Fleet names drawn", |seen| {
            (seen.shows(&Target::name(&voyage)) && seen.shows(&Target::name(&fleet))).then_some(())
        })?;
        let opened = native.document()?.is_some_and(|(_, layout)| {
            layout
                .voyages
                .first()
                .is_some_and(|voyage| voyage.name == "Written by main")
        });
        Ok(Verdict::new().expect(
            "the app draws the Voyage and Fleet of a layout a newer build wrote",
            opened,
        ))
    })?;
    cases.check(native, Case::RenameKeepsAddedFields, |native| {
        rename(native, &fleet, Open::DoubleClick, RENAMED, Finish::Enter)?;
        let saved = native.watch(|native| {
            Ok(native
                .core_document(DOCUMENT)?
                .filter(|(_, value)| fleet_name(value) == Some(RENAMED)))
        })?;
        let value = saved.as_ref().map(|(_, value)| value);
        let held: Vec<bool> = ADDED
            .iter()
            .map(|path| {
                value.is_some_and(|value| value.pointer(path) == seeded.1.pointer(path))
                    && seeded.1.pointer(path).is_some()
            })
            .collect();
        Verdict::new()
            .expect("the Fleet rename reached Core's layout document", saved.is_some())
            .expect(
                "every field the newer build added is still in Core's layout document after the rename",
                !held.is_empty() && held.iter().all(|held| *held),
            )
            .observed("added fields kept", json!(ADDED.iter().zip(&held).collect::<Vec<_>>()))
    })
}

#[cfg(test)]
mod tests {
    use serde_json::Value;
    use voyager_contract::layout_document::{Reading, read};

    fn fixture(text: &str) -> Value {
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn the_fixtures_are_the_layouts_their_names_claim() {
        let written = fixture(include_str!(
            "../../fixtures/layout-compat/main-written.json"
        ));
        let Reading::Open { kept, .. } = read(written) else {
            panic!("a layout the current build wrote must open")
        };
        assert!(kept.is_empty());
        let added = fixture(include_str!(
            "../../fixtures/layout-compat/newer-additions.json"
        ));
        let Reading::Open { kept, .. } = read(added) else {
            panic!("a layout with added fields must open")
        };
        assert_eq!(kept.fields(), 5);
        let stamped = fixture(include_str!(
            "../../fixtures/layout-compat/newer-min-reader.json"
        ));
        assert!(matches!(read(stamped), Reading::Newer { min_reader: 2 }));
        let corrupt = fixture(include_str!("../../fixtures/layout-compat/corrupt.json"));
        assert!(matches!(read(corrupt), Reading::Unreadable { .. }));
    }
}
