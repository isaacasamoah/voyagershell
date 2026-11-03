use serde_json::{Value, json};
use std::{
    env,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::SyncSender,
    thread,
};

const CONTENT_FRAME_LIMIT: usize = 2 * crate::content::ENVELOPE_LIMIT + 4096;

fn decode(bytes: &[u8]) -> Result<Value, String> {
    if bytes.is_empty() || bytes.len() > CONTENT_FRAME_LIMIT {
        return Err("Private Codex disconnected or exceeded the bounded content frame size. Nothing was resubmitted.".into());
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if bytes.len() > 1024 * 1024
        && (value["method"] != "item/tool/call" || value["params"]["tool"] != "voyager_content")
    {
        return Err(
            "Private Codex non-content frame exceeded 1 MiB; nothing was resubmitted".into(),
        );
    }
    Ok(value)
}

fn encode(value: &Value, limit: usize) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Provider request exceeds its transport byte limit; nothing was sent".into());
    }
    Ok(bytes)
}

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
                    .take(CONTENT_FRAME_LIMIT as u64 + 1)
                    .read_until(b'\n', &mut bytes)
                    .map_err(|e| e.to_string())
                    .and_then(|_| decode(&bytes));
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
        self.write_bounded(value, 65536)
    }

    pub(crate) fn tool_reply(&mut self, value: Value, content: bool) -> Result<(), String> {
        self.write_bounded(value, if content { CONTENT_FRAME_LIMIT } else { 65536 })
    }

    fn write_bounded(&mut self, value: Value, limit: usize) -> Result<(), String> {
        let bytes = encode(&value, limit)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_frames_do_not_raise_other_request_limits() {
        let value = json!({"id":"callback","method":"item/tool/call","params":{"tool":"voyager_content","arguments":{"text":"x".repeat(crate::content::ENVELOPE_LIMIT - 256)}}});
        let bytes = encode(&value, CONTENT_FRAME_LIMIT).unwrap();
        assert!(bytes.len() > 1024 * 1024);
        assert_eq!(decode(&bytes).unwrap(), value);
        assert!(encode(&value, 65536).is_err());
        let mut other = value.clone();
        other["params"]["tool"] = "voyager_process".into();
        assert!(decode(&serde_json::to_vec(&other).unwrap()).is_err());
        assert!(decode(&vec![b' '; CONTENT_FRAME_LIMIT + 1]).is_err());
        let reply = json!({"id":"callback","result":{"contentItems":[{"type":"inputText","text":"\\".repeat(crate::content::ENVELOPE_LIMIT - 256)}]}});
        assert!(encode(&reply, CONTENT_FRAME_LIMIT).is_ok());
        assert!(encode(&reply, 65536).is_err());
    }
}
