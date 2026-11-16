use crate::{FleetId, PlacementOwner, VoyageId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const LABEL: &str = "voyager.place";

const ID_LIMIT: usize = 128;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(transform = place_schema)]
pub struct Place(pub PlacementOwner);

fn place_schema(schema: &mut schemars::Schema) {
    schema.insert(
        "pattern".into(),
        serde_json::json!("^(fleet|portal):[A-Za-z0-9._-]{1,128}$"),
    );
}

impl TryFrom<String> for Place {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl std::str::FromStr for Place {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let (kind, id) = value
            .split_once(':')
            .ok_or_else(|| format!("{LABEL}={value} is not fleet:<id> or portal:<voyage id>"))?;
        if id.is_empty()
            || id.len() > ID_LIMIT
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        {
            return Err(format!("{LABEL}={value} has an invalid id"));
        }
        match kind {
            "fleet" => Ok(Self(PlacementOwner::Fleet {
                id: FleetId(id.into()),
            })),
            "portal" => Ok(Self(PlacementOwner::Portals {
                voyage: VoyageId(id.into()),
            })),
            _ => Err(format!(
                "{LABEL}={value} is not fleet:<id> or portal:<voyage id>"
            )),
        }
    }
}

impl From<Place> for String {
    fn from(place: Place) -> Self {
        match place.0 {
            PlacementOwner::Fleet { id } => format!("fleet:{}", id.0),
            PlacementOwner::Portals { voyage } => format!("portal:{}", voyage.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_place_names_a_fleet_or_a_voyage_portal_and_nothing_else() {
        assert_eq!(
            "fleet:fleet-4".parse(),
            Ok(Place(PlacementOwner::Fleet {
                id: FleetId("fleet-4".into())
            }))
        );
        assert_eq!(
            "portal:voyage-2".parse(),
            Ok(Place(PlacementOwner::Portals {
                voyage: VoyageId("voyage-2".into())
            }))
        );
        for invalid in [
            "",
            "fleet",
            "fleet:",
            "vessel:content-3",
            "fleet:a b",
            "Fleet:fleet-4",
            &format!("fleet:{}", "x".repeat(129)),
        ] {
            assert!(invalid.parse::<Place>().is_err(), "{invalid}");
        }
        let place: Place = serde_json::from_str("\"portal:voyage-2\"").unwrap();
        assert_eq!(
            serde_json::to_string(&place).unwrap(),
            "\"portal:voyage-2\""
        );
        assert!(serde_json::from_str::<Place>("\"tab:1\"").is_err());
    }
}
