use serde_json::{Value, json};
use std::{
    env,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

#[derive(Clone, Debug)]
pub enum Error {
    Rejected { kind: String, message: String },
    Uncertain(String),
}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Self::Uncertain(error.to_string())
    }
}

pub struct Core {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    sequence: u64,
}

impl Core {
    pub fn connect(session: &str) -> Result<Self, Error> {
        if !session.starts_with("voyager-")
            || !session
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err(Error::Rejected {
                kind: "invalid_session".into(),
                message: "Use a dedicated voyager- session".into(),
            });
        }
        let mut child = Command::new(env::var_os("VOYAGER_HC").unwrap_or_else(|| "hc".into()))
            .args(["connect", "--session", session])
            .env("HC_SESSION", session)
            .env_remove("HC_TERMINAL_ID")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        let input = child
            .stdin
            .take()
            .ok_or_else(|| Error::Uncertain("Core input pipe missing".into()))?;
        let output = child
            .stdout
            .take()
            .ok_or_else(|| Error::Uncertain("Core output pipe missing".into()))?;
        let mut core = Self {
            child,
            input,
            output: BufReader::new(output),
            sequence: 0,
        };
        if let Err(error) = core.rpc("hello", json!({"generation":1})) {
            if let Err(cleanup) = core.close() {
                eprintln!("Core startup bridge cleanup: {cleanup:?}");
            }
            return Err(error);
        }
        Ok(core)
    }

    pub fn rpc(&mut self, method: &str, params: Value) -> Result<Value, Error> {
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or_else(|| Error::Rejected {
                kind: "exhausted".into(),
                message: "Core request identity exhausted".into(),
            })?;
        let id = self.sequence;
        let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        let bytes = serde_json::to_vec(&request).map_err(|e| Error::Rejected {
            kind: "invalid".into(),
            message: e.to_string(),
        })?;
        if bytes.len() > 1024 * 1024 {
            return Err(Error::Rejected {
                kind: "too_large".into(),
                message: "Core request exceeds 1 MiB".into(),
            });
        }
        self.input.write_all(&bytes)?;
        self.input.write_all(b"\n")?;
        self.input.flush()?;
        loop {
            let mut bytes = Vec::new();
            self.output
                .by_ref()
                .take(1024 * 1024 + 1)
                .read_until(b'\n', &mut bytes)?;
            if bytes.is_empty() || bytes.len() > 1024 * 1024 {
                return Err(Error::Uncertain(
                    "Core connection ended or exceeded the reply bound; no request was repeated"
                        .into(),
                ));
            }
            let response: Value =
                serde_json::from_slice(&bytes).map_err(|e| Error::Uncertain(e.to_string()))?;
            if response.get("id") != Some(&json!(id)) {
                continue;
            }
            if let Some(error) = response.get("error") {
                return Err(Error::Rejected {
                    kind: error
                        .pointer("/data/kind")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                        .into(),
                    message: error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Core refused the request")
                        .into(),
                });
            }
            return response
                .get("result")
                .cloned()
                .ok_or_else(|| Error::Uncertain("Core reply has no result".into()));
        }
    }

    pub fn close(mut self) -> Result<(), Error> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        Ok(())
    }
}
