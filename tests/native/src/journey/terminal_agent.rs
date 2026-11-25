use super::adopt_by_label::typed;
use super::agent_split::{TABLE_DEFAULT, create_codex, terminal_of};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Terminal};
use crate::system::until;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use voyager_contract::launch::Launch;

cases! {
    TypedAgentRunsUnderTheRetainedShell => "typed-agent-runs-under-the-retained-shell",
    CreatedAgentSitsBesideTheRetainedShell => "created-agent-sits-beside-the-retained-shell",
}

pub const CONTROL: Case = Case::TypedAgentRunsUnderTheRetainedShell;

const TYPED: &str = "codex --no-daemon --model gpt-6.1-sol";
const TYPED_ARGUMENTS: [&str; 3] = ["--no-daemon", "--model", "gpt-6.1-sol"];
const STARTED: &str = "Stand-in codex started with: ";

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Agent {
    pid: u32,
    argv: Vec<String>,
}

impl Agent {
    fn arguments(&self) -> &[String] {
        self.argv.get(1..).unwrap_or_default()
    }
}

fn parent_of(pid: u32) -> Result<u32> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat"))?;
    let (_, rest) = stat.rsplit_once(')').context("Malformed process stat")?;
    rest.split_whitespace()
        .nth(1)
        .context("Missing parent process")?
        .parse()
        .context("Unreadable parent process")
}

fn cwd_of(pid: u32) -> Result<PathBuf> {
    Ok(fs::read_link(format!("/proc/{pid}/cwd"))?)
}

fn program_pid(native: &Native, terminal: &str) -> Result<u32> {
    let reported = native
        .system
        .watch("terminal.get", json!({"terminal":terminal}))?;
    let pid = reported["pid"]
        .as_u64()
        .context("Core reports no program for the terminal")?;
    Ok(u32::try_from(pid)?)
}

fn holder_pid(native: &Native) -> Result<u32> {
    let status = native.system.watch("server.status", json!({}))?;
    let pid = status["holder"]["pid"]
        .as_u64()
        .context("Core reports no holder")?;
    Ok(u32::try_from(pid)?)
}

fn agent_in(native: &Native, terminal: &str, retained: Option<u32>) -> Result<Option<Agent>> {
    until(
        "Core naming the stand-in codex as the foreground program",
        || {
            let reported = native
                .system
                .watch("terminal.get", json!({"terminal":terminal}))?;
            if let Some(pid) = retained
                && (reported["pid"].as_u64() != Some(u64::from(pid))
                    || reported["state"].as_str() != Some("live"))
            {
                return Ok(Some(None));
            }
            let foreground = &reported["foreground"];
            let argv: Vec<String> = foreground["argv"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|argument| argument.as_str().map(str::to_owned))
                .collect();
            let named = argv
                .first()
                .and_then(|program| Path::new(program).file_name())
                .is_some_and(|name| name == "codex");
            Ok(match (named, foreground["pid"].as_u64()) {
                (true, Some(pid)) => Some(Some(Agent {
                    pid: u32::try_from(pid)?,
                    argv,
                })),
                _ => None,
            })
        },
    )
}

