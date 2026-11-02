use serde_json::{Value, json};
use std::{
    env,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::SyncSender,
    thread,
};

pub(crate) struct Codex {
    child: Child,
    input: ChildStdin,
}

impl Codex {
    pub(crate) fn open(
        cwd: &Path,
        events: SyncSender<Result<Value, String>>,
    ) -> Result<Self, String> {
        let mut child =
            Command::new(env::var_os("VOYAGER_CODEX_BIN").unwrap_or_else(|| "codex".into()))
                .args([
                    "app-server",
                    "--listen",
                    "stdio://",
                    "-c",
                    "features.shell_tool=true",
                    "-c",
                    "features.multi_agent=false",
                    "-c",
                    "features.multi_agent_v2=false",
                ])
                .current_dir(cwd)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Starting the private Codex runtime: {e}"))?;
        let input = child.stdin.take().ok_or("Codex input unavailable")?;
        let output = child.stdout.take().ok_or("Codex output unavailable")?;
        thread::spawn(move || {
            let mut output = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                let parsed = output
                    .by_ref()
                    .take(1024 * 1024 + 1)
                    .read_until(b'\n', &mut bytes)
                    .map_err(|e| e.to_string())
                    .and_then(|size| {
                        if size == 0 || size > 1024 * 1024 {
                            return Err("Private Codex disconnected or exceeded the 1 MiB frame bound. Nothing was resubmitted.".into());
                        }
                        serde_json::from_slice::<Value>(&bytes).map_err(|e| e.to_string())
                    });
                let failed = parsed.is_err();
                let relevant = match parsed.as_ref() {
                    Err(_) => true,
                    Ok(value) => {
                        value.get("id").is_some()
                            || matches!(
                                value.get("method").and_then(Value::as_str),
                                Some(
                                    "item/agentMessage/delta"
                                        | "item/completed"
                                        | "turn/started"
                                        | "turn/completed"
                                        | "error"
                                )
                            )
                    }
                };
                if relevant && events.send(parsed).is_err() || failed {
                    break;
                }
            }
        });
        Ok(Self { child, input })
    }

    pub(crate) fn write(&mut self, value: Value) -> Result<(), String> {
        let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
        if bytes.len() > 65536 {
            return Err("Provider request exceeds 64 KiB; nothing was sent".into());
        }
        self.input.write_all(&bytes).map_err(|e| e.to_string())?;
        self.input.write_all(b"\n").map_err(|e| e.to_string())?;
        self.input.flush().map_err(|e| e.to_string())
    }

    pub(crate) fn request(&mut self, id: u64, method: &str, params: Value) -> Result<(), String> {
        self.write(json!({"id": id, "method": method, "params": params}))
    }

    pub(crate) fn close(mut self) -> Result<(), String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            self.child.kill().map_err(|e| e.to_string())?;
        }
        self.child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }
}
