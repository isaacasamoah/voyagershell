use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, bound_terminal, fleets, voyages};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::json;
use voyager_contract::RenameTarget;

cases! {
    LineDrawn => "command-missing-line-drawn",
    NoVoyagerBound => "no-voyager-bound",
    LineSurvivesLayoutChange => "line-survives-a-layout-change",
    LineBesideRefusal => "line-shows-beside-a-refusal",
}

pub const CONTROL: Case = Case::LineDrawn;

const REFUSED: &str = "Refused.";
const TOO_LONG: usize = 129;
const WORDS: &str = "Voyager can't reply: the voyager command is missing.";

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
        let drawn = native.drawn_label(
            &Target::UNBOUND,
            "the missing command line in the status line",
            |label| label.contains(WORDS),
        )?;
        Verdict::new()
            .expect(
                "the status line on screen says Voyager cannot reply because the voyager command is missing",
                !drawn.is_empty(),
            )
            .expect("the status line holds that line and no error text", drawn == WORDS)
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
    })?;
    cases.check(native, Case::LineSurvivesLayoutChange, |native| {
        let (_, before) = native.document()?.context("The app saved no layout")?;
        let voyage = voyages(&before)
            .next()
            .context("The layout holds no Voyage")?
            .id
            .clone();
        let had = fleets(&before).count();
        native.click(&Target::create_fleet(&voyage))?;
        native.click(&Target::worker("terminal"))?;
        let grown = native.watch(|native| {
            Ok(native
                .document()?
                .map(|(_, layout)| fleets(&layout).count())
                .filter(|count| *count > had))
        })?;
        let drawn = native.drawn_label(
            &Target::UNBOUND,
            "the missing command line after the layout change",
            |label| label.contains(WORDS),
        )?;
        Verdict::new()
            .expect("a new Fleet was saved", grown.is_some())
            .expect(
                "the status line on screen still says Voyager cannot reply after the layout changed",
                !drawn.is_empty(),
            )
            .expect("the status line holds that line and no error text", drawn == WORDS)
            .observed("fleets before", had)?
            .observed("status line", drawn)
    })?;
    cases.check(native, Case::LineBesideRefusal, |native| {
        let (_, layout) = native.document()?.context("The app saved no layout")?;
        let fleet = fleets(&layout)
            .next()
            .context("The layout holds no Fleet")?
            .id
            .clone();
        let subject = RenameTarget::Fleet { id: fleet };
        let (name, editor) = (Target::name(&subject), Target::editor(&subject));
        let long = "n".repeat(TOO_LONG);
        native.double_click(&name)?;
        native.observe("the Fleet's name editor", |seen| {
            (seen.shows(&editor) && !seen.shows(&name)).then_some(())
        })?;
        native.type_text(&long)?;
        native.settle(
            "the editor holding the over-long draft",
            |seen| seen.label(&editor).map(str::to_owned),
            |draft| *draft == long,
        )?;
        native.press(Key::Return)?;
        let refusal = native.screen_status("a refusal in the status line", |label| {
            label.starts_with(REFUSED)
        })?;
        let line = native.drawn_label(
            &Target::UNBOUND,
            "the missing command line beside the refusal",
            |label| label.contains(WORDS),
        )?;
        native.press(Key::Escape)?;
        Verdict::new()
            .expect("the status line says the rename was refused", !refusal.is_empty())
            .expect(
                "the missing command line is still drawn beside the refusal",
                line == WORDS,
            )
            .observed("refusal", refusal)?
            .observed("missing command line", line)
    })
}
