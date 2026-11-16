use super::layout::{born, split_right};
use super::{Cases, Verdict, cases};
use crate::inspection::{centre, contains};
use crate::native::{
    Defect, EXPECTATION, LOOK, Lines, Native, Patch, Terminal, boxes, changed, pid, quote,
    repainted, state, vessels,
};
use crate::probe::{BLOCKS, COMPOSER, COMPOSER_ROW, READY, SIGNALS, WAITING, composer_column};
use crate::sandbox;
use crate::system::{Identity, PATIENCE, TimedOut, poll, settle, until};
use crate::x11::{Chord, Exchange, Geometry, Key, Pixels, Reading, Selection as Owned};
use anyhow::{Context as _, Result, ensure};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

cases! {
    TypedCommandRuns => "typed-command-runs",
    KeysReachTheProgram => "keys-reach-the-program",
    KeysFollowProgramModes => "keys-follow-program-modes",
    OutputDrawnWithoutInput => "output-drawn-without-input",
    DragSelectsText => "drag-selects-text",
    ReleaseCopiesToBoth => "release-copies-the-selection-to-clipboard-and-primary",
    CopyToClipboard => "copy-puts-the-selection-on-the-clipboard",
    PasteSendsText => "paste-sends-another-clients-text",
    InputDuringFlood => "input-reaches-one-terminal-while-another-floods",
    DragInOneCellCopiesIt => "a-drag-inside-one-cell-copies-that-cell",
    ClickKeepsCopy => "a-click-without-a-drag-leaves-clipboard-and-primary-unchanged",
    MiddleClickPastesPrimary => "a-click-sends-no-bytes-and-a-middle-click-pastes-primary",
    OversizedPrimaryRefused => "a-middle-click-refuses-primary-over-64-kib",
    ReleaseOverAnotherTerminalKeepsClipboard => "a-drag-released-over-another-terminal-does-not-copy-that-terminals-older-selection",
    ClickMovesShellCursor => "a-click-in-the-shell-input-line-moves-the-cursor-there",
    ClickMovesComposerCursor => "a-click-in-a-line-reading-program-moves-its-cursor-to-the-clicked-column",
    ClickCountsCharacters => "a-click-across-a-wide-character-sends-one-arrow-per-character",
    ClickAboveCursorSendsNothing => "a-click-on-a-row-above-the-cursor-sends-no-arrow-bytes",
    ClickUnderMouseTrackingSendsNothing => "a-click-under-mouse-tracking-sends-no-arrow-bytes",
    ClickInAlternateScreenSendsNothing => "a-click-on-the-cursor-row-of-an-alternate-screen-program-sends-no-arrow-bytes",
}

pub const CONTROL: Case = Case::CopyToClipboard;

const TOLERANCE: u8 = 1;
const KEYS: &[u8] = b"aZ~ 1\t\x1b[Z\x7f\x1b\x1b[A\x1b[B\x03\r";
const APPLICATION_ARROWS: &[u8] = b"\x1bOA\x1bOB\x1bOC\x1bOD";
const INTERRUPT: u8 = 0x03;
const COPY: [u8; 3] = [24, 160, 96];
const COPIED: &str = "COPYβ界";
const CANARY: &str = "VERIFIER-CANARY";
const PRIMARY_CANARY: &str = "VERIFIER-PRIMARY-CANARY";
const COPIED_CELLS: u16 = 7;
const CELL: (u16, u16) = (3, 1);
const CELL_TEXT: &str = "N";
const SENTINEL: &str = "VERIFIER-SENTINEL";
const PASTED: &str = "PASTEβ界\nline2";
const OVERSIZED: usize = 70 * 1024;
const STATUS: [u8; 3] = [0x35, 0x1e, 0x25];
const TEXT_TARGET: &str = "UTF8_STRING";
const ENDED: &str = "Ctrl+D ended the program";
const LEFT: &[u8] = b"\x1b[D";
const RIGHT: &[u8] = b"\x1b[C";
const SHELL_LINE: &str = "echo abcdef";
const SHELL_PROMPT: u16 = 2;
const SHELL_CLICK: u16 = SHELL_PROMPT + 7;

struct Probe {
    name: &'static str,
    path: PathBuf,
    command: String,
}

impl Probe {
    fn new(native: &Native, name: &'static str, mode: &str) -> Result<Self> {
        let path = native.system.evidence.join(format!("{name}-state.json"));
        let command = format!(
            "{} probe {} {mode}",
            quote(&std::env::current_exe()?)?,
            quote(&path)?
        );
        Ok(Self {
            name,
            path,
            command,
        })
    }

    fn type_command(&self, native: &Native, terminal: &Terminal) -> Result<()> {
        terminal.shown(native, &format!("{}-clear", self.name), |look| {
            boxes(look, READY, TOLERANCE).is_empty()
        })?;
        terminal.echoed(native, &self.command)
    }

    fn start(&self, native: &Native) -> Result<Identity> {
        native.press(Key::Return)?;
        until(&format!("the {} probe's state", self.name), || {
            Ok(self.path.exists().then_some(()))
        })?;
        Identity::read(pid(&state(&self.path)?)?)
    }

