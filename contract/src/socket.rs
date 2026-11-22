use crate::activity::ActivityState;
use crate::context::Focus;
use crate::reply::ReplyEvent;
use crate::{
    CoreTerminalId, FleetId, PlacementId, PlacementOwner, Reply, Request, VesselId, VoyageId,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "command", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SocketRequest {
    Status,
    Overview,
    Focus {
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        spoken: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
    },
    Reply {
        event: ReplyEvent,
    },
    Workspace {
        request: Box<Request>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VesselPlacement {
    pub placement: PlacementId,
    pub voyage: VoyageId,
    pub owner: PlacementOwner,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VesselStatus {
    pub vessel: VesselId,
    pub terminal: CoreTerminalId,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub placements: Vec<VesselPlacement>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PieceOverview {
    pub placement: PlacementId,
    pub name: String,
    pub type_id: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub you: bool,
    pub on_screen: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal: Option<CoreTerminalId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<ActivityState>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FleetOverview {
    pub id: FleetId,
    pub name: String,
    pub on_screen: bool,
    pub pieces: Vec<PieceOverview>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortalsOverview {
    pub visible: bool,
    pub pieces: Vec<PieceOverview>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoyageOverview {
    pub id: VoyageId,
    pub name: String,
    pub selected: bool,
    pub fleets: Vec<FleetOverview>,
    pub portals: PortalsOverview,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Overview {
    pub status: VesselStatus,
    pub voyages: Vec<VoyageOverview>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SocketReply {
    Status { status: VesselStatus },
    Overview { overview: Overview },
    Focus { focus: Focus },
    Noted,
    Workspace { reply: Reply },
    Refused { message: String },
}
