use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Region {
    Sidebar,
    FleetStrip,
    ActiveFleet,
    Portals,
    ContextBar,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Size {
    #[default]
    Fill,
    Content,
    Fixed {
        #[schemars(range(min = 1, max = 4096))]
        #[schemars(transform = integer_schema)]
        pixels: u16,
    },
}

fn integer_schema(schema: &mut schemars::Schema) {
    schema.remove("format");
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Node {
    Row {
        #[serde(default)]
        size: Size,
        children: Vec<Node>,
    },
    Column {
        #[serde(default)]
        size: Size,
        children: Vec<Node>,
    },
    Stack {
        #[serde(default)]
        size: Size,
        #[schemars(transform = integer_schema)]
        selected: u16,
        children: Vec<Node>,
    },
    Block {
        region: Region,
        #[serde(default)]
        size: Size,
    },
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PortalMode {
    #[default]
    Overlay,
    MakeRoom,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Canvas {
    pub root: Node,
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default)]
    pub portal_mode: PortalMode,
}

impl Default for Canvas {
    fn default() -> Self {
        let block = |region, size| Node::Block { region, size };
        Self {
            root: Node::Row {
                size: Size::Fill,
                children: vec![
                    block(Region::Sidebar, Size::Fixed { pixels: 224 }),
                    Node::Column {
                        size: Size::Fill,
                        children: vec![
                            block(Region::FleetStrip, Size::Fixed { pixels: 40 }),
                            Node::Row {
                                size: Size::Fill,
                                children: vec![
                                    block(Region::ActiveFleet, Size::Fill),
                                    block(Region::Portals, Size::Fixed { pixels: 340 }),
                                ],
                            },
                            block(Region::ContextBar, Size::Content),
                        ],
                    },
                ],
            },
            sidebar_collapsed: false,
            portal_mode: PortalMode::Overlay,
        }
    }
}