    fn ready(&self, native: &Native, terminal: &Terminal) -> Result<Identity> {
        let identity = self.start(native)?;
        terminal.shown(native, &format!("{}-ready", self.name), |look| {
            !boxes(look, READY, TOLERANCE).is_empty()
        })?;
        Ok(identity)
    }

    fn received(&self, expected: &[u8]) -> Result<Vec<u8>> {
        let read = || -> Result<Option<Vec<u8>>> {
            Ok(Some(serde_json::from_value(
                state(&self.path)?["received"].clone(),
            )?))
        };
        settle(EXPECTATION, LOOK, read, |received| received == expected)?
            .with_context(|| format!("The {} probe's state never held still", self.name))
    }

    fn end(&self, native: &Native) -> Result<bool> {
        native.press(Key::Char('d').ctrl())?;
        self.reached(|state| state["ended"] == true)
    }

    fn signal(&self, native: &Native, signal: &str) -> Result<()> {
        fs::write(self.path.with_extension(signal), "")?;
        native
            .system
            .record(json!({"event":"probe-signal","probe":self.name,"signal":signal}))
    }

    fn stage(&self, stage: &str) -> Result<()> {
        if self.reached(|state| state["stage"] == stage)? {
            return Ok(());
        }
        Err(TimedOut(format!("the {} probe's stage {stage}", self.name)).into())
    }

    fn reached(&self, held: impl Fn(&Value) -> bool) -> Result<bool> {
        let reached = poll(PATIENCE, LOOK, true, || {
            Ok(held(&state(&self.path)?).then_some(()))
        })?;
        Ok(reached.is_some())
    }
}

fn escaped(bytes: &[u8]) -> String {
    bytes.escape_ascii().to_string()
}

fn pair(found: &[Vec<Patch>; 2]) -> Option<(Patch, Patch)> {
    let [first, second] = found;
    match (&first[..], &second[..]) {
        ([first], [second]) => Some((*first, *second)),
        _ => None,
    }
}

struct Selection {
    plain: Pixels,
    source: Patch,
    colours: BTreeSet<[u8; 3]>,
}

struct Paste {
    received: Vec<u8>,
    served: usize,
    ended: bool,
}

impl Paste {
    fn observed(&self) -> Value {
        json!({"received":escaped(&self.received),"text requests served":self.served,"probe ended":self.ended})
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    sandbox::plain_shell(
        &native.system.evidence.join("containment.json"),
        Path::new(sandbox::HOME),
        terminal.program(native)?.argv,
    )?;
    let clipboard = native.clipboard()?;
    clipboard.own(CANARY)?;
    let canary = clipboard.read()?;
    ensure!(
        canary == Reading::Text(CANARY.into()),
        "The verifier's clipboard owner returned {canary:?} for its own canary"
    );
    clipboard.own_in(Owned::Primary, PRIMARY_CANARY)?;
    let primary = clipboard.read_in(Owned::Primary)?;
    ensure!(
        primary == Reading::Text(PRIMARY_CANARY.into()),
        "The verifier's clipboard owner returned {primary:?} for its own PRIMARY canary"
    );
    clipboard.disown_in(Owned::Primary)?;
    ensure!(
        clipboard.owner_in(Owned::Primary)?.is_none(),
        "The verifier still owns PRIMARY after it gave PRIMARY up"
    );

    cases.check(native, Case::TypedCommandRuns, |native| {
        let prompt = Lines::of(
            &terminal.settled(native, "typed-before", |look| !Lines::of(look).is_empty())?,
        );
        terminal.line(native, "printf 'TYPED-%s\\n' $((6*7))")?;
        let printed = terminal.printed(native, "TYPED-42")?;
        let drawn = Lines::of(&terminal.settled(native, "typed-after", |look| {
            grew(&prompt, &Lines::of(look))
        })?);
        Verdict::new()
            .expect(
                "the shell ran the typed command and printed TYPED-42",
                printed,
            )
            .expect(
                "the terminal drew new lines after the command",
                grew(&prompt, &drawn),
            )
            .observed("lines before", &prompt)?
            .observed("lines after", &drawn)
    })?;

    cases.check(native, Case::KeysReachTheProgram, |native| {
        let probe = Probe::new(native, "keys", "keys")?;
        probe.type_command(native, &terminal)?;
        let identity = probe.ready(native, &terminal)?;
        native.type_text("aZ~ 1")?;
        let keys = [
            Chord::from(Key::Tab),
            Key::Tab.shift(),
            Chord::from(Key::BackSpace),
            Chord::from(Key::Escape),
            Chord::from(Key::Up),
            Chord::from(Key::Down),
            Key::Char('c').ctrl(),
            Chord::from(Key::Return),
        ];
        for key in keys {
            native.press(key)?;
        }
        let received = probe.received(KEYS)?;
        let alive = identity.verify().is_ok() && pid(&state(&probe.path)?)? == identity.pid;
        let ended = probe.end(native)?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "the program received a Z ~ space 1 HT ESC[Z DEL ESC ESC[A ESC[B ETX CR, in order, each once",
                received == KEYS,
            )
            .expect(
                "Ctrl+C reached the program as a byte and the probe is the same process",
                received.contains(&INTERRUPT) && alive,
            )
            .expect(
                "the shell is the same program after the probe ends",
                ended && shell.same,
            )
            .observed("received", escaped(&received))?
            .observed("expected", escaped(KEYS))?
            .observed("probe", &identity)?
            .observed("probe ended", ended)?
            .observed("shell", &shell)
    })?;

