use crate::sandbox::PROVIDER_SOCKET;
use crate::system::{PATIENCE, TimedOut};
use anyhow::{Context, Result};
use anyhow::{bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

const RELAY_NAME: &str = "codex";
const THREAD: &str = "stand-in-thread";
const USER_AGENT: &str = "voyager-stand-in/0.0.0";

pub fn invoked_as_relay() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == RELAY_NAME))
        .unwrap_or(false)
}

pub fn relay() -> i32 {
    match relay_lines() {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("Stand-in relay: {error:#}");
            3
        }
    }
}

fn relay_lines() -> Result<()> {
    let socket = UnixStream::connect(PROVIDER_SOCKET).context("Stand-in provider socket")?;
    let mut upstream = socket.try_clone()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    writeln!(
        upstream,
        "{}",
        json!({"relay":"hello","pid":std::process::id(),"args":args})
    )?;
    thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            let Ok(line) = line else { return };
            if writeln!(upstream, "{line}").is_err() {
                return;
            }
        }
    });
    let mut stdout = io::stdout().lock();
    for line in BufReader::new(socket).lines() {
        writeln!(stdout, "{}", line?)?;
        stdout.flush()?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
pub struct Turn {
    pub thread: String,
    pub id: String,
    pub text: String,
    pub params: Value,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Script {
    pub calls: Vec<Call>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Call {
    #[serde(default)]
    pub at_ms: u64,
    pub tool: String,
    pub arguments: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Played {
    pub call: String,
    pub tool: String,
    pub scripted: Value,
    pub arguments: Value,
    pub result: Value,
    pub round_trip_ms: u64,
}

const LONGEST_OFFSET_MS: u64 = 60_000;

impl Script {
    pub fn parse(text: &str) -> Result<Self> {
        let script: Self = serde_json::from_str(text).context("Provider script")?;
        let mut last = 0;
        for call in &script.calls {
            ensure!(
                call.at_ms >= last,
                "Provider script call times must not decrease"
            );
            ensure!(
                call.at_ms <= LONGEST_OFFSET_MS,
                "Provider script call time exceeds {LONGEST_OFFSET_MS} ms"
            );
            ensure!(
                call.arguments.is_object(),
                "Provider script arguments for {} must be an object",
                call.tool
            );
            last = call.at_ms;
        }
        Ok(script)
    }

    pub fn require_calls(&self) -> Result<()> {
        ensure!(
            !self.calls.is_empty(),
            "The provider script has no calls, so there is nothing for the app to answer"
        );
        Ok(())
    }

    pub fn check_offered(&self, offered: &[String]) -> Result<()> {
        for call in &self.calls {
            ensure!(
                offered.contains(&call.tool),
                "The app offers no tool named {}; it offers {}",
                call.tool,
                offered.join(", ")
            );
        }
        Ok(())
    }
}

fn resolve(argument: &Value, results: &[Value]) -> Result<Value> {
    match argument {
        Value::Object(map) if map.len() == 1 && map.contains_key("$result") => {
            let (index, pointer) = map["$result"]
                .as_array()
                .and_then(|pair| Some((pair.first()?.as_u64()?, pair.get(1)?.as_str()?)))
                .context("A $result reference is [CALL_INDEX, JSON_POINTER]")?;
            let result = results.get(index as usize).with_context(|| {
                format!("The script refers to the result of call {index}, which has not run")
            })?;
            result
                .pointer(pointer)
                .cloned()
                .with_context(|| format!("Call {index}'s result has nothing at {pointer}"))
        }
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| Ok((key.clone(), resolve(value, results)?)))
            .collect::<Result<_>>()
            .map(Value::Object),
        Value::Array(items) => items
            .iter()
            .map(|item| resolve(item, results))
            .collect::<Result<_>>()
            .map(Value::Array),
        other => Ok(other.clone()),
    }
}

pub fn audit(ledger: &str) -> Result<()> {
    let mut written = std::collections::HashMap::new();
    for line in ledger.lines() {
        let entry: Value = serde_json::from_str(line).context("Provider ledger line")?;
        let frame = &entry["frame"];
        if entry["direction"] == "stand-in" && frame["method"] == "item/tool/call" {
            written.insert(
                frame["id"].to_string(),
                frame["params"]["arguments"].clone(),
            );
        }
        if entry["direction"] != "tool-call" {
            continue;
        }
        let call = &entry["frame"];
        ensure!(
            call["arguments"] == call["scripted"]
                && written.get(&call["call"].to_string()) == Some(&call["arguments"]),
            "The stand-in sent {} for tool call {} where the script resolved to {}",
            written
                .get(&call["call"].to_string())
                .unwrap_or(&Value::Null),
            call["call"],
            call["scripted"]
        );
        let reply = &call["result"];
        ensure!(
            reply["id"] == call["call"]
                && reply.get("method").is_none()
                && (reply.get("result").is_some() || reply.get("error").is_some()),
            "The stand-in recorded something other than the app's reply for tool call {}",
            call["call"]
        );
    }
    Ok(())
}

fn returned(frame: &Value) -> Value {
    frame
        .pointer("/result/contentItems/0/text")
        .and_then(Value::as_str)
        .map(|text| serde_json::from_str(text).unwrap_or_else(|_| json!(text)))
        .unwrap_or(Value::Null)
}

#[derive(Default)]
struct State {
    writer: Option<UnixStream>,
    connections: u32,
    relay_pid: Option<u32>,
    thread_starts: Vec<Value>,
    turn_starts: Vec<Value>,
    ledger: Option<File>,
    turns: u32,
    calls: u32,
}

type Returned = (Value, Instant);

pub struct Provider {
    state: Arc<Mutex<State>>,
    turns: Receiver<Turn>,
    returns: Receiver<Returned>,
    ledger: PathBuf,
}

impl Provider {
    pub fn listen(evidence: &Path) -> Result<Self> {
        if Path::new(PROVIDER_SOCKET).exists() {
            fs::remove_file(PROVIDER_SOCKET)?;
        }
        let listener = UnixListener::bind(PROVIDER_SOCKET).context("Stand-in provider socket")?;
        let ledger = evidence.join("provider.jsonl");
        let state = Arc::new(Mutex::new(State {
            ledger: Some(OpenOptions::new().create(true).append(true).open(&ledger)?),
            ..State::default()
        }));
        let (sender, turns) = mpsc::channel();
        let (returned, returns) = mpsc::channel();
        let shared = Arc::clone(&state);
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let shared = Arc::clone(&shared);
                let sender = sender.clone();
                let returned = returned.clone();
                thread::spawn(move || {
                    let _ = serve(&shared, stream, &sender, &returned);
                });
            }
        });
        Ok(Self {
            state,
            turns,
            returns,
            ledger,
        })
    }

    pub fn ledger(&self) -> &Path {
        &self.ledger
    }

    pub fn next_turn(&self, within: Duration) -> Result<Turn> {
        match self.turns.recv_timeout(within) {
            Ok(turn) => Ok(turn),
            Err(RecvTimeoutError::Timeout) => {
                Err(TimedOut("a turn/start from the app".into()).into())
            }
            Err(RecvTimeoutError::Disconnected) => {
                anyhow::bail!("The stand-in provider stopped listening")
            }
        }
    }

    pub fn connections(&self) -> u32 {
        lock(&self.state).connections
    }

    pub fn relay_pid(&self) -> Option<u32> {
        lock(&self.state).relay_pid
    }

    pub fn thread_starts(&self) -> Vec<Value> {
        lock(&self.state).thread_starts.clone()
    }

    pub fn turn_starts(&self) -> Vec<Value> {
        lock(&self.state).turn_starts.clone()
    }

    fn offered(&self) -> Vec<String> {
        lock(&self.state)
            .thread_starts
            .first()
            .and_then(|start| start["dynamicTools"].as_array())
            .into_iter()
            .flatten()
            .filter_map(|tool| tool["name"].as_str().map(str::to_owned))
            .collect()
    }

    pub fn play(&self, turn: &Turn, script: &Script) -> Result<Vec<Played>> {
        script.check_offered(&self.offered())?;
        let began = Instant::now();
        let mut results = Vec::new();
        let mut played = Vec::new();
        for call in &script.calls {
            let due = began + Duration::from_millis(call.at_ms);
            thread::sleep(due.saturating_duration_since(Instant::now()));
            let scripted = resolve(&call.arguments, &results)?;
            let id = {
                let mut state = lock(&self.state);
                state.calls += 1;
                format!("stand-in-call-{}", state.calls)
            };
            let sent = Instant::now();
            let request = self.notify_request(
                &id,
                json!({"threadId":turn.thread,"turnId":turn.id,"callId":id,"tool":call.tool,"arguments":scripted}),
            )?;
            let (frame, at) = self.returned(&id)?;
            let round_trip_ms = at.duration_since(sent).as_millis() as u64;
            let entry = Played {
                call: id,
                tool: call.tool.clone(),
                scripted,
                arguments: request["params"]["arguments"].clone(),
                result: frame,
                round_trip_ms,
            };
            results.push(returned(&entry.result));
            record(&mut lock(&self.state), "tool-call", &json!(entry));
            played.push(entry);
        }
        Ok(played)
    }

    fn returned(&self, id: &str) -> Result<Returned> {
        loop {
            match self.returns.recv_timeout(PATIENCE) {
                Ok((frame, at)) if frame["id"] == id => return Ok((frame, at)),
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout) => {
                    return Err(TimedOut(format!("the app's result for tool call {id}")).into());
                }
                Err(RecvTimeoutError::Disconnected) => {
                    bail!("The stand-in provider stopped listening")
                }
            }
        }
    }

    fn notify_request(&self, id: &str, params: Value) -> Result<Value> {
        let mut state = lock(&self.state);
        let frame = json!({"id":id,"method":"item/tool/call","params":params});
        write(&mut state, &frame)?;
        Ok(frame)
    }

    pub fn started(&self, turn: &Turn) -> Result<()> {
        self.notify(
            "turn/started",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"inProgress"}}),
        )
    }

    pub fn item_started(&self, turn: &Turn, item: &str) -> Result<()> {
        self.notify(
            "item/started",
            json!({"threadId":turn.thread,"turnId":turn.id,"item":{"type":"agentMessage","id":item,"text":""}}),
        )
    }

    pub fn delta(&self, turn: &Turn, item: &str, text: &str) -> Result<()> {
        self.notify(
            "item/agentMessage/delta",
            json!({"threadId":turn.thread,"turnId":turn.id,"itemId":item,"delta":text}),
        )
    }

    pub fn finish(&self, turn: &Turn, item: &str, text: &str) -> Result<()> {
        self.notify(
            "item/completed",
            json!({"threadId":turn.thread,"turnId":turn.id,"item":{"type":"agentMessage","id":item,"text":text}}),
        )
    }

    pub fn fail(&self, turn: &Turn, message: &str) -> Result<()> {
        self.notify(
            "error",
            json!({"threadId":turn.thread,"turnId":turn.id,"willRetry":false,"error":{"message":message}}),
        )?;
        self.notify(
            "turn/completed",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"failed","error":{"message":message}}}),
        )
    }

    pub fn complete(&self, turn: &Turn) -> Result<()> {
        self.notify(
            "turn/completed",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"completed"}}),
        )
    }

    fn notify(&self, method: &str, params: Value) -> Result<()> {
        let mut state = lock(&self.state);
        write(&mut state, &json!({"method":method,"params":params}))
    }
}

fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
    state
        .lock()
        .expect("the stand-in state is never held across a panic")
}

fn record(state: &mut State, direction: &str, frame: &Value) {
    let connection = state.connections;
    if let Some(ledger) = state.ledger.as_mut() {
        let _ = writeln!(
            ledger,
            "{}",
            json!({"direction":direction,"connection":connection,"frame":frame})
        );
    }
}

fn write(state: &mut State, frame: &Value) -> Result<()> {
    record(state, "stand-in", frame);
    let writer = state
        .writer
        .as_mut()
        .context("No relay is connected to the stand-in provider")?;
    writeln!(writer, "{frame}")?;
    writer.flush()?;
    Ok(())
}

fn serve(
    state: &Mutex<State>,
    stream: UnixStream,
    turns: &Sender<Turn>,
    returns: &Sender<Returned>,
) -> Result<()> {
    {
        let mut state = lock(state);
        state.connections += 1;
        state.writer = Some(stream.try_clone()?);
    }
    let mut lines = BufReader::new(stream).lines();
    if let Some(hello) = lines.next() {
        let hello: Value = serde_json::from_str(&hello?)?;
        let mut state = lock(state);
        record(&mut state, "relay", &hello);
        state.relay_pid = hello["pid"]
            .as_u64()
            .and_then(|pid| u32::try_from(pid).ok());
    }
    for line in lines {
        let frame: Value = serde_json::from_str(&line?)?;
        let mut state = lock(state);
        record(&mut state, "app", &frame);
        let (Some(method), Some(id)) = (frame["method"].as_str(), frame.get("id").cloned()) else {
            if frame.get("method").is_none()
                && (frame.get("result").is_some() || frame.get("error").is_some())
            {
                let _ = returns.send((frame, Instant::now()));
            }
            continue;
        };
        let params = frame["params"].clone();
        let reply = match method {
            "initialize" => json!({"id":id,"result":{"userAgent":USER_AGENT}}),
            "thread/start" => {
                state.thread_starts.push(params);
                json!({"id":id,"result":{"thread":{"id":THREAD},"model":"stand-in"}})
            }
            "turn/start" => {
                state.turns += 1;
                let turn = Turn {
                    thread: params["threadId"].as_str().unwrap_or_default().to_owned(),
                    id: format!("stand-in-turn-{}", state.turns),
                    text: params
                        .pointer("/input/0/text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    params: params.clone(),
                };
                state.turn_starts.push(params);
                let reply = json!({"id":id,"result":{"turn":{"id":turn.id,"status":"inProgress"}}});
                write(&mut state, &reply)?;
                let _ = turns.send(turn);
                continue;
            }
            _ => {
                json!({"id":id,"error":{"code":-32601,"message":"The stand-in provider does not answer this request"}})
            }
        };
        write(&mut state, &reply)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_script_parses_and_keeps_its_order() {
        let script = Script::parse(
            r#"{"calls":[{"tool":"voyager_workspace","arguments":{"a":1}},{"atMs":50,"tool":"voyager_process","arguments":{}}]}"#,
        )
        .expect("a valid script");
        assert_eq!(script.calls.len(), 2);
        assert_eq!(script.calls[0].at_ms, 0);
        assert_eq!(script.calls[1].tool, "voyager_process");
        assert!(
            Script::parse(r#"{"calls":[]}"#)
                .expect("an empty script")
                .calls
                .is_empty()
        );
    }

    #[test]
    fn a_malformed_script_is_refused() {
        for bad in [
            "",
            "[]",
            r#"{"calls":[{"tool":"t"}]}"#,
            r#"{"calls":[{"tool":"t","arguments":[]}]}"#,
            r#"{"calls":[{"atMs":5,"tool":"t","arguments":{}},{"atMs":4,"tool":"t","arguments":{}}]}"#,
            r#"{"calls":[{"atMs":60001,"tool":"t","arguments":{}}]}"#,
            r#"{"calls":[],"extra":1}"#,
        ] {
            assert!(Script::parse(bad).is_err(), "{bad:?} must be refused");
        }
    }

    #[test]
    fn a_script_with_no_calls_is_an_error_to_require_and_not_to_parse() {
        let empty = Script::parse(r#"{"calls":[]}"#).expect("an empty script parses");
        let error = empty.require_calls().expect_err("nothing to play");
        assert!(format!("{error:#}").contains("no calls"));
        assert!(
            Script::parse(r#"{"calls":[{"tool":"t","arguments":{}}]}"#)
                .expect("one call")
                .require_calls()
                .is_ok()
        );
    }

    #[test]
    fn a_tool_the_app_does_not_offer_is_refused_by_name() {
        let script = Script::parse(r#"{"calls":[{"tool":"voyager_nothing","arguments":{}}]}"#)
            .expect("a valid script");
        let error = script
            .check_offered(&["voyager_workspace".into()])
            .expect_err("an unoffered tool");
        let text = format!("{error:#}");
        assert!(text.contains("voyager_nothing") && text.contains("voyager_workspace"));
        assert!(script.check_offered(&["voyager_nothing".into()]).is_ok());
    }

    #[test]
    fn the_ledger_audit_wants_the_apps_reply_and_not_the_request() {
        let sent = json!({"direction":"stand-in","connection":1,"frame":{"id":"c1","method":"item/tool/call","params":{"arguments":{"a":1}}}});
        let reply = json!({"direction":"tool-call","connection":1,"frame":{"call":"c1","arguments":{"a":1},"scripted":{"a":1},"result":{"id":"c1","result":{"success":true}}}});
        let refusal = json!({"direction":"tool-call","connection":1,"frame":{"call":"c1","arguments":{"a":1},"scripted":{"a":1},"result":{"id":"c1","error":{"code":-32600}}}});
        let request = json!({"direction":"tool-call","connection":1,"frame":{"call":"c1","arguments":{"a":1},"scripted":{"a":1},"result":{"id":"c1","method":"item/tool/call","params":{}}}});
        let other = json!({"direction":"tool-call","connection":1,"frame":{"call":"c1","arguments":{"a":1},"scripted":{"a":1},"result":{"id":"c2","result":{}}}});
        let frames = json!({"direction":"app","connection":1,"frame":{"id":1}});
        assert!(audit(&format!("{sent}\n{reply}\n{refusal}\n{frames}\n")).is_ok());
        assert!(audit("").is_ok());
        for wrong in [request, other] {
            assert!(
                audit(&format!("{sent}\n{wrong}")).is_err(),
                "{wrong} must be caught"
            );
        }
    }

    #[test]
    fn the_ledger_audit_catches_arguments_other_than_the_scripted_ones() {
        let sent = json!({"direction":"stand-in","connection":1,"frame":{"id":"c1","method":"item/tool/call","params":{"arguments":{}}}});
        let call = |arguments: Value| json!({"direction":"tool-call","connection":1,"frame":{"call":"c1","arguments":arguments,"scripted":{"a":1},"result":{"id":"c1","result":{}}}});
        let lying = call(json!({"a":1}));
        let honest = call(json!({}));
        for ledger in [
            format!("{sent}\n{lying}"),
            format!("{sent}\n{honest}"),
            lying.to_string(),
        ] {
            let error = audit(&ledger).expect_err("sent arguments differ from the script");
            assert!(format!("{error:#}").contains("stand-in sent"));
        }
    }

    #[test]
    fn a_later_call_reads_an_earlier_result() {
        let results = vec![json!({"version":"4","layout":{"selectedFleet":"f1"}})];
        let argument = json!({"expectedVersion":{"$result":[0,"/version"]},"action":{"target":{"kind":"fleet","id":{"$result":[0,"/layout/selectedFleet"]}}}});
        assert_eq!(
            resolve(&argument, &results).expect("resolvable"),
            json!({"expectedVersion":"4","action":{"target":{"kind":"fleet","id":"f1"}}})
        );
        assert!(resolve(&json!({"$result":[1,"/version"]}), &results).is_err());
        assert!(resolve(&json!({"$result":[0,"/missing"]}), &results).is_err());
    }

    #[test]
    fn the_returned_text_is_read_as_the_tool_returned_it() {
        let frame = json!({"id":"c","result":{"success":false,"contentItems":[{"type":"inputText","text":"{\"status\":\"rejected\"}"}]}});
        assert_eq!(returned(&frame), json!({"status":"rejected"}));
        let plain = json!({"id":"c","result":{"success":false,"contentItems":[{"type":"inputText","text":"No capacity"}]}});
        assert_eq!(returned(&plain), json!("No capacity"));
    }
}
