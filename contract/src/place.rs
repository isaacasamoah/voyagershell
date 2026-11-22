use crate::{FleetId, PlacementId, PlacementInsertion, PlacementOwner, Side, VoyageId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const LABEL: &str = "voyager.place";

const ID_LIMIT: usize = 128;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(transform = place_schema)]
pub enum Place {
    Fleet {
        id: FleetId,
        beside: Option<(Side, PlacementId)>,
    },
    Portal {
        voyage: VoyageId,
    },
}

impl Place {
    pub fn into_parts(self) -> (PlacementOwner, PlacementInsertion) {
        match self {
            Self::Fleet { id, beside: None } => {
                (PlacementOwner::Fleet { id }, PlacementInsertion::Empty)
            }
            Self::Fleet {
                id,
                beside: Some((side, placement)),
            } => (
                PlacementOwner::Fleet { id },
                PlacementInsertion::Beside {
                    id: placement,
                    side,
                },
            ),
            Self::Portal { voyage } => (
                PlacementOwner::Portals { voyage },
                PlacementInsertion::Empty,
            ),
        }
    }
}

fn place_schema(schema: &mut schemars::Schema) {
    schema.insert(
        "pattern".into(),
        serde_json::json!(
            "^(fleet:[A-Za-z0-9._-]{1,128}(:(left|right|top|bottom):[A-Za-z0-9._-]{1,128})?|portal:[A-Za-z0-9._-]{1,128})$"
        ),
    );
}

impl TryFrom<String> for Place {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

fn id<'a>(value: &str, part: &'a str) -> Result<&'a str, String> {
    if part.is_empty()
        || part.len() > ID_LIMIT
        || !part
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(format!("{LABEL}={value} has an invalid id"));
    }
    Ok(part)
}

fn side(value: &str, part: &str) -> Result<Side, String> {
    match part {
        "left" => Ok(Side::Left),
        "right" => Ok(Side::Right),
        "top" => Ok(Side::Top),
        "bottom" => Ok(Side::Bottom),
        _ => Err(format!(
            "{LABEL}={value} has an invalid side {part}; use left, right, top or bottom"
        )),
    }
}

fn side_name(side: Side) -> &'static str {
    match side {
        Side::Left => "left",
        Side::Right => "right",
        Side::Top => "top",
        Side::Bottom => "bottom",
    }
}

impl std::str::FromStr for Place {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let unknown = || {
            format!(
                "{LABEL}={value} is not fleet:<id>, fleet:<id>:<side>:<placement id> or portal:<voyage id>"
            )
        };
        let parts: Vec<&str> = value.split(':').collect();
        match parts.as_slice() {
            ["fleet", fleet] => Ok(Self::Fleet {
                id: FleetId(id(value, fleet)?.into()),
                beside: None,
            }),
            ["fleet", fleet, edge, placement] => Ok(Self::Fleet {
                id: FleetId(id(value, fleet)?.into()),
                beside: Some((
                    side(value, edge)?,
                    PlacementId(id(value, placement)?.into()),
                )),
            }),
            ["portal", voyage] => Ok(Self::Portal {
                voyage: VoyageId(id(value, voyage)?.into()),
            }),
            ["portal", ..] => Err(format!(
                "{LABEL}={value} places a Portal by portal:<voyage id> only"
            )),
            _ => Err(unknown()),
        }
    }
}

impl From<Place> for String {
    fn from(place: Place) -> Self {
        match place {
            Place::Fleet { id, beside: None } => format!("fleet:{}", id.0),
            Place::Fleet {
                id,
                beside: Some((side, placement)),
            } => format!("fleet:{}:{}:{}", id.0, side_name(side), placement.0),
            Place::Portal { voyage } => format!("portal:{}", voyage.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fleet(id: &str, beside: Option<(Side, &str)>) -> Place {
        Place::Fleet {
            id: FleetId(id.into()),
            beside: beside.map(|(side, placement)| (side, PlacementId(placement.into()))),
        }
    }

    #[test]
    fn a_place_names_a_fleet_a_side_of_one_of_its_placements_or_a_voyage_portal_and_nothing_else() {
        assert_eq!("fleet:fleet-4".parse(), Ok(fleet("fleet-4", None)));
        assert_eq!(
            "portal:voyage-2".parse(),
            Ok(Place::Portal {
                voyage: VoyageId("voyage-2".into())
            })
        );
        for (name, edge) in [
            ("left", Side::Left),
            ("right", Side::Right),
            ("top", Side::Top),
            ("bottom", Side::Bottom),
        ] {
            let text = format!("fleet:fleet-4:{name}:placement-9");
            let place = fleet("fleet-4", Some((edge, "placement-9")));
            assert_eq!(text.parse(), Ok(place.clone()), "{text}");
            assert_eq!(String::from(place), text);
        }
        let widest = format!("fleet:{0}:left:{0}", "x".repeat(128));
        assert!(widest.parse::<Place>().is_ok());
        for invalid in [
            "",
            "fleet",
            "fleet:",
            "vessel:content-3",
            "fleet:a b",
            "Fleet:fleet-4",
            "fleet:fleet-4:",
            "fleet:fleet-4:left",
            "fleet:fleet-4:left:",
            "fleet:fleet-4::placement-9",
            "fleet:fleet-4:up:placement-9",
            "fleet:fleet-4:Left:placement-9",
            "fleet:fleet-4:left:placement 9",
            "fleet:fleet-4:left:placement-9:extra",
            "fleet::left:placement-9",
            "portal:voyage-2:left:placement-9",
            "portal:voyage-2:left",
            "portal:voyage-2:",
            &format!("fleet:{}", "x".repeat(129)),
            &format!("fleet:fleet-4:left:{}", "x".repeat(129)),
        ] {
            assert!(invalid.parse::<Place>().is_err(), "{invalid}");
        }
        assert!(
            "fleet:fleet-4:up:placement-9"
                .parse::<Place>()
                .unwrap_err()
                .contains("left, right, top or bottom")
        );
        let place: Place = serde_json::from_str("\"portal:voyage-2\"").unwrap();
        assert_eq!(
            serde_json::to_string(&place).unwrap(),
            "\"portal:voyage-2\""
        );
        let beside: Place = serde_json::from_str("\"fleet:f:bottom:p\"").unwrap();
        assert_eq!(
            beside.clone().into_parts(),
            (
                PlacementOwner::Fleet {
                    id: FleetId("f".into())
                },
                PlacementInsertion::Beside {
                    id: PlacementId("p".into()),
                    side: Side::Bottom
                }
            )
        );
        assert_eq!(
            serde_json::to_string(&beside).unwrap(),
            "\"fleet:f:bottom:p\""
        );
        assert!(serde_json::from_str::<Place>("\"tab:1\"").is_err());
    }

    #[test]
    fn the_id_charset_has_no_colon_so_a_place_splits_the_one_way() {
        for invalid in [
            "fleet:a:b",
            "fleet:a:b:left:p",
            "fleet:f:left:p:q",
            "fleet:f:left:a:b",
            "fleet:f::left:p",
            "fleet::f:left:p",
            "portal:v:w",
        ] {
            assert!(invalid.parse::<Place>().is_err(), "{invalid}");
        }
        let named_like_a_side = "fleet:left:left:left".parse::<Place>().unwrap();
        assert_eq!(named_like_a_side, fleet("left", Some((Side::Left, "left"))));
        assert_eq!(String::from(named_like_a_side), "fleet:left:left:left");
    }
}