    cases.check(native, Case::KeysFollowProgramModes, |native| {
        let probe = Probe::new(native, "application-cursor", "keys --application-cursor")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        for key in [Key::Up, Key::Down, Key::Right, Key::Left] {
            native.press(key)?;
        }
        let received = probe.received(APPLICATION_ARROWS)?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "after the program asked for application cursor keys, Up, Down, Right and Left arrived as ESC O A, ESC O B, ESC O C and ESC O D",
                received == APPLICATION_ARROWS,
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&received))?
            .observed("expected", escaped(APPLICATION_ARROWS))
    })?;

    cases.check(native, Case::OutputDrawnWithoutInput, |native| {
        let probe = Probe::new(native, "draw", "draw")?;
        let [go, back, end] = SIGNALS;
        probe.type_command(native, &terminal)?;
        probe.start(native)?;
        let waiting = |look: &Pixels| !boxes(look, WAITING, TOLERANCE).is_empty();
        terminal.shown(native, "draw-waiting", waiting)?;
        let before = terminal.settled(native, "draw-before", waiting)?;
        let sent = native.system.acted();
        probe.signal(native, go)?;
        probe.stage("drawn")?;
        let blocks = |look: &Pixels| BLOCKS.map(|block| boxes(look, block.rgb, TOLERANCE));
        let drawn = terminal.settled(native, "draw-drawn", |look| {
            pair(&blocks(look)).is_some()
        })?;
        let found = blocks(&drawn);
        let origin = terminal.origin(native)?;
        let unprompted = native.system.acted() == sent;
        probe.signal(native, back)?;
        probe.stage("back")?;
        let restored = terminal.settled(native, "draw-back", |look| look == &before)?;
        probe.signal(native, end)?;
        probe.stage("ended")?;
        Verdict::new()
            .expect(
                "both blocks are drawn although no input followed the program's output",
                pair(&found).is_some() && unprompted,
            )
            .expect(
                "the blocks are drawn at the rows and columns the program addressed, on one cell grid",
                pair(&found)
                    .is_some_and(|(first, second)| gridded(origin, first.area, second.area)),
            )
            .expect(
                "each block holds glyph ink",
                pair(&found).is_some_and(|(first, second)| first.ink > 0 && second.ink > 0),
            )
            .expect(
                "leaving the alternate screen draws the earlier screen again",
                restored == before,
            )
            .observed("blocks", &found)?
            .observed("first cell", origin)?
            .observed("inputs sent while the program drew", native.system.acted() - sent)?
            .observed("changed after leaving", changed(&before, &restored))
    })?;

    let selection = cases.make(native, Case::DragSelectsText, |native| {
        let [red, green, blue] = COPY;
        terminal.focus(native)?;
        terminal.echoed(
            native,
            &format!(
                "printf '\\033[2J\\033[H\\033[48;2;{red};{green};{blue}mCOPY\\xce\\xb2\\xe7\\x95\\x8c\\033[0m\\n\\n'"
            ),
        )?;
        native.press(Key::Return)?;
        let plain = terminal.settled(native, "select-before", |look| {
            boxes(look, COPY, TOLERANCE).len() == 1 && Lines::of(look).count() >= 2
        })?;
        let sources = boxes(&plain, COPY, TOLERANCE);
        let verdict = Verdict::new()
            .expect(
                "the text to select is drawn on one coloured box, with the next prompt below it",
                matches!(sources[..], [source] if source.ink > 0)
                    && Lines::of(&plain).count() >= 2,
            )
            .observed("boxes", &sources)?;
        let (true, [source]) = (verdict.passed(), &sources[..]) else {
            return Ok((verdict, None));
        };
        let area = source.area;
        let [first, last, past] = [0, COPIED_CELLS - 1, COPIED_CELLS]
            .map(|column| terminal.cell(native, column, 0));
        let (first, last, past) = (first?, last?, past?);
        ensure!(
            first.x.abs_diff(area.x) <= 2
                && first.height.abs_diff(area.height) <= 2
                && contains(area, centre(last))
                && !contains(area, centre(past)),
            "The verifier's cell grid puts the first cell at {first:?}, the last of {COPIED_CELLS} cells at {last:?} and the cell after at {past:?}, but the terminal drew the text in {area:?}"
        );
        let row = area.y + (area.height / 2) as i16;
        native.drag_between(
            &terminal.target(),
            (area.x + 1, row),
            (area.x + area.width as i16 - 2, row),
        )?;
        let selected = terminal.settled(native, "select-after", |look| {
            highlight(&repainted(&plain, look, COPY, TOLERANCE)).is_some()
        })?;
        let colours = repainted(&plain, &selected, COPY, TOLERANCE);
        let altered = changed(&plain, &selected);
        let verdict = verdict
            .expect(
                "every background pixel of the dragged text changed colour, to one colour",
                highlight(&colours).is_some(),
            )
            .expect(
                "nothing outside the dragged row changed",
                altered.is_none_or(|altered| {
                    altered.y >= area.y
                        && i32::from(altered.y) + i32::from(altered.height)
                            <= i32::from(area.y) + i32::from(area.height)
                }),
            )
            .observed("colours after the drag", &colours)?
            .observed("changed", altered)?;
        let selection = Selection {
            plain,
            source: *source,
            colours,
        };
        Ok((verdict, Some(selection)))
    })?;
    let Some(selection) = selection else {
        return Ok(());
    };

    cases.check(native, Case::ReleaseCopiesToBoth, |native| {
        let verifier = native.clipboard()?.window();
        let sent = native.system.acted();
        poll(EXPECTATION, LOOK, true, || {
            let taken = native.clipboard()?.owner()? != Some(verifier)
                && native.clipboard()?.owner_in(Owned::Primary)?.is_some();
            Ok(taken.then_some(()))
        })?;
        let inputs = native.system.acted() - sent;
        let clipboard = native.clipboard()?.read()?;
        let primary = native.clipboard()?.read_in(Owned::Primary)?;
        Verdict::new()
            .expect(
                "after the release and with no key pressed, another X client reads exactly COPYβ界 from CLIPBOARD",
                clipboard == Reading::Text(COPIED.into()) && inputs == 0,
            )
            .expect(
                "after the release and with no key pressed, another X client reads exactly COPYβ界 from PRIMARY",
                primary == Reading::Text(COPIED.into()) && inputs == 0,
            )
            .observed("clipboard", &clipboard)?
            .observed("primary", &primary)?
            .observed("inputs sent after the release", inputs)
    })?;

    cases.check(native, Case::CopyToClipboard, |native| {
        let verifier = native.clipboard()?.window();
        native.clipboard()?.own(SENTINEL)?;
        let held = native.clipboard()?.exchanges()?.len();
        native.press(Key::Char('c').ctrl().shift())?;
        poll(EXPECTATION, LOOK, true, || {
            Ok((native.clipboard()?.owner()? != Some(verifier)).then_some(()))
        })?;
        let owner = native.clipboard()?.owner()?;
        let read = native.clipboard()?.read()?;
        let exchanges = native.clipboard()?.exchanges()?;
        let lost = exchanges[held..].iter().any(|exchange| {
            matches!(
                exchange,
                Exchange::Cleared {
                    selection: Some(Owned::Clipboard),
                    ..
                }
            )
        });
        let after = terminal.settled(native, "copy-after", |look| {
            repainted(&selection.plain, look, COPY, TOLERANCE) == selection.colours
        })?;
        Verdict::new()
            .expect(
                "another X client reads exactly COPYβ界 from the clipboard",
                read == Reading::Text(COPIED.into()),
            )
            .expect(
                "a client other than the verifier took the clipboard",
                lost && owner.is_some_and(|owner| owner != verifier),
            )
            .expect(
                "copying leaves the selection drawn",
                repainted(&selection.plain, &after, COPY, TOLERANCE) == selection.colours,
            )
            .observed("clipboard", &read)?
            .observed("clipboard owner", owner)?
            .observed("verifier window", verifier)?
            .observed("exchanges", &exchanges[held..])
    })?;

    cases.check(native, Case::PasteSendsText, |native| {
        let bracketed = Probe::new(native, "paste-bracketed", "keys --bracketed-paste")?;
        bracketed.type_command(native, &terminal)?;
        let unselected = |look: &Pixels| boxes(look, COPY, TOLERANCE) == [selection.source];
        let typed = terminal.settled(native, "paste-typed", unselected)?;
        native.clipboard()?.own(PASTED)?;
        let wrapped = format!("\x1b[200~{PASTED}\x1b[201~");
        let within = paste(native, &terminal, &bracketed, wrapped.as_bytes())?;
        let plain = Probe::new(native, "paste-plain", "keys")?;
        plain.type_command(native, &terminal)?;
        let returned = PASTED.replace('\n', "\r");
        let bare = paste(native, &terminal, &plain, returned.as_bytes())?;
        Verdict::new()
            .expect("typing cleared the selection highlight", unselected(&typed))
            .expect(
                "with bracketed paste on, the program received ESC[200~ PASTEβ界 LF line2 ESC[201~",
                within.received == wrapped.as_bytes(),
            )
            .expect(
                "with bracketed paste off, the program received PASTEβ界 CR line2",
                bare.received == returned.as_bytes(),
            )
            .expect(
                "a client other than the verifier asked the verifier's clipboard for the text of each paste",
                within.served > 0 && bare.served > 0,
            )
            .expect(ENDED, within.ended && bare.ended)
            .observed("with bracketed paste", within.observed())?
            .observed("without bracketed paste", bare.observed())?
            .observed("boxes after typing", boxes(&typed, COPY, TOLERANCE))
    })?;

    let mut second = None;
    cases.check(native, Case::InputDuringFlood, |native| {
        let before = native.observe("the workspace at rest", |seen| Some(seen.document.clone()))?;
        let (after, _, _) = split_right(native, &before, terminal.placement())?;
        let [made] = born(vessels(&before), vessels(&after), |vessel| &vessel.id)[..] else {
            return Err(Defect("the split did not create exactly one Vessel".into()).into());
        };
        let other = Terminal::bind(native, &made.id)?;
        second = Some(made.id.clone());
        terminal.line(native, "timeout 30 yes flood")?;
        until("the flood in the first terminal's foreground", || {
            Ok(flooding(&terminal.foreground(native)?).then_some(()))
        })?;
        let quiet = Lines::of(&other.settled(native, "flood-other-before", |look| {
            !Lines::of(look).is_empty()
        })?);
        other.line(native, "echo DURING-$((6*7))")?;
        let printed = other.printed(native, "DURING-42")?;
        let while_printed = terminal.foreground(native)?;
        let drawn = Lines::of(&other.settled(native, "flood-other-after", |look| {
            grew(&quiet, &Lines::of(look))
        })?);
        let while_drawn = terminal.foreground(native)?;
        terminal.focus(native)?;
        native.press(Key::Char('c').ctrl())?;
        let stopped = poll(PATIENCE, LOOK, true, || {
            Ok((!flooding(&terminal.foreground(native)?)).then_some(()))
        })?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "the other terminal's shell printed DURING-42 while the flood still ran",
                printed && flooding(&while_printed),
            )
            .expect(
                "the other terminal drew the output while the flood still ran",
                grew(&quiet, &drawn) && flooding(&while_drawn),
            )
            .expect(
                "Ctrl+C stopped the flood and the first shell is the same program",
                stopped.is_some() && shell.same,
            )
            .observed(
                "foreground when the other shell had printed",
                &while_printed,
            )?
            .observed("foreground when the other terminal had drawn", &while_drawn)?
            .observed("other terminal's lines before", &quiet)?
            .observed("other terminal's lines after", &drawn)?
            .observed("foreground after Ctrl+C", terminal.foreground(native)?)?
            .observed("first shell", &shell)
    })?;

    cases.check(native, Case::DragInOneCellCopiesIt, |native| {
        terminal.focus(native)?;
        terminal.echoed(native, "printf '\\033[2J\\033[H%s%s\\n%s%s\\n' ABCDE FGHIJ KLMNO PQRST")?;
        native.press(Key::Return)?;
        terminal.shows(native, "KLMNOPQRST")?;
        let before = terminal.settled(native, "cell-before", |look| Lines::of(look).count() >= 2)?;
        let cell = terminal.cell(native, CELL.0, CELL.1)?;
        let (right, bottom) = (
            cell.x + cell.width as i16 - 3,
            cell.y + cell.height as i16 - 3,
        );
        let verifier = native.clipboard()?.window();
        native.clipboard()?.own(SENTINEL)?;
        native.drag_between(&terminal.target(), (cell.x + 2, cell.y + 2), (right, bottom))?;
        native.press(Key::Char('c').ctrl().shift())?;
        poll(EXPECTATION, LOOK, true, || {
            Ok((native.clipboard()?.owner()? != Some(verifier)).then_some(()))
        })?;
        let read = native.clipboard()?.read()?;
        let after = terminal.settled(native, "cell-after", |_| true)?;
        Verdict::new()
            .expect(
                "another X client reads exactly N, the character in cell 3 of row 1, from the clipboard",
                read == Reading::Text(CELL_TEXT.into()),
            )
            .observed("cell", cell)?
            .observed("changed", changed(&before, &after))?
            .observed("copied", &read)
    })?;

    cases.check(native, Case::ClickKeepsCopy, |native| {
        let verifier = native.clipboard()?.window();
        let before = terminal.settled(native, "keeps-before", |look| Lines::of(look).count() >= 2)?;
        native.clipboard()?.own(SENTINEL)?;
        native.clipboard()?.own_in(Owned::Primary, SENTINEL)?;
        let held = native.clipboard()?.exchanges()?.len();
        terminal.click_cell(native, 8, 0)?;
        let after = terminal.settled(native, "keeps-after", |look| {
            changed(&before, look).is_some()
        })?;
        let clipboard = native.clipboard()?.read()?;
        let primary = native.clipboard()?.read_in(Owned::Primary)?;
        let owners = (
            native.clipboard()?.owner()?,
            native.clipboard()?.owner_in(Owned::Primary)?,
        );
        let exchanges = native.clipboard()?.exchanges()?;
        let lost = exchanges[held..]
            .iter()
            .any(|exchange| matches!(exchange, Exchange::Cleared { .. }));
        Verdict::new()
            .expect(
                "the click reached the app and cleared the drawn selection",
                changed(&before, &after).is_some(),
            )
            .expect(
                "the verifier still owns CLIPBOARD and PRIMARY after the click and neither was taken",
                owners == (Some(verifier), Some(verifier)) && !lost,
            )
            .expect(
                "another X client still reads exactly VERIFIER-SENTINEL from CLIPBOARD and from PRIMARY",
                clipboard == Reading::Text(SENTINEL.into())
                    && primary == Reading::Text(SENTINEL.into()),
            )
            .observed("clipboard", &clipboard)?
            .observed("primary", &primary)?
            .observed("exchanges", &exchanges[held..])
    })?;

    cases.check(native, Case::MiddleClickPastesPrimary, |native| {
        let probe = Probe::new(native, "clicks", "keys --bracketed-paste")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        let verifier = native.clipboard()?.window();
        native.clipboard()?.own_in(Owned::Primary, PASTED)?;
        let held = native.clipboard()?.exchanges()?.len();
        terminal.click_cell(native, 3, 0)?;
        native.middle_click(&terminal.target())?;
        let wrapped = format!("\x1b[200~{PASTED}\x1b[201~");
        native.type_text("x")?;
        let expected = [wrapped.as_bytes(), b"x"].concat();
        let received = probe.received(&expected)?;
        let ended = probe.end(native)?;
        let served = served_to_others(&native.clipboard()?.exchanges()?[held..], verifier, Owned::Primary);
        Verdict::new()
            .expect(
                "after a click at a cell and a middle click, the program received only ESC[200~ PASTEβ界 LF line2 ESC[201~ and the x typed after them",
                received == expected,
            )
            .expect(
                "a client other than the verifier asked the verifier's PRIMARY for the text",
                served > 0,
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&received))?
            .observed("PRIMARY requests served", served)
    })?;

    cases.check(native, Case::OversizedPrimaryRefused, |native| {
        let probe = Probe::new(native, "oversized", "keys")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        let verifier = native.clipboard()?.window();
        let before = terminal.settled(native, "oversized-before", |look| {
            boxes(look, STATUS, TOLERANCE).is_empty()
        })?;
        native
            .clipboard()?
            .own_in(Owned::Primary, &"A".repeat(OVERSIZED))?;
        let held = native.clipboard()?.exchanges()?.len();
        native.middle_click(&terminal.target())?;
        let served = poll(PATIENCE, LOOK, true, || {
            let seen = native.clipboard()?.exchanges()?;
            let count = served_to_others(&seen[held..], verifier, Owned::Primary);
            Ok((count > 0).then_some(count))
        })?;
        let banner = terminal.settled(native, "oversized-banner", |look| {
            !boxes(look, STATUS, TOLERANCE).is_empty()
        })?;
        native.type_text("x")?;
        let received = probe.received(b"x")?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "another X client asked for the 70 KiB in PRIMARY",
                served.is_some(),
            )
            .expect(
                "the terminal drew its error banner after the middle click",
                boxes(&before, STATUS, TOLERANCE).is_empty()
                    && !boxes(&banner, STATUS, TOLERANCE).is_empty(),
            )
            .expect(
                "the program received only the x typed after the middle click",
                received == b"x",
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&received))?
            .observed("PRIMARY requests served", served)
    })?;

    cases.check(native, Case::ReleaseOverAnotherTerminalKeepsClipboard, |native| {
        let other = Terminal::bind(native, second.as_ref().context("no second terminal")?)?;
        let verifier = native.clipboard()?.window();
        terminal.focus(native)?;
        terminal.echoed(native, "printf '\\033[2J\\033[H%s%s\\n' STALE WORD")?;
        native.press(Key::Return)?;
        terminal.shows(native, "STALEWORD")?;
        native.clipboard()?.own(SENTINEL)?;
        let (start, end) = (terminal.cell(native, 0, 0)?, terminal.cell(native, 8, 0)?);
        native.drag_between(&terminal.target(), centre(start), centre(end))?;
        poll(EXPECTATION, LOOK, true, || {
            Ok((native.clipboard()?.owner()? != Some(verifier)).then_some(()))
        })?;
        let first = native.clipboard()?.read()?;
        other.focus(native)?;
        native.clipboard()?.own(SENTINEL)?;
        native.clipboard()?.own_in(Owned::Primary, SENTINEL)?;
        let held = native.clipboard()?.exchanges()?.len();
        native.drag(&other.target(), &terminal.target())?;
        let _ = poll(EXPECTATION, LOOK, true, || {
            Ok((native.clipboard()?.owner()? != Some(verifier)).then_some(()))
        });
        let clipboard = native.clipboard()?.read()?;
        let primary = native.clipboard()?.read_in(Owned::Primary)?;
        let exchanges = native.clipboard()?.exchanges()?;
        Verdict::new()
            .expect(
                "the first drag in the first terminal copied text of its own",
                matches!(&first, Reading::Text(text) if text.starts_with("STALEWO")),
            )
            .expect(
                "after a drag that starts in the second terminal and is released over the first, CLIPBOARD does not hold the first terminal's older selection",
                clipboard != first,
            )
            .expect(
                "after that drag, PRIMARY does not hold the first terminal's older selection",
                primary != first,
            )
            .observed("first copy", &first)?
            .observed("clipboard", &clipboard)?
            .observed("primary", &primary)?
            .observed("exchanges", &exchanges[held..])
    })?;

    cases.check(native, Case::ClickMovesShellCursor, |native| {
        terminal.line(native, "PS1='> '")?;
        terminal.line(native, "printf '\\033[2J\\033[H'")?;
        terminal.echoed(native, SHELL_LINE)?;
        let typed = terminal.settled(native, "click-move-typed", |_| true)?;
        terminal.click_cell(native, SHELL_CLICK, 0)?;
        native.type_text("X")?;
        let moved = terminal.settled(native, "click-move-after-x", |look| {
            changed(&typed, look).is_some()
        })?;
        native.press(Key::Return)?;
        let printed = terminal.printed(native, "\nabXcdef")?;
        let screen = terminal.screen(native)?;
        Verdict::new()
            .expect(
                "after a click on the c of the typed echo abcdef, an X, and Enter, the shell printed abXcdef",
                printed,
            )
            .expect(
                "the shell did not print abcdefX, which is where the X lands without the click",
                !screen.contains("\nabcdefX"),
            )
            .expect(
                "the terminal drew the X inside the typed line",
                changed(&typed, &moved).is_some(),
            )
            .observed("screen", &screen)
    })?;

    cases.check(native, Case::ClickMovesComposerCursor, |native| {
        let probe = Probe::new(native, "composer", "line")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        let before = terminal.settled(native, "composer-before", |_| true)?;
        terminal.click_cell(native, composer_column(3), COMPOSER_ROW)?;
        let expected = LEFT.repeat(4);
        let received = probe.received(&expected)?;
        native.type_text("X")?;
        let typed = probe.received(&[expected.as_slice(), b"X"].concat())?;
        terminal.settled(native, "composer", |look| changed(&before, look).is_some())?;
        let line = state(&probe.path)?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "a click on the c of ab界cdef made the line-reading program receive four ESC[D and nothing else",
                received == expected,
            )
            .expect(
                "an X typed after the click went in before the c, as ab界Xcdef with its cursor after the X",
                typed.ends_with(b"X")
                    && line["text"] == "ab界Xcdef"
                    && line["cursor"] == 4,
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&typed))?
            .observed("line", &line)
    })?;

    cases.check(native, Case::ClickCountsCharacters, |native| {
        let probe = Probe::new(native, "characters", "line")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        let characters = COMPOSER.chars().count();
        terminal.click_cell(native, composer_column(0), COMPOSER_ROW)?;
        let left = LEFT.repeat(characters);
        let first = probe.received(&left)?;
        let at_start = state(&probe.path)?["cursor"].clone();
        terminal.click_cell(native, composer_column(3), COMPOSER_ROW)?;
        let expected = [left.as_slice(), &RIGHT.repeat(3)].concat();
        let second = probe.received(&expected)?;
        let line = state(&probe.path)?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "a click on the a of ab界cdef sent seven ESC[D, one per character, not eight, one per cell",
                first == left && at_start == 0,
            )
            .expect(
                "a click on the c from there sent three ESC[C, one per character that it passes, not four",
                second == expected && line["cursor"] == 3,
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&second))?
            .observed("line", &line)
    })?;

    cases.check(native, Case::ClickAboveCursorSendsNothing, |native| {
        let probe = Probe::new(native, "above", "line")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        terminal.click_cell(native, 6, 0)?;
        terminal.click_cell(native, composer_column(3), COMPOSER_ROW - 1)?;
        let silent = probe.received(&[])?;
        terminal.click_cell(native, composer_column(3), COMPOSER_ROW)?;
        let expected = LEFT.repeat(4);
        let moved = probe.received(&expected)?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "clicks on the rows above the composer's cursor row sent the program no byte",
                silent.is_empty(),
            )
            .expect(
                "a click on the composer's row afterwards sent four ESC[D, so the program was able to receive arrows",
                moved == expected,
            )
            .expect(ENDED, ended)
            .observed("received after the clicks above", escaped(&silent))?
            .observed("received after the click on the row", escaped(&moved))
    })?;

    cases.check(native, Case::ClickUnderMouseTrackingSendsNothing, |native| {
        let probe = Probe::new(native, "tracking", "line --mouse-tracking")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        terminal.click_cell(native, composer_column(3), COMPOSER_ROW)?;
        let silent = probe.received(&[])?;
        native.type_text("X")?;
        let typed = probe.received(b"X")?;
        let line = state(&probe.path)?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "a click on the composer's cursor row while the program tracked the mouse sent no arrow byte",
                silent.is_empty(),
            )
            .expect(
                "the program was alive, and the X typed afterwards went in at the end of ab界cdef",
                typed == b"X" && line["text"] == "ab界cdefX",
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&typed))?
            .observed("line", &line)
    })?;

    cases.check(native, Case::ClickInAlternateScreenSendsNothing, |native| {
        let probe = Probe::new(native, "alternate", "keys")?;
        probe.type_command(native, &terminal)?;
        probe.ready(native, &terminal)?;
        terminal.click_cell(native, 1, 0)?;
        let silent = probe.received(&[])?;
        native.type_text("x")?;
        let typed = probe.received(b"x")?;
        let ended = probe.end(native)?;
        Verdict::new()
            .expect(
                "a click on the cursor's row in the alternate screen sent the program no byte",
                silent.is_empty(),
            )
            .expect(
                "the program was alive, and received the x typed after the click",
                typed == b"x",
            )
            .expect(ENDED, ended)
            .observed("received", escaped(&typed))
    })
}

