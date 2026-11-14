use super::{Core, Error};
use crate::core_shapes::{HelloParams, HelloResult};
use serde_json::{Value, json};
use std::io::{BufRead, Read, Write};

pub const MINIMUM_CORE: (u64, u64, u64) = (0, 1, 18);
const REQUIRED_FEATURES: [&str; 3] = ["framed", "attach", "shell"];

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Incompatible {
    Generation(u32),
    Release(String),
    Missing(Vec<&'static str>),
}

impl std::fmt::Display for Incompatible {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (major, minor, patch) = MINIMUM_CORE;
        match self {
            Self::Generation(found) => write!(
                formatter,
                "Herdr Core speaks protocol generation {found}; Voyager needs generation 1"
            ),
            Self::Release(found) => write!(
                formatter,
                "Herdr Core reports release {found}; Voyager supports {major}.{minor}.{patch} and newer"
            ),
            Self::Missing(names) => write!(
                formatter,
                "Herdr Core lacks {}, which Voyager needs",
                names.join(", ")
            ),
        }
    }
}

impl From<Incompatible> for Error {
    fn from(incompatible: Incompatible) -> Self {
        Self::Rejected {
            kind: "unsupported_core".into(),
            message: incompatible.to_string(),
        }
    }
}

fn release(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version
        .split(['-', '+'])
        .next()?
        .split('.')
        .map(|part| part.parse::<u64>().ok());
    let release = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(release)
}

impl Core {
    pub(super) fn handshake(
        input: &mut impl Write,
        output: &mut impl BufRead,
    ) -> Result<(String, bool), Error> {
        let params = Self::hello_params();
        let mut hello =
            serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":"hello","params":params}))
                .map_err(|e| Error::Rejected {
                kind: "invalid".into(),
                message: e.to_string(),
            })?;
        hello.push(b'\n');
        input.write_all(&hello)?;
        input.flush()?;
        let mut line = Vec::new();
        output
            .by_ref()
            .take(1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        if line.is_empty() || line.len() > 1024 * 1024 {
            return Err(Error::Uncertain(
                "Core handshake missing or oversized".into(),
            ));
        }
        let result: Value =
            serde_json::from_slice(&line).map_err(|e| Error::Uncertain(e.to_string()))?;
        let supported = result
            .pointer("/result/methods")
            .and_then(Value::as_array)
            .is_some_and(|methods| {
                methods
                    .iter()
                    .any(|method| method.as_str() == Some("events.subscribe"))
            });
        Self::validate_hello(result).map(|identity| (identity, supported))
    }

    pub(super) fn hello_params() -> HelloParams {
        HelloParams {
            framed: true,
            generation: Some(1),
            ..Default::default()
        }
    }

    pub(super) const REQUIRED_METHODS: &'static [&'static str] = &[
        "hello",
        "doc.get",
        "doc.set",
        "terminal.get",
        "terminal.run",
        "terminal.attach",
        "terminal.list",
        "terminal.read",
        "terminal.send",
        "terminal.interrupt",
        "terminal.kill",
        "server.status",
        "server.stop",
    ];

    pub(super) fn compatible(hello: &HelloResult) -> Result<(), Incompatible> {
        if hello.generation != 1 {
            return Err(Incompatible::Generation(hello.generation));
        }
        if release(&hello.version).is_none_or(|release| release < MINIMUM_CORE) {
            return Err(Incompatible::Release(hello.version.clone()));
        }
        let missing: Vec<&'static str> = Self::REQUIRED_METHODS
            .iter()
            .filter(|required| !hello.methods.iter().any(|actual| actual == *required))
            .chain(
                REQUIRED_FEATURES
                    .iter()
                    .filter(|required| !hello.features.iter().any(|actual| actual == *required)),
            )
            .copied()
            .collect();
        if !missing.is_empty() {
            return Err(Incompatible::Missing(missing));
        }
        if !hello.framed {
            return Err(Incompatible::Missing(vec!["framed"]));
        }
        if hello.core.id.is_empty() {
            return Err(Incompatible::Missing(vec!["a Core identity"]));
        }
        Ok(())
    }

    pub(super) fn validate_hello(response: Value) -> Result<String, Error> {
        let hello: HelloResult = Self::decode("hello", Self::response(response, 1)?)?;
        Self::compatible(&hello)?;
        Ok(hello.core.id)
    }
}
