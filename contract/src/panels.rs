use crate::{ContentId, FleetId, PlacementId, Side, Split, Vessel, VoyageId, canvas::PortalMode};
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PanelOwner {
    Fleet { id: FleetId },
    Portals { voyage: VoyageId },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PanelInsertion {
    Empty,
    Beside { id: PlacementId, side: Side },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortalLayout {
    pub root: Option<Split>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximized_placement: Option<PlacementId>,
    pub visible: bool,
    pub mode: PortalMode,
    #[schemars(range(min = 1, max = 4096), transform = width_schema)]
    pub width: u16,
}

impl Default for PortalLayout {
    fn default() -> Self {
        Self {
            root: None,
            maximized_placement: None,
            visible: false,
            mode: PortalMode::Overlay,
            width: 340,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedLayout {
    pub owner: PanelOwner,
    pub name: String,
    pub root: Option<Split>,
}

impl<'de> Deserialize<'de> for SavedLayout {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged, deny_unknown_fields)]
        enum Stored {
            Current {
                owner: PanelOwner,
                name: String,
                root: Option<Split>,
            },
            Fleet {
                fleet: FleetId,
                name: String,
                root: Option<Split>,
            },
        }
        Ok(match Stored::deserialize(deserializer)? {
            Stored::Current { owner, name, root } => Self { owner, name, root },
            Stored::Fleet { fleet, name, root } => Self {
                owner: PanelOwner::Fleet { id: fleet },
                name,
                root,
            },
        })
    }
}

impl<'de> Deserialize<'de> for Vessel {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Stored {
            id: PlacementId,
            content: ContentId,
            #[serde(default)]
            name: Option<String>,
            #[serde(default)]
            hidden: bool,
        }
        let stored = Stored::deserialize(deserializer)?;
        Ok(Self {
            id: stored.id,
            content: stored.content,
            name: stored.name.unwrap_or_default(),
            hidden: stored.hidden,
        })
    }
}

pub(crate) fn width_schema(schema: &mut schemars::Schema) {
    schema.remove("format");
}