fn served_to_others(exchanges: &[Exchange], verifier: u32, selection: Owned) -> usize {
    exchanges
        .iter()
        .filter(|exchange| {
            matches!(exchange, Exchange::Served { selection: served, target, requestor, .. }
                if *served == selection && target == TEXT_TARGET && *requestor != verifier)
        })
        .count()
}

fn paste(
    native: &mut Native,
    terminal: &Terminal,
    probe: &Probe,
    expected: &[u8],
) -> Result<Paste> {
    probe.ready(native, terminal)?;
    let verifier = native.clipboard()?.window();
    let held = native.clipboard()?.exchanges()?.len();
    native.press(Key::Char('v').ctrl().shift())?;
    let received = probe.received(expected)?;
    let served = served_to_others(
        &native.clipboard()?.exchanges()?[held..],
        verifier,
        Owned::Clipboard,
    );
    let ended = probe.end(native)?;
    Ok(Paste {
        received,
        served,
        ended,
    })
}

fn grew(before: &Lines, after: &Lines) -> bool {
    !before.is_empty() && after.count() >= before.count() + 2
}

fn flooding(foreground: &str) -> bool {
    matches!(foreground, "yes" | "timeout")
}

fn highlight(colours: &BTreeSet<[u8; 3]>) -> Option<[u8; 3]> {
    let first = *colours.first()?;
    let near = |wanted: [u8; 3], seen: &[u8; 3]| {
        seen.iter()
            .zip(wanted)
            .all(|(seen, wanted)| seen.abs_diff(wanted) <= TOLERANCE)
    };
    (colours.iter().all(|seen| near(first, seen)) && !near(COPY, &first)).then_some(first)
}

