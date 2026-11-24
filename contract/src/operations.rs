use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Ty {
    Text,
    Decimal,
    Bool,
    Void,
    Palette,
    Nullable(&'static Ty),
    Record(&'static [Field]),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Field {
    pub name: &'static str,
    pub ty: Ty,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameter {
    pub name: &'static str,
    pub ty: Ty,
    pub max_bytes: Option<usize>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Shape {
    Sync {
        parameters: &'static [Parameter],
        returns: Ty,
    },
    Async {
        parameters: &'static [Parameter],
        returns: Ty,
    },
    Component {
        props: &'static [Field],
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Entry {
    pub name: &'static str,
    pub shape: Shape,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Module {
    pub name: &'static str,
    pub entries: &'static [Entry],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Supplied<'a> {
    Null,
    Bool(bool),
    Text(&'a str),
    Other(&'static str),
}

const PALETTE_FIELDS: &str = "{\n    background: import(\"gpui-kit\").Color;\n    foreground: import(\"gpui-kit\").Color;\n    muted: import(\"gpui-kit\").Color;\n    accent: import(\"gpui-kit\").Color;\n}";

impl Ty {
    pub fn declaration(&self) -> String {
        match self {
            Self::Text | Self::Decimal => "string".into(),
            Self::Bool => "boolean".into(),
            Self::Void => "void".into(),
            Self::Palette => PALETTE_FIELDS.into(),
            Self::Nullable(inner) => format!("{} | null", inner.declaration()),
            Self::Record(fields) => record(fields),
        }
    }

    fn accepts(&self, value: &Supplied, max_bytes: Option<usize>) -> Result<(), String> {
        match (self, value) {
            (Self::Nullable(_), Supplied::Null) => Ok(()),
            (Self::Nullable(inner), value) => inner.accepts(value, max_bytes),
            (Self::Bool, Supplied::Bool(_)) => Ok(()),
            (Self::Text, Supplied::Text(text)) => match max_bytes {
                Some(limit) if text.len() > limit => Err(format!("exceeds {limit} bytes")),
                _ => Ok(()),
            },
            (Self::Decimal, Supplied::Text(text)) => match text.parse::<u64>() {
                Ok(number) if number.to_string() == *text => Ok(()),
                _ => Err("must be a canonical decimal revision".into()),
            },
            (expected, Supplied::Other(found)) => {
                Err(format!("must be {}, not {found}", expected.declaration()))
            }
            (expected, _) => Err(format!("must be {}", expected.declaration())),
        }
    }
}

fn record(fields: &[Field]) -> String {
    if fields.is_empty() {
        return "Record<string, never>".into();
    }
    let body: Vec<String> = fields
        .iter()
        .map(|field| format!("{}: {}", field.name, field.ty.declaration()))
        .collect();
    format!("{{ {} }}", body.join("; "))
}

impl Entry {
    pub fn declaration(&self) -> String {
        match self.shape {
            Shape::Sync {
                parameters,
                returns,
            } => format!(
                "export function {}({}): {};",
                self.name,
                parameter_list(parameters),
                returns.declaration()
            ),
            Shape::Async {
                parameters,
                returns,
            } => format!(
                "export function {}({}): Promise<{}>;",
                self.name,
                parameter_list(parameters),
                returns.declaration()
            ),
            Shape::Component { props } => format!(
                "export const {}: {{ new: (id: string, props: {}) => import(\"gpui-kit\").NativeElement }};",
                self.name,
                record(props)
            ),
        }
    }

    pub fn is_async(&self) -> bool {
        matches!(self.shape, Shape::Async { .. })
    }

    pub fn is_component(&self) -> bool {
        matches!(self.shape, Shape::Component { .. })
    }

    pub fn check(&self, supplied: &[Supplied]) -> Result<(), String> {
        let (Shape::Sync { parameters, .. } | Shape::Async { parameters, .. }) = self.shape else {
            return Ok(());
        };
        if supplied.len() != parameters.len() {
            let noun = if parameters.len() == 1 {
                "argument"
            } else {
                "arguments"
            };
            return Err(format!(
                "{} expects {} {noun}, got {}",
                self.name,
                parameters.len(),
                supplied.len()
            ));
        }
        for (parameter, value) in parameters.iter().zip(supplied) {
            parameter
                .ty
                .accepts(value, parameter.max_bytes)
                .map_err(|reason| format!("{} argument {} {reason}", self.name, parameter.name))?;
        }
        Ok(())
    }
}

fn parameter_list(parameters: &[Parameter]) -> String {
    parameters
        .iter()
        .map(|parameter| format!("{}: {}", parameter.name, parameter.ty.declaration()))
        .collect::<Vec<_>>()
        .join(", ")
}

impl Module {
    pub fn declarations(&self) -> String {
        let lines: Vec<String> = self.entries.iter().map(Entry::declaration).collect();
        format!("\n{}\n", lines.join("\n"))
    }

    pub fn declared_module(&self) -> String {
        format!(
            "\ndeclare module \"{}\" {{\n{}\n}}\n",
            self.name,
            self.declarations()
        )
    }

    pub fn entry(&self, name: &str) -> Option<&Entry> {
        self.entries.iter().find(|entry| entry.name == name)
    }
}

const fn function(name: &'static str, parameters: &'static [Parameter], returns: Ty) -> Entry {
    Entry {
        name,
        shape: Shape::Sync {
            parameters,
            returns,
        },
    }
}

const fn promise(name: &'static str, parameters: &'static [Parameter], returns: Ty) -> Entry {
    Entry {
        name,
        shape: Shape::Async {
            parameters,
            returns,
        },
    }
}

const fn component(name: &'static str, props: &'static [Field]) -> Entry {
    Entry {
        name,
        shape: Shape::Component { props },
    }
}

const fn text(name: &'static str) -> Parameter {
    Parameter {
        name,
        ty: Ty::Text,
        max_bytes: None,
    }
}

const fn bounded(name: &'static str, max_bytes: usize) -> Parameter {
    Parameter {
        name,
        ty: Ty::Text,
        max_bytes: Some(max_bytes),
    }
}

const fn revision(name: &'static str) -> Parameter {
    Parameter {
        name,
        ty: Ty::Decimal,
        max_bytes: None,
    }
}

const fn nullable(name: &'static str, ty: &'static Ty) -> Parameter {
    Parameter {
        name,
        ty: Ty::Nullable(ty),
        max_bytes: None,
    }
}

const fn field(name: &'static str, ty: Ty) -> Field {
    Field { name, ty }
}

const REQUEST_LIMIT: usize = 65536;
const TERMINAL_REQUEST_LIMIT: usize = 1024;

pub const THEME: Module = Module {
    name: "voyager_theme",
    entries: &[function("projection", &[], Ty::Palette)],
};

pub const WORKSPACE: Module = Module {
    name: "voyager_workspace",
    entries: &[
        function("request_id", &[], Ty::Text),
        promise("call", &[bounded("request", REQUEST_LIMIT)], Ty::Text),
        promise("worktree", &[bounded("request", REQUEST_LIMIT)], Ty::Text),
        promise(
            "terminal_open",
            &[bounded("request", TERMINAL_REQUEST_LIMIT)],
            Ty::Text,
        ),
        function("revision", &[], Ty::Text),
        promise("context_facts", &[], Ty::Text),
        promise(
            "workspace_observation",
            &[revision("version"), nullable("active", &Ty::Text)],
            Ty::Text,
        ),
        promise("launches", &[], Ty::Text),
        function("agent_programs", &[], Ty::Text),
        promise("processes", &[revision("version")], Ty::Text),
        function(
            "notice",
            &[],
            Ty::Record(&[
                field("revision", Ty::Text),
                field("closeRevision", Ty::Text),
                field("navigationRevision", Ty::Text),
                field("dockRevision", Ty::Text),
                field("packageRevision", Ty::Text),
                field("activityRevision", Ty::Text),
            ]),
        ),
        function("take_placement_notice", &[], Ty::Nullable(&Ty::Text)),
        function("voyager_unbound", &[], Ty::Nullable(&Ty::Text)),
        function("reported_activity", &[], Ty::Text),
        promise("refresh_activity", &[], Ty::Void),
        function("stop_session", &[], Ty::Void),
        function("quit", &[], Ty::Void),
        function("client_decorated", &[], Ty::Bool),
    ],
};

pub const CONVERSATION: Module = Module {
    name: "voyager_conversation",
    entries: &[
        component("Speech", &[]),
        function("request_id", &[], Ty::Text),
        promise("call", &[bounded("request", REQUEST_LIMIT)], Ty::Text),
        promise(
            "snapshot",
            &[Parameter {
                name: "after",
                ty: Ty::Nullable(&Ty::Decimal),
                max_bytes: None,
            }],
            Ty::Text,
        ),
    ],
};

pub const CONTENT_VIEW: Module = Module {
    name: "voyager_content_view",
    entries: &[
        component("Notes", &[field("vesselId", Ty::Text)]),
        component(
            "Vessel",
            &[field("vesselId", Ty::Text), field("typeId", Ty::Text)],
        ),
        promise("descriptions", &[], Ty::Text),
    ],
};

pub const VESSEL: Module = Module {
    name: "voyager_vessel",
    entries: &[
        function("identity", &[], Ty::Text),
        function("request_id", &[], Ty::Text),
        promise(
            "changed",
            &[Parameter {
                name: "after",
                ty: Ty::Nullable(&Ty::Decimal),
                max_bytes: None,
            }],
            Ty::Text,
        ),
        promise(
            "invoke",
            &[text("request"), text("requestId"), text("expectedRevision")],
            Ty::Text,
        ),
        function("theme", &[], Ty::Palette),
    ],
};

pub const AVATAR: Module = Module {
    name: "voyager_avatar",
    entries: &[
        component("Brand", &[]),
        component(
            "Layer",
            &[
                field("dockReceipt", Ty::Text),
                field("dockEpoch", Ty::Text),
                field("version", Ty::Text),
                field("scope", Ty::Text),
                field("layoutKey", Ty::Text),
            ],
        ),
        component(
            "Target",
            &[field("scope", Ty::Text), field("fallback", Ty::Bool)],
        ),
        component("PortalArea", &[]),
        function("window_epoch", &[], Ty::Text),
        function("dock_target_visible", &[text("scope")], Ty::Bool),
        function("speech_in_primary", &[], Ty::Bool),
        function("take_result", &[], Ty::Nullable(&Ty::Text)),
        function("take_animation_notice", &[], Ty::Nullable(&Ty::Text)),
    ],
};

pub const CANVAS_MODULES: [&Module; 5] =
    [&THEME, &AVATAR, &WORKSPACE, &CONTENT_VIEW, &CONVERSATION];
pub const VESSEL_MODULES: [&Module; 1] = [&VESSEL];
pub const MODULES: [&Module; 6] = [
    &THEME,
    &AVATAR,
    &WORKSPACE,
    &CONTENT_VIEW,
    &CONVERSATION,
    &VESSEL,
];

#[cfg(test)]
mod tests {
    use super::*;

    fn arity(count: usize) -> Vec<Supplied<'static>> {
        vec![Supplied::Text("1"); count]
    }

    #[test]
    fn every_name_is_unique_inside_its_module() {
        for module in MODULES {
            let mut names: Vec<&str> = module.entries.iter().map(|entry| entry.name).collect();
            names.sort_unstable();
            let total = names.len();
            names.dedup();
            assert_eq!(names.len(), total, "duplicate entry in {}", module.name);
        }
    }

    #[test]
    fn a_wrong_argument_is_refused_by_operation_and_argument_name() {
        let processes = WORKSPACE.entry("processes").unwrap();
        assert_eq!(processes.check(&[Supplied::Text("12")]), Ok(()));
        let refusal = processes.check(&[Supplied::Text("012")]).unwrap_err();
        assert!(
            refusal.starts_with("processes argument version"),
            "{refusal}"
        );
        let refusal = processes.check(&[Supplied::Other("a number")]).unwrap_err();
        assert!(refusal.contains("not a number"), "{refusal}");
        let refusal = processes.check(&arity(2)).unwrap_err();
        assert_eq!(refusal, "processes expects 1 argument, got 2");
    }

    #[test]
    fn nullable_accepts_null_and_the_inner_type() {
        let observation = WORKSPACE.entry("workspace_observation").unwrap();
        assert_eq!(
            observation.check(&[Supplied::Text("3"), Supplied::Null]),
            Ok(())
        );
        assert_eq!(
            observation.check(&[Supplied::Text("3"), Supplied::Text("placement-1")]),
            Ok(())
        );
        assert!(
            observation
                .check(&[Supplied::Text("3"), Supplied::Bool(true)])
                .is_err()
        );
    }

    #[test]
    fn a_request_over_its_limit_is_refused() {
        let call = WORKSPACE.entry("call").unwrap();
        let large = "x".repeat(REQUEST_LIMIT + 1);
        let refusal = call.check(&[Supplied::Text(&large)]).unwrap_err();
        assert_eq!(refusal, "call argument request exceeds 65536 bytes");
        assert_eq!(call.check(&[Supplied::Text("{}")]), Ok(()));
    }
}
