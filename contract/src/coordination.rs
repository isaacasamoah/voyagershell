use crate::{ContentId, FleetId, PlacementId, VoyageId, rank::Rank};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize, JsonSchema)]
#[serde(transparent)]
#[schemars(inline)]
pub struct RunId(pub String);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Agent {
    pub id: RunId,
    pub content: ContentId,
    pub placement: PlacementId,
    pub name: String,
    pub rank: Rank,
    pub voyage: VoyageId,
    pub fleet: Option<FleetId>,
    pub supervisor: Option<RunId>,
    pub live: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Participant {
    User,
    Agent { id: RunId },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Decision {
    Approve,
    Deny,
    Reply { text: String },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Payload {
    Conversation {
        text: String,
    },
    Instruction {
        task: String,
        target: RunId,
    },
    Start {
        fleet: FleetId,
        rank: Rank,
        name: String,
        task: String,
    },
    Escalation {
        title: String,
        context: String,
        decision: String,
        #[serde(rename = "blastRadius")]
        blast_radius: String,
    },
    Decision {
        #[serde(rename = "inReplyTo")]
        in_reply_to: String,
        decision: Decision,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Message {
    pub id: String,
    pub from: Participant,
    pub sender_name: String,
    pub to: Participant,
    pub payload: Payload,
    pub acknowledged: bool,
    pub resolved: bool,
    pub via: Vec<RunId>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Operation {
    Inspect,
    Wait {
        #[schemars(range(min = 0, max = 4294967295u64), transform = counter_schema)]
        after: u32,
    },
    InspectRequest {
        id: String,
    },
    Forward {
        id: String,
    },
    Send {
        to: Participant,
        text: String,
    },
    Acknowledge {
        id: String,
    },
    Instruct {
        target: RunId,
        task: String,
    },
    Start {
        fleet: FleetId,
        rank: Rank,
        name: String,
        task: String,
    },
    Assign {
        agent: RunId,
        supervisor: Option<RunId>,
    },
    Escalate {
        title: String,
        context: String,
        decision: String,
        #[serde(rename = "blastRadius")]
        blast_radius: String,
    },
    Resolve {
        id: String,
        decision: Decision,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub request_id: String,
    pub action: Operation,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    #[schemars(range(min = 0, max = 4294967295u64), transform = counter_schema)]
    pub revision: u32,
    pub current: Participant,
    pub agents: Vec<Agent>,
    pub messages: Vec<Message>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Outcome {
    Applied,
    Refused,
    Partial,
    Uncertain,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Response {
    pub request_id: String,
    pub outcome: Outcome,
    pub message: Option<String>,
    pub snapshot: Option<Snapshot>,
    pub created: Option<ContentId>,
}

fn counter_schema(schema: &mut schemars::Schema) {
    schema.ensure_object().remove("format");
}