fn gridded(origin: (i16, i16), first: Geometry, second: Geometry) -> bool {
    let [addressed, other] = &BLOCKS;
    let cells = addressed.text.len() as i32;
    let (width, height) = (i32::from(first.width), i32::from(first.height));
    let near = |seen: i32, wanted: i32, by: i32| (seen - wanted).abs() <= by;
    let apart = |from: (i16, i16), to: Geometry, columns: u16, rows: u16| {
        near(
            (i32::from(to.x) - i32::from(from.0)) * cells,
            i32::from(columns) * width,
            3 * cells,
        ) && near(
            i32::from(to.y) - i32::from(from.1),
            i32::from(rows) * height,
            2,
        )
    };
    near(i32::from(second.width), width, 2)
        && near(i32::from(second.height), height, 2)
        && apart(origin, first, addressed.column - 1, addressed.row - 1)
        && apart(
            (first.x, first.y),
            second,
            other.column - addressed.column,
            other.row - addressed.row,
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cell(column: i16, row: i16) -> Geometry {
        Geometry {
            x: 482 + (column - 1) * 16,
            y: 174 + (row - 1) * 36,
            width: 96,
            height: 36,
        }
    }

    #[test]
    fn two_blocks_share_a_grid_only_at_the_addressed_distance() {
        let [first, second] = &BLOCKS;
        let origin = (482, 174);
        let at = |block: &crate::probe::Block| cell(block.column as i16, block.row as i16);
        assert!(gridded(origin, at(first), at(second)));
        let nudged = |x: i16, y: i16| Geometry {
            x: at(second).x + x,
            y: at(second).y + y,
            ..at(second)
        };
        assert!(gridded(origin, at(first), nudged(3, 2)));
        assert!(
            !gridded(origin, at(first), nudged(16, 0)),
            "one column too far"
        );
        assert!(
            !gridded(origin, at(first), nudged(0, 36)),
            "one row too low"
        );
        let wider = Geometry {
            width: 112,
            ..at(second)
        };
        assert!(!gridded(origin, at(first), wider), "a wider block");
        assert!(
            !gridded(origin, at(second), at(first)),
            "in the other order"
        );
        assert!(
            !gridded((482 + 16, 174), at(first), at(second)),
            "both blocks one column left of where the program addressed them"
        );
        assert!(
            !gridded((482, 174 - 36), at(first), at(second)),
            "both blocks one row below where the program addressed them"
        );
    }

    #[test]
    fn a_highlight_is_one_colour_other_than_the_plain_one() {
        let colours = |found: &[[u8; 3]]| found.iter().copied().collect::<BTreeSet<_>>();
        assert_eq!(highlight(&colours(&[[55, 117, 101]])), Some([55, 117, 101]));
        assert_eq!(
            highlight(&colours(&[[55, 117, 102], [55, 117, 101]])),
            Some([55, 117, 101])
        );
        assert_eq!(highlight(&colours(&[[55, 117, 101], [55, 117, 103]])), None);
        assert_eq!(highlight(&colours(&[COPY])), None);
        assert_eq!(highlight(&colours(&[[25, 159, 96]])), None);
        assert_eq!(highlight(&colours(&[[55, 117, 101], COPY])), None);
        assert_eq!(highlight(&colours(&[])), None);
    }

    #[test]
    fn new_lines_are_two_more_than_a_drawn_prompt() {
        let lines = |count: usize| {
            let stride = 8 * 4;
            let mut bgrx = vec![20_u8; stride * 40];
            for line in 0..count {
                bgrx[(line * 4 + 1) * stride..(line * 4 + 2) * stride].fill(200);
            }
            let region = Geometry {
                x: 0,
                y: 0,
                width: 8,
                height: 40,
            };
            Lines::of(&Pixels::new(region, bgrx))
        };
        assert!(grew(&lines(1), &lines(3)));
        assert!(!grew(&lines(1), &lines(2)));
        assert!(!grew(&lines(0), &lines(3)), "no prompt was drawn before");
    }

    #[test]
    fn only_the_flood_programs_count_as_flooding() {
        assert!(flooding("yes") && flooding("timeout"));
        assert!(!flooding("bash") && !flooding(""));
    }
}
