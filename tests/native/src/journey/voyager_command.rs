use super::{Cases, Verdict, cases};
use crate::native::{Native, bound_terminal};
use anyhow::{Context as _, Result};
use serde_json::json;

cases! {
    LineDrawn => "command-missing-line-drawn",
    NoVoyagerBound => "no-voyager-bound",
}

pub const CONTROL: Case = Case::LineDrawn;

const WORDS: &str = "COMMAND-MISSING-WORDS-PENDING";

fn voyager_terminals(native: &Native) -> Result<Vec<String>> {
    let listed = native.system.rpc("terminal.list", json!({"all":true}))?;
    let mut found = Vec::new();
    for terminal in listed["terminals"]
        .as_array()
        .context("Core listed no terminals")?
    {
        let argv: Vec<&str> = terminal["argv"]
            .as_array()
            .map(|words| words.iter().filter_map(|word| word.as_str()).collect())
            .unwrap_or_default();
        if argv.windows(2).any(|pair| pair == ["-n", "voyager"]) {
            found.push(
                terminal["address"]
                    .as_str()
                    .context("A listed terminal has no address")?
                    .to_owned(),
            );
        }
    }
    Ok(found)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::LineDrawn, |native| {
        let drawn = native.screen_status("the missing command line in the status line", |label| {
            label.contains(WORDS)
        })?;
        Verdict::new()
            .expect(
                "the status line on screen says Voyager cannot reply because the voyager command is missing",
                !drawn.is_empty(),
            )
            .observed("status line", drawn)
    })?;
    cases.check(native, Case::NoVoyagerBound, |native| {
        let bound = bound_terminal(native);
        let started = voyager_terminals(native)?;
        Verdict::new()
            .expect("voyager.json names no terminal", bound.is_none())
            .expect(
                "Core lists no program started as the background Voyager",
                started.is_empty(),
            )
            .observed("bound", bound)?
            .observed("started", started)
    })
}