fn layout_value(native: &Native) -> Result<Value> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    Ok(serde_json::to_value(&layout)?)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = layout
        .selected_fleet
        .clone()
        .context("The layout has no selected Fleet")?;
    let address =
        terminal_of(&layout, first.placement()).context("The first Vessel has no terminal")?;

    cases.check(
        native,
        Case::TypedAgentRunsUnderTheRetainedShell,
        |native| {
            let shell = first.program(native)?;
            let shell_pid = program_pid(native, &address)?;
            let before = layout_value(native)?;
            typed(&first, native, TYPED)?;
            let agent = agent_in(native, &address, Some(shell_pid))?;
            let printed = match agent {
                Some(_) => until("the stand-in codex printing its arguments", || {
                    Ok(first.screen(native)?.contains(STARTED).then_some(true))
                })?,
                None => false,
            };
            let after = first.program(native)?;
            let saved = layout_value(native)?;
            native.keep_window("typed-agent-runs-under-the-retained-shell")?;
            Verdict::new()
                .expect(
                    "the retained shell is still the Vessel's Program after the agent started",
                    after.same && after.pid == shell.pid,
                )
                .expect(
                    "the typed agent runs as a child of that shell",
                    agent
                        .as_ref()
                        .is_some_and(|agent| parent_of(agent.pid).ok() == Some(shell_pid)),
                )
                .expect(
                    "the stand-in codex got the arguments that were typed",
                    printed
                        && agent.as_ref().is_some_and(|agent| {
                            agent
                                .arguments()
                                .iter()
                                .map(String::as_str)
                                .eq(TYPED_ARGUMENTS)
                        }),
                )
                .expect(
                    "the typed agent started in the shell's folder",
                    agent
                        .as_ref()
                        .is_some_and(|agent| cwd_of(agent.pid).ok() == cwd_of(shell_pid).ok()),
                )
                .expect(
                    "typing the agent changed nothing in the saved layout",
                    saved == before,
                )
                .observed("shell", &shell)?
                .observed("agent", &agent)?
                .observed("printed", printed)
        },
    )?;

    cases.check(
        native,
        Case::CreatedAgentSitsBesideTheRetainedShell,
        |native| {
            let shell_pid = program_pid(native, &address)?;
            let (_, before) = native.document()?.context("Missing saved layout")?;
            let started = create_codex(native, &fleet, first.placement())?;
            let created = started
                .created
                .as_ref()
                .context("Create Codex placed no Vessel")?;
            let wrapper = program_pid(native, &created.terminal)?;
            let holder = holder_pid(native)?;
            let agent = agent_in(native, &created.terminal, None)?
                .context("Core named no agent in the created Vessel")?;
            let (_, saved) = native.document()?.context("Missing saved layout")?;
            let drawn = native.observe("both terminals drawn with a size", |seen| {
                let sized = |target: &Target| {
                    target
                        .find(seen.frame)
                        .is_some_and(|element| element.bounds.width > 0.0 && element.bounds.height > 0.0)
                };
                let both = sized(&first.target()) && sized(&Target::terminal(&created.placement));
                both.then_some(both)
            })?;
            let table: Vec<String> = TABLE_DEFAULT.iter().map(|word| (*word).to_owned()).collect();
            native.keep_window("created-agent-sits-beside-the-retained-shell")?;
            Verdict::new()
                .expect(
                    "the retained shell is still its Vessel's Program after Create Codex",
                    first.program(native)?.same,
                )
                .expect(
                    "Create Codex made a new Vessel with its own Program beside the first",
                    created.terminal != address && wrapper != shell_pid,
                )
                .expect(
                    "the new Program and the retained shell both belong to Core's holder",
                    parent_of(wrapper).ok() == Some(holder)
                        && parent_of(shell_pid).ok() == Some(holder),
                )
                .expect(
                    "the agent is the new Program's foreground child, with the table's default arguments",
                    parent_of(agent.pid).ok() == Some(wrapper) && agent.arguments() == &table[1..],
                )
                .expect(
                    "the agent started in the new Vessel's folder",
                    cwd_of(agent.pid).ok() == fs::canonicalize(&created.cwd).ok(),
                )
                .expect(
                    "the new Vessel saved the table's default launch",
                    created.launch == Some(Launch::Program { argv: table.clone() }),
                )
                .expect(
                    "the first Vessel is unchanged in the saved layout",
                    before.vessels.first() == saved.vessels.first(),
                )
                .expect("both terminals are drawn with a size", drawn)
                .observed("wrapper", wrapper)?
                .observed("holder", holder)?
                .observed("agent", &agent)?
                .observed("started", &started)
        },
    )?;
    Ok(())
}
