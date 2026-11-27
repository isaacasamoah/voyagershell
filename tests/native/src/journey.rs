mod adopt_by_label;
mod agent_split;
mod arrangement;
mod avatar_drag;
mod canvas_stack;
mod chat;
mod core_events;
mod daily_start;
mod home_create;
mod input;
mod layout;
mod layout_compat;
mod layout_corrupt;
mod layout_refused;
mod manifest_vessel;
mod outcomes;
mod portals;
mod profile;
mod profile_updates;
mod quit_restore;
mod scrolling;
mod slow_list;
mod slow_save;
mod socket_dock;
mod terminal_agent;
mod voice;
mod voice_talk_over;
mod voyage_close;
mod voyager_command;
mod workspace;
mod worktrees;

use crate::native::{Native, Sidebar, TalkOver};
use crate::system::save;
use anyhow::{Context as _, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::marker::PhantomData;
use std::path::PathBuf;

pub trait Case: Copy + 'static {
    const NAMES: &'static [&'static str];
    const SETUP: &'static [&'static str];
    const NEEDS: &'static [(&'static str, &'static str)];
    fn name(self) -> &'static str;
}

macro_rules! cases {
    (@setup setup $name:literal) => {
        $name
    };
    ($($variant:ident => $name:literal $($setup:ident)?),+ $(,)? $(; $($later:literal needs $earlier:literal),+ $(,)?)?) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq)]
        pub enum Case {
            $($variant),+
        }

        impl crate::journey::Case for Case {
            const NAMES: &'static [&'static str] = &[$($name),+];
            const SETUP: &'static [&'static str] = &[$($($crate::journey::cases!(@setup $setup $name),)?)+];
            const NEEDS: &'static [(&'static str, &'static str)] = &[$($(($later, $earlier),)+)?];

            fn name(self) -> &'static str {
                match self {
                    $(Case::$variant => $name),+
                }
            }
        }
    };
}
pub(crate) use cases;

macro_rules! journeys {
    ($(
        $variant:ident => $name:literal in $module:ident,
        sidebar: $sidebar:expr,
        window: $window:expr
    );+ $(;)?) => {
        #[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
        pub enum Journey {
            $(#[serde(rename = $name)] $variant),+
        }

        impl Journey {
            pub const ALL: &'static [Journey] = &[$(Journey::$variant),+];

            pub fn name(self) -> &'static str {
                match self {
                    $(Journey::$variant => $name),+
                }
            }

            pub fn cases(self) -> &'static [&'static str] {
                match self {
                    $(Journey::$variant => <$module::Case as Case>::NAMES),+
                }
            }

            pub fn setup(self) -> &'static [&'static str] {
                match self {
                    $(Journey::$variant => <$module::Case as Case>::SETUP),+
                }
            }

            pub fn needs(self) -> &'static [(&'static str, &'static str)] {
                match self {
                    $(Journey::$variant => <$module::Case as Case>::NEEDS),+
                }
            }

            pub fn control(self) -> &'static str {
                match self {
                    $(Journey::$variant => $module::CONTROL.name()),+
                }
            }

            pub fn sidebar(self) -> Option<Sidebar> {
                match self {
                    $(Journey::$variant => $sidebar),+
                }
            }

            pub fn window(self) -> Option<(u16, u16)> {
                match self {
                    $(Journey::$variant => $window),+
                }
            }

            pub fn drive(self, native: &mut Native, outcomes: &mut Outcomes) -> Result<()> {
                match self {
                    $(Journey::$variant => {
                        $module::drive(native, &mut Cases::<$module::Case>::over(outcomes))
                    }),+
                }
            }
        }
    };
}

journeys! {
    TerminalScrolling => "terminal-scrolling" in scrolling, sidebar: None, window: None;
    Workspace => "workspace" in workspace, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    QuitRestore => "quit-restore" in quit_restore, sidebar: None, window: None;
    VoyageClose => "voyage-close" in voyage_close, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    Arrangement => "arrangement" in arrangement, sidebar: Some(Sidebar::Open), window: None;
    Portals => "portals" in portals, sidebar: Some(Sidebar::Open), window: Some((1800, 1000));
    Chat => "chat" in chat, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    TerminalInput => "terminal-input" in input, sidebar: None, window: None;
    Profile => "profile" in profile, sidebar: None, window: None;
    ProfileUpdates => "profile-updates" in profile_updates, sidebar: None, window: None;
    LayoutCompat => "layout-compat" in layout_compat, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    LayoutRefused => "layout-refused" in layout_refused, sidebar: None, window: None;
    LayoutCorrupt => "layout-corrupt" in layout_corrupt, sidebar: None, window: None;
    SlowSave => "slow-save" in slow_save, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    Outcomes => "outcomes" in outcomes, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    CoreEvents => "core-events" in core_events, sidebar: None, window: None;
    SlowList => "slow-list" in slow_list, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    AdoptByLabel => "adopt-by-label" in adopt_by_label, sidebar: Some(Sidebar::Open), window: Some((1800, 1000));
    SocketDock => "socket-dock" in socket_dock, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    AgentSplit => "agent-split" in agent_split, sidebar: Some(Sidebar::Open), window: Some((1800, 1000));
    TerminalAgent => "terminal-agent" in terminal_agent, sidebar: Some(Sidebar::Open), window: Some((1800, 1000));
    HomeCreate => "home-create" in home_create, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    Worktrees => "worktrees" in worktrees, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    ManifestVessel => "manifest-vessel" in manifest_vessel, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    CanvasStack => "canvas-stack" in canvas_stack, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    Voice => "voice" in voice, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    VoyagerCommand => "voyager-command" in voyager_command, sidebar: None, window: None;
    AvatarDrag => "avatar-drag" in avatar_drag, sidebar: Some(Sidebar::Open), window: Some((1800, 1000));
    VoiceTalkOver => "voice-talk-over" in voice_talk_over, sidebar: Some(Sidebar::Open), window: Some((1180, 1000));
    DailyStart => "daily-start" in daily_start, sidebar: None, window: None;
}

impl Journey {
    pub fn names() -> Vec<&'static str> {
        Self::ALL.iter().map(|journey| journey.name()).collect()
    }

    pub fn parse(name: &str) -> Result<Self> {
        match Self::ALL.iter().find(|journey| journey.name() == name) {
            Some(journey) => Ok(*journey),
            None => bail!(
                "Journey {name} has not migrated to Rust; the native journeys are {}",
                Self::names().join(", ")
            ),
        }
    }

    pub fn beside_command(self) -> bool {
        !matches!(self, Self::VoyagerCommand)
    }

    pub fn installs(self) -> bool {
        matches!(self, Self::DailyStart)
    }

    pub fn traces_tools(self) -> bool {
        matches!(self, Self::AvatarDrag)
    }

    pub fn select(self, names: &[String]) -> Result<Selection> {
        let cases = self.cases();
        let mut picked: Vec<&'static str> = Vec::new();
        for name in names {
            let Some(case) = cases.iter().find(|case| **case == name.as_str()) else {
                bail!(
                    "Case {name} is not a case of the {} journey; its cases are {}",
                    self.name(),
                    cases.join(", ")
                );
            };
            ensure!(!picked.contains(case), "Case {name} is named twice");
            picked.push(case);
        }
        if picked.is_empty() {
            return Ok(Selection::full(self));
        }
        let mut wanted: Vec<&'static str> = picked.clone();
        wanted.extend(self.setup());
        while let Some(earlier) = self
            .needs()
            .iter()
            .find(|(later, earlier)| wanted.contains(later) && !wanted.contains(earlier))
            .map(|(_, earlier)| *earlier)
        {
            wanted.push(earlier);
        }
        let ordered = |keep: &dyn Fn(&&'static str) -> bool| -> Vec<&'static str> {
            cases.iter().filter(|case| keep(case)).copied().collect()
        };
        let left_out = ordered(&|case| !wanted.contains(case));
        Ok(Selection {
            partial: !left_out.is_empty(),
            picked: ordered(&|case| picked.contains(case)),
            included: ordered(&|case| wanted.contains(case) && !picked.contains(case)),
            left_out,
        })
    }

    pub fn core_delay(self) -> Option<&'static str> {
        match self {
            Self::SlowSave => Some(slow_save::HOLD),
            Self::Outcomes => Some(outcomes::HOLD),
            Self::SlowList => Some(slow_list::HOLD),
            Self::HomeCreate => Some(home_create::HOLD),
            Self::SocketDock => Some(socket_dock::HOLD),
            Self::AvatarDrag => Some(avatar_drag::WATCH),
            _ => None,
        }
    }

    pub fn talk_over(self) -> Option<TalkOver> {
        match self {
            Self::VoiceTalkOver => Some(TalkOver::On),
            _ => None,
        }
    }

    pub fn control_patch(self) -> String {
        format!("tests/native/controls/{}.patch", self.name())
    }

    pub fn listing() -> Value {
        Self::ALL
            .iter()
            .map(|journey| {
                json!({"journey":journey,"cases":journey.cases(),"sidebar":journey.sidebar(),"smallestWindow":journey.window(),"coreDelay":journey.core_delay(),"talkOver":journey.talk_over(),"control":{"case":journey.control(),"patch":journey.control_patch()}})
            })
            .collect()
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Selection {
    partial: bool,
    picked: Vec<&'static str>,
    included: Vec<&'static str>,
    #[serde(rename = "leftOut")]
    left_out: Vec<&'static str>,
}

impl Selection {
    pub fn full(journey: Journey) -> Self {
        Self {
            partial: false,
            picked: journey.cases().to_vec(),
            included: Vec::new(),
            left_out: Vec::new(),
        }
    }

    pub fn summary(&self) -> Option<String> {
        self.partial.then(|| {
            let count = self.left_out.len();
            format!(
                "PARTIAL: {count} {} left out, not a journey pass. Left out: {}",
                if count == 1 { "case" } else { "cases" },
                self.left_out.join(", ")
            )
        })
    }
}

#[derive(Default, Serialize)]
pub struct Verdict {
    expectations: Vec<Expectation>,
    observed: Map<String, Value>,
}

#[derive(Serialize)]
struct Expectation {
    expected: &'static str,
    held: bool,
}

impl Verdict {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn expect(mut self, expected: &'static str, held: bool) -> Self {
        self.expectations.push(Expectation { expected, held });
        self
    }

    pub fn observed(mut self, name: &'static str, value: impl Serialize) -> Result<Self> {
        let value = serde_json::to_value(value)
            .with_context(|| format!("The observed value {name} cannot be recorded"))?;
        self.observed.insert(name.into(), value);
        Ok(self)
    }

    pub fn passed(&self) -> bool {
        !self.expectations.is_empty() && self.expectations.iter().all(|item| item.held)
    }

    pub fn first_unmet(&self) -> Option<&'static str> {
        self.expectations
            .iter()
            .find(|item| !item.held)
            .map(|item| item.expected)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum Status {
    Passed,
    Failed,
    Interrupted,
    Skipped,
    LeftOut,
}

#[derive(Serialize)]
struct Outcome {
    case: &'static str,
    status: Status,
    #[serde(flatten)]
    verdict: Verdict,
}

pub struct Outcomes {
    cases: Vec<Outcome>,
    path: PathBuf,
    selection: Selection,
}

impl Outcomes {
    pub fn new(journey: Journey, path: PathBuf, selection: Selection) -> Self {
        let cases = journey
            .cases()
            .iter()
            .map(|case| Outcome {
                case,
                status: if selection.left_out.contains(case) {
                    Status::LeftOut
                } else {
                    Status::Skipped
                },
                verdict: Verdict::new(),
            })
            .collect();
        Self {
            cases,
            path,
            selection,
        }
    }

    pub fn selection(&self) -> &Selection {
        &self.selection
    }

    pub fn passed(&self) -> bool {
        self.cases
            .iter()
            .all(|case| matches!(case.status, Status::Passed | Status::LeftOut))
    }

    pub fn unrun_message(&self, case: &str) -> String {
        if !self.selection.partial {
            return format!("The driver ended without running the declared case {case}");
        }
        let earlier: Vec<&str> = self
            .cases
            .iter()
            .take_while(|outcome| outcome.case != case)
            .filter(|outcome| outcome.status == Status::LeftOut)
            .map(|outcome| outcome.case)
            .collect();
        format!(
            "The picked case {case} did not run. It probably needs an earlier case that was left out ({}). Declare the dependency with needs in the journey, or pick that case too.",
            earlier.join(", ")
        )
    }

    pub fn unrun(&self) -> Option<&'static str> {
        let ended = |case: &Outcome| matches!(case.status, Status::Failed | Status::Interrupted);
        if self.cases.iter().any(ended) {
            return None;
        }
        self.next().map(|index| self.cases[index].case)
    }

    pub fn interrupted(&self) -> Option<&'static str> {
        self.cases
            .iter()
            .find(|case| case.status == Status::Interrupted)
            .map(|case| case.case)
    }

    pub fn first_failure(&self) -> Option<Value> {
        let failed = self
            .cases
            .iter()
            .find(|case| case.status == Status::Failed)?;
        let unmet = failed.verdict.first_unmet()?;
        Some(
            json!({"check":failed.case,"blame":"product","detail":format!("The product did not meet the expectation: {unmet}"),"observed":failed.verdict.observed}),
        )
    }

    pub fn save(&self, error: Option<&str>) -> Result<()> {
        save(
            &self.path,
            &json!({"cases":self.cases,"selection":self.selection,"error":error}),
        )
    }

    fn failed(&self) -> bool {
        self.cases.iter().any(|case| case.status == Status::Failed)
    }

    fn next(&self) -> Option<usize> {
        self.cases
            .iter()
            .position(|outcome| outcome.status == Status::Skipped)
    }

    fn open(&self, case: &'static str) -> Result<Option<usize>> {
        ensure!(
            self.interrupted().is_none(),
            "Case {case} ran after an interrupted case"
        );
        if self.failed() {
            return Ok(None);
        }
        if self
            .cases
            .iter()
            .any(|outcome| outcome.case == case && outcome.status == Status::LeftOut)
        {
            return Ok(None);
        }
        match self.next() {
            Some(index) if self.cases[index].case == case => Ok(Some(index)),
            Some(index) => bail!(
                "Case {case} ran out of the declared order; {} comes next",
                self.cases[index].case
            ),
            None => bail!("Case {case} ran after every declared case had run"),
        }
    }

    fn close(&mut self, index: usize, verdict: Option<Verdict>) -> Result<()> {
        let outcome = &mut self.cases[index];
        outcome.status = match &verdict {
            Some(verdict) if verdict.passed() => Status::Passed,
            Some(verdict) if verdict.first_unmet().is_some() => Status::Failed,
            _ => Status::Interrupted,
        };
        let judged = outcome.status != Status::Interrupted;
        if let Some(verdict) = verdict {
            outcome.verdict = verdict;
            ensure!(
                judged,
                "The case {} stated no expectation, so it judged nothing",
                outcome.case
            );
        }
        Ok(())
    }
}

pub struct Cases<'a, C: Case> {
    outcomes: &'a mut Outcomes,
    case: PhantomData<C>,
}

impl<'a, C: Case> Cases<'a, C> {
    fn over(outcomes: &'a mut Outcomes) -> Self {
        Self {
            outcomes,
            case: PhantomData,
        }
    }

    pub fn check(
        &mut self,
        native: &mut Native,
        case: C,
        run: impl FnOnce(&mut Native) -> Result<Verdict>,
    ) -> Result<()> {
        self.make(native, case, |native| Ok((run(native)?, Some(()))))
            .map(drop)
    }

    pub fn make<T>(
        &mut self,
        native: &mut Native,
        case: C,
        run: impl FnOnce(&mut Native) -> Result<(Verdict, Option<T>)>,
    ) -> Result<Option<T>> {
        let name = case.name();
        let Some(index) = self.outcomes.open(name)? else {
            return Ok(None);
        };
        native.system.record(json!({"event":"case","case":name}))?;
        let judged = run(native).and_then(|(verdict, made)| {
            ensure!(
                verdict.passed() || !native.halted(),
                "The candidate was not running when the case {name} judged it"
            );
            Ok((verdict, made))
        });
        let finished = match judged {
            Ok((verdict, made)) => {
                let passed = verdict.passed();
                self.outcomes
                    .close(index, Some(verdict))
                    .map(|()| made.filter(|_| passed))
            }
            Err(error) => self.outcomes.close(index, None).and(Err(error)),
        };
        let saved = self.outcomes.save(None);
        let made = finished?;
        match saved.and_then(|()| native.keep_window(&format!("case-{name}"))) {
            Err(error) if self.outcomes.failed() => native
                .system
                .record(json!({"event":"unkept","case":name,"error":format!("{error:#}")}))
                .map(|()| made),
            kept => kept.map(|()| made),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::Cause;
    use std::collections::BTreeSet;
    use std::path::Path;
    use std::process::Command;

    const JOURNEY: Journey = Journey::TerminalScrolling;

    mod declared {
        cases! {
            Open => "open" setup,
            Judged => "judged",
            Seeded => "seeded" setup,
        }
    }

    #[test]
    fn setup_cases_are_declared_beside_their_names() {
        use declared::Case as Declared;
        assert_eq!(Declared::NAMES, ["open", "judged", "seeded"]);
        assert_eq!(Declared::SETUP, ["open", "seeded"]);
        let names = [Declared::Open, Declared::Judged, Declared::Seeded].map(Case::name);
        assert_eq!(names, Declared::NAMES);
    }

    fn outcomes() -> Outcomes {
        Outcomes::new(JOURNEY, PathBuf::from("unsaved"), Selection::full(JOURNEY))
    }

    fn judge(outcomes: &mut Outcomes, case: &'static str, verdict: Option<Verdict>) -> Result<()> {
        match outcomes.open(case)? {
            Some(index) => outcomes.close(index, verdict),
            None => Ok(()),
        }
    }

    fn held() -> Option<Verdict> {
        Some(Verdict::new().expect("it held", true))
    }

    fn statuses(outcomes: &Outcomes) -> Vec<String> {
        let saved = serde_json::to_value(&outcomes.cases).expect("serializable outcomes");
        saved
            .as_array()
            .expect("a list of cases")
            .iter()
            .map(|case| {
                format!(
                    "{}:{}",
                    case["case"].as_str().unwrap(),
                    case["status"].as_str().unwrap()
                )
            })
            .collect()
    }

    #[test]
    fn journey_names_and_case_names_are_unique() {
        let names: BTreeSet<_> = Journey::names().into_iter().collect();
        assert_eq!(names.len(), Journey::ALL.len());
        for journey in Journey::ALL {
            let cases: BTreeSet<_> = journey.cases().iter().collect();
            assert_eq!(cases.len(), journey.cases().len(), "{}", journey.name());
            assert_eq!(Journey::parse(journey.name()).unwrap(), *journey);
        }
        let refusal = Journey::parse("imaginary").unwrap_err().to_string();
        assert!(refusal.contains("imaginary") && refusal.contains(JOURNEY.name()));
    }

    #[test]
    fn only_the_talk_over_journey_launches_the_app_with_talk_over_on() {
        for journey in Journey::ALL {
            let wanted = (*journey == Journey::VoiceTalkOver).then_some(TalkOver::On);
            assert_eq!(journey.talk_over(), wanted, "{}", journey.name());
        }
        assert_eq!(
            (TalkOver::VARIABLE, TalkOver::On.value()),
            ("VOYAGER_VOICE_TALK_OVER", "on")
        );
    }

    #[test]
    fn every_control_patch_still_applies() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let patches = Journey::ALL
            .iter()
            .map(|journey| journey.control_patch())
            .chain([
                "tests/native/controls/frame-stall.patch".to_owned(),
                "tests/native/controls/socket-dock-home.patch".to_owned(),
                "tests/native/controls/avatar-click-home.patch".to_owned(),
                "tests/native/controls/avatar-click-away.patch".to_owned(),
                "tests/native/controls/avatar-click-parked.patch".to_owned(),
                "tests/native/controls/avatar-click-portal.patch".to_owned(),
                "tests/native/controls/avatar-click-wait.patch".to_owned(),
                "tests/native/controls/dock-home-view.patch".to_owned(),
                "tests/native/controls/avatar-home-prepare.patch".to_owned(),
                "tests/native/controls/home-notice-dropped.patch".to_owned(),
                "tests/native/controls/voice-handoff.patch".to_owned(),
                "tests/native/controls/voice-hearing.patch".to_owned(),
                "tests/native/controls/voice-quiet.patch".to_owned(),
                "tests/native/controls/voice-floor-wait.patch".to_owned(),
                "tests/native/controls/voice-room.patch".to_owned(),
                "tests/native/controls/voice-speak.patch".to_owned(),
                "tests/native/controls/voice-turn.patch".to_owned(),
                "tests/native/controls/voice-first-paragraph.patch".to_owned(),
                "tests/native/controls/voice-reply-marker.patch".to_owned(),
                "tests/native/controls/agent-resize.patch".to_owned(),
                "tests/native/controls/agent-plain.patch".to_owned(),
                "tests/native/controls/terminal-agent-created.patch".to_owned(),
                "tests/native/controls/agent-person-plain.patch".to_owned(),
                "tests/native/controls/voice-click-cuts.patch".to_owned(),
                "tests/native/controls/voice-mic-reopens.patch".to_owned(),
                "tests/native/controls/voice-sentences.patch".to_owned(),
                "tests/native/controls/voice-comma.patch".to_owned(),
                "tests/native/controls/voice-limit.patch".to_owned(),
                "tests/native/controls/voice-numbers.patch".to_owned(),
                "tests/native/controls/voice-streams.patch".to_owned(),
                "tests/native/controls/voice-chat-off.patch".to_owned(),
                "tests/native/controls/voice-chat-promise.patch".to_owned(),
                "tests/native/controls/voice-ack-ignored.patch".to_owned(),
                "tests/native/controls/voice-ack-drop.patch".to_owned(),
                "tests/native/controls/voice-offer-off.patch".to_owned(),
                "tests/native/controls/voice-kept-clip.patch".to_owned(),
                "tests/native/controls/voice-trim-late.patch".to_owned(),
                "tests/native/controls/agent-keeps-maximize-clears.patch".to_owned(),
                "tests/native/controls/agent-voyager-keeps.patch".to_owned(),
                "tests/native/controls/agent-keep-hides-piece.patch".to_owned(),
                "tests/native/controls/voice-talk-over-auto.patch".to_owned(),
                "tests/native/controls/voice-backchannel.patch".to_owned(),
                "tests/native/controls/voice-cut-off.patch".to_owned(),
                "tests/native/controls/voice-stop.patch".to_owned(),
                "tests/native/controls/canvas-stack-created.patch".to_owned(),
                "tests/native/controls/canvas-stack-folder.patch".to_owned(),
                "tests/native/controls/canvas-stack-applied.patch".to_owned(),
                "tests/native/controls/canvas-stack-inspected.patch".to_owned(),
                "tests/native/controls/canvas-stack-kept.patch".to_owned(),
                "tests/native/controls/canvas-stack-quit.patch".to_owned(),
                "tests/native/controls/canvas-stack-reopened.patch".to_owned(),
                "tests/native/controls/canvas-stack-untouched.patch".to_owned(),
                "tests/native/controls/canvas-stack-once.patch".to_owned(),
                "tests/native/controls/daily-start-installed.patch".to_owned(),
                "tests/native/controls/daily-start-update.patch".to_owned(),
                "tests/native/controls/daily-start-focus.patch".to_owned(),
                "tests/native/controls/daily-start-rollback.patch".to_owned(),
                "tests/native/controls/daily-start-counter.patch".to_owned(),
                "tests/native/controls/profile-updates-kept-edit.patch".to_owned(),
                "tests/native/controls/profile-updates-failed-standard.patch".to_owned(),
                "tests/native/controls/core-events-unreported-idle.patch".to_owned(),
                "tests/native/controls/core-events-reported-decays.patch".to_owned(),
                "tests/native/controls/tool-call-round-trip.patch".to_owned(),
                "tests/native/controls/tool-call-round-trip-slow.patch".to_owned(),
                "tests/native/controls/dock-with-no-chosen-behaviour-adds-no-model-work.patch"
                    .to_owned(),
                "tests/native/controls/layouts-load.patch".to_owned(),
            ]);
        for patch in patches {
            let check = Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["apply", "--check", &patch])
                .output()
                .expect("git runs");
            assert!(
                check.status.success(),
                "{patch} no longer applies: {}",
                String::from_utf8_lossy(&check.stderr)
            );
        }
    }

    #[test]
    fn a_verdict_without_expectations_does_not_pass() -> Result<()> {
        assert!(!Verdict::new().passed());
        assert!(!Verdict::new().observed("seen", 1)?.passed());
        assert!(Verdict::new().expect("it held", true).passed());
        Ok(())
    }

    #[test]
    fn a_case_without_expectations_is_a_journey_fault_not_a_product_failure() -> Result<()> {
        let mut outcomes = outcomes();
        let [first, second, ..] = JOURNEY.cases() else {
            bail!("The journey declares fewer than two cases");
        };
        let unjudged = Verdict::new().observed("seen", 1)?;
        let fault =
            judge(&mut outcomes, first, Some(unjudged)).expect_err("An unjudged case closed");
        assert!(fault.to_string().contains(first));
        assert_eq!(outcomes.interrupted(), Some(*first));
        assert!(outcomes.first_failure().is_none() && !outcomes.passed());
        assert_eq!(
            statuses(&outcomes)[..2],
            [format!("{first}:interrupted"), format!("{second}:skipped")]
        );
        Ok(())
    }

    #[test]
    fn an_observed_value_that_cannot_be_recorded_fails_the_case() {
        struct Unrecordable;
        impl Serialize for Unrecordable {
            fn serialize<S: serde::Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
                Err(serde::ser::Error::custom("no shape"))
            }
        }
        let fault = Verdict::new()
            .expect("it held", true)
            .observed("seen", Unrecordable)
            .err()
            .expect("An unrecordable value was stored");
        assert!(format!("{fault:#}").contains("seen") && format!("{fault:#}").contains("no shape"));
    }

    #[test]
    fn a_journey_passes_only_when_every_declared_case_passed_in_order() -> Result<()> {
        let mut outcomes = outcomes();
        assert!(!outcomes.passed() && outcomes.first_failure().is_none());
        let [first, second, rest @ ..] = JOURNEY.cases() else {
            bail!("The journey declares fewer than two cases");
        };
        assert_eq!(outcomes.unrun(), Some(*first));
        assert!(judge(&mut outcomes, second, held()).is_err());
        judge(&mut outcomes, first, held())?;
        assert!(judge(&mut outcomes, first, held()).is_err());
        judge(&mut outcomes, second, held())?;
        assert!(!outcomes.passed());
        for case in rest {
            assert_eq!(outcomes.unrun(), Some(*case));
            judge(&mut outcomes, case, held())?;
        }
        assert!(outcomes.passed() && outcomes.unrun().is_none());
        assert!(judge(&mut outcomes, first, held()).is_err());
        Ok(())
    }

    fn picked(journey: Journey, names: &[&str]) -> Result<Selection> {
        journey.select(
            &names
                .iter()
                .map(|name| (*name).to_owned())
                .collect::<Vec<_>>(),
        )
    }

    #[test]
    fn an_unknown_case_is_refused_naming_the_cases_of_the_journey() {
        let refusal = picked(Journey::SocketDock, &["no-such-case"])
            .unwrap_err()
            .to_string();
        assert!(refusal.contains("no-such-case") && refusal.contains("socket-dock"));
        for case in Journey::SocketDock.cases() {
            assert!(refusal.contains(case), "{refusal}");
        }
    }

    #[test]
    fn no_pick_is_the_full_run_and_a_pick_that_covers_every_case_is_not_partial() -> Result<()> {
        let journey = Journey::SocketDock;
        assert!(!journey.select(&[])?.partial);
        let every: Vec<&str> = journey.cases().to_vec();
        let all = picked(journey, &every)?;
        assert!(!all.partial && all.left_out.is_empty());
        Ok(())
    }

    #[test]
    fn a_picked_case_pulls_in_the_case_it_needs_and_leaves_the_rest_out() -> Result<()> {
        let selection = picked(Journey::SocketDock, &["avatar-click-away-changes-nothing"])?;
        assert!(selection.partial);
        assert_eq!(selection.picked, ["avatar-click-away-changes-nothing"]);
        assert_eq!(
            selection.included,
            [
                "socket-dock-takes-keyboard",
                "avatar-click-at-home-opens-home"
            ]
        );
        assert_eq!(
            selection.left_out.len(),
            Journey::SocketDock.cases().len() - 3
        );
        assert!(!selection.left_out.contains(&"socket-dock-takes-keyboard"));
        Ok(())
    }

    #[test]
    fn a_case_that_uses_the_state_of_earlier_cases_pulls_them_in_when_picked_alone() -> Result<()> {
        let table: &[(Journey, &str, &[&str])] = &[
            (Journey::Workspace, "dock-vessel", &["split-vessel"]),
            (
                Journey::Workspace,
                "avatar-float",
                &["split-vessel", "dock-vessel"],
            ),
            (
                Journey::Workspace,
                "avatar-small",
                &["split-vessel", "dock-vessel", "avatar-float"],
            ),
            (
                Journey::Workspace,
                "create-fleet",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                ],
            ),
            (
                Journey::Workspace,
                "switch-fleet",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                ],
            ),
            (
                Journey::Workspace,
                "fleet-tab-gives-keyboard",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                ],
            ),
            (
                Journey::Workspace,
                "create-voyage",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                ],
            ),
            (
                Journey::Workspace,
                "switch-voyage",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                    "create-voyage",
                ],
            ),
            (
                Journey::Workspace,
                "voyage-switch-gives-keyboard",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                    "create-voyage",
                    "switch-voyage",
                ],
            ),
            (
                Journey::Workspace,
                "fleet-without-input-takes-no-keyboard",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                    "create-voyage",
                    "switch-voyage",
                ],
            ),
            (
                Journey::Workspace,
                "fleet-tab-keeps-chat-keyboard",
                &[
                    "split-vessel",
                    "dock-vessel",
                    "avatar-float",
                    "avatar-small",
                    "create-fleet",
                    "switch-fleet",
                    "create-voyage",
                    "switch-voyage",
                ],
            ),
            (
                Journey::SocketDock,
                "reread-keeps-clicked-pane",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "redock-takes-keyboard",
                &["socket-dock-takes-keyboard", "reread-keeps-clicked-pane"],
            ),
            (
                Journey::SocketDock,
                "typing-right-after-a-dock-reaches-the-vessel",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "dock-home-keeps-keyboard",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "avatar-click-at-home-opens-home",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "avatar-click-while-docking-home-is-held",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "avatar-click-away-changes-nothing",
                &[
                    "socket-dock-takes-keyboard",
                    "avatar-click-at-home-opens-home",
                ],
            ),
            (
                Journey::SocketDock,
                "avatar-click-parked-returns-to-dock",
                &[
                    "socket-dock-takes-keyboard",
                    "avatar-click-at-home-opens-home",
                ],
            ),
            (
                Journey::SocketDock,
                "voyager-creates-and-maximizes",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "tool-call-round-trip",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::SocketDock,
                "dock-with-no-chosen-behaviour-adds-no-model-work",
                &["socket-dock-takes-keyboard"],
            ),
            (
                Journey::Profile,
                "second-build-keeps-voyage",
                &["live-edit-recolours"],
            ),
            (
                Journey::Profile,
                "seeded-core-document-kept",
                &["live-edit-recolours", "second-build-keeps-voyage"],
            ),
            (Journey::Portals, "dock-portal", &["open-portal"]),
            (
                Journey::Portals,
                "portal-across-fleets",
                &["open-portal", "dock-portal"],
            ),
            (
                Journey::Portals,
                "portal-stays-in-its-voyage",
                &["open-portal", "dock-portal", "portal-across-fleets"],
            ),
            (
                Journey::Portals,
                "hide-portals",
                &["open-portal", "dock-portal", "portal-across-fleets"],
            ),
            (
                Journey::Portals,
                "avatar-click-beside-hidden-portals-changes-nothing",
                &[
                    "open-portal",
                    "dock-portal",
                    "portal-across-fleets",
                    "hide-portals",
                ],
            ),
            (
                Journey::Portals,
                "show-portals",
                &[
                    "open-portal",
                    "dock-portal",
                    "portal-across-fleets",
                    "hide-portals",
                ],
            ),
            (
                Journey::Portals,
                "close-portal",
                &[
                    "open-portal",
                    "dock-portal",
                    "portal-across-fleets",
                    "hide-portals",
                    "show-portals",
                ],
            ),
            (
                Journey::Portals,
                "reopen-portal",
                &[
                    "open-portal",
                    "dock-portal",
                    "portal-across-fleets",
                    "hide-portals",
                    "show-portals",
                    "close-portal",
                ],
            ),
            (
                Journey::Portals,
                "relaunch-restores-portal",
                &[
                    "open-portal",
                    "dock-portal",
                    "portal-across-fleets",
                    "hide-portals",
                    "show-portals",
                    "close-portal",
                    "reopen-portal",
                ],
            ),
            (Journey::Chat, "peek-stays-here", &["dock-takes-you-there"]),
            (
                Journey::AgentSplit,
                "voyager-resizes-a-split",
                &["bad-split-places-nothing"],
            ),
            (
                Journey::AgentSplit,
                "agent-resize-refused",
                &["bad-split-places-nothing", "voyager-resizes-a-split"],
            ),
            (
                Journey::AgentSplit,
                "agent-split-keeps-maximize",
                &["bad-split-places-nothing", "voyager-resizes-a-split"],
            ),
            (
                Journey::AgentSplit,
                "new-piece-shows-after-unmaximize",
                &[
                    "bad-split-places-nothing",
                    "voyager-resizes-a-split",
                    "agent-split-keeps-maximize",
                ],
            ),
            (
                Journey::CoreEvents,
                "silent-program-is-unknown",
                &["foreground-reaches-agents-list"],
            ),
            (
                Journey::CoreEvents,
                "report-stays-until-replaced",
                &["foreground-reaches-agents-list"],
            ),
            (
                Journey::AgentSplit,
                "voyager-split-clears-maximize",
                &["bad-split-places-nothing", "voyager-resizes-a-split"],
            ),
            (
                Journey::TerminalInput,
                "a-drag-released-over-another-terminal-does-not-copy-that-terminals-older-selection",
                &["input-reaches-one-terminal-while-another-floods"],
            ),
            (
                Journey::AdoptByLabel,
                "command-fleet-holds-only-its-agent",
                &["command-creates-fleet"],
            ),
            (
                Journey::Arrangement,
                "layout-save-load-then-home",
                &["split-below"],
            ),
        ];
        for (journey, later, earlier) in table {
            let selection = picked(*journey, &[*later])?;
            assert_eq!(
                selection.included,
                *earlier,
                "{}: picking {later}",
                journey.name()
            );
            assert!(
                selection
                    .left_out
                    .iter()
                    .all(|case| !earlier.contains(case))
            );
        }
        for journey in Journey::ALL {
            for (later, _) in journey.needs() {
                assert!(
                    table
                        .iter()
                        .any(|(listed, name, _)| listed == journey && name == later),
                    "{}: the need of {later} has no row in the table",
                    journey.name()
                );
            }
        }
        Ok(())
    }

    #[test]
    fn a_partial_run_says_in_its_summary_that_it_is_not_a_journey_pass() -> Result<()> {
        let journey = Journey::SocketDock;
        let selection = picked(journey, &["avatar-click-away-changes-nothing"])?;
        let summary = selection.summary().expect("a partial run has a summary");
        assert!(
            summary.starts_with(&format!(
                "PARTIAL: {} cases left out, not a journey pass",
                selection.left_out.len()
            )),
            "{summary}"
        );
        for case in &selection.left_out {
            assert!(summary.contains(case), "{summary}");
        }
        for case in selection.picked.iter().chain(&selection.included) {
            assert!(!summary.contains(case), "{summary}");
        }
        assert_eq!(Selection::full(journey).summary(), None);
        let last = journey.cases().len() - 1;
        let almost = journey.cases()[..last].to_vec();
        let one_out = picked(journey, &almost)?;
        assert!(
            one_out.summary().is_some_and(
                |line| line.starts_with("PARTIAL: 1 case left out, not a journey pass")
            )
        );
        Ok(())
    }

    #[test]
    fn the_setup_cases_of_a_journey_run_when_another_case_is_picked_alone() -> Result<()> {
        let journey = Journey::ManifestVessel;
        let setup = journey.setup();
        assert!(!setup.is_empty());
        let last = journey.cases().last().copied().unwrap();
        let selection = picked(journey, &[last])?;
        for case in setup {
            assert!(
                selection.picked.contains(case) || selection.included.contains(case),
                "{case}"
            );
            assert!(!selection.left_out.contains(case), "{case}");
        }
        Ok(())
    }

    #[test]
    fn every_declared_need_names_an_earlier_case_of_its_own_journey() {
        for journey in Journey::ALL {
            let cases = journey.cases();
            for (later, earlier) in journey.needs() {
                let later_at = cases.iter().position(|case| case == later);
                let earlier_at = cases.iter().position(|case| case == earlier);
                assert!(
                    matches!((later_at, earlier_at), (Some(l), Some(e)) if e < l),
                    "{}: {later} needs {earlier}",
                    journey.name()
                );
            }
        }
    }

    #[test]
    fn left_out_cases_are_skipped_in_order_and_the_partial_run_says_what_ran() -> Result<()> {
        let journey = Journey::SocketDock;
        let selection = picked(journey, &["typing-right-after-a-dock-reaches-the-vessel"])?;
        let mut outcomes = Outcomes::new(journey, PathBuf::from("unsaved"), selection);
        for case in journey.cases() {
            judge(&mut outcomes, case, held())?;
        }
        assert!(outcomes.passed() && outcomes.unrun().is_none());
        let statuses = statuses(&outcomes);
        assert_eq!(statuses[0], "socket-dock-takes-keyboard:passed");
        assert_eq!(statuses[1], "reread-keeps-clicked-pane:left-out");
        assert_eq!(statuses[2], "redock-takes-keyboard:left-out");
        assert_eq!(
            statuses[3],
            "typing-right-after-a-dock-reaches-the-vessel:passed"
        );
        let saved = serde_json::to_value(outcomes.selection())?;
        assert_eq!(saved["partial"], true);
        assert_eq!(
            saved["picked"],
            json!(["typing-right-after-a-dock-reaches-the-vessel"])
        );
        assert_eq!(saved["included"], json!(["socket-dock-takes-keyboard"]));
        assert_eq!(
            saved["leftOut"].as_array().map(Vec::len),
            Some(journey.cases().len() - 2)
        );
        Ok(())
    }

    #[test]
    fn a_picked_case_that_never_ran_is_named_with_the_earlier_cases_left_out() -> Result<()> {
        let journey = Journey::Workspace;
        let last = journey.cases().last().copied().unwrap();
        let selection = picked(journey, &[last])?;
        let outcomes = Outcomes::new(journey, PathBuf::from("unsaved"), selection);
        assert_eq!(outcomes.unrun(), Some(last));
        let message = outcomes.unrun_message(last);
        assert!(
            message.contains(last) && message.contains("split-vessel"),
            "{message}"
        );
        assert!(!outcomes.passed());
        let full = Outcomes::new(journey, PathBuf::from("unsaved"), Selection::full(journey));
        assert!(full.unrun_message(last).contains("declared case"));
        Ok(())
    }

    #[test]
    fn a_failed_case_is_named_with_what_it_observed_and_ends_the_journey() -> Result<()> {
        let mut outcomes = outcomes();
        let [first, second, ..] = JOURNEY.cases() else {
            bail!("The journey declares fewer than two cases");
        };
        let verdict = Verdict::new()
            .expect("it held", true)
            .expect("the name is the typed text", false)
            .observed("after", "NATIVE FLEET")?;
        judge(&mut outcomes, first, Some(verdict))?;
        judge(&mut outcomes, second, held())?;
        assert_eq!(
            statuses(&outcomes)[..2],
            [format!("{first}:failed"), format!("{second}:skipped")]
        );
        assert!(outcomes.unrun().is_none());
        let failure = outcomes.first_failure().expect("a failed case");
        assert_eq!(failure["check"], *first);
        assert_eq!(failure["blame"], "product");
        assert!(
            failure["detail"]
                .as_str()
                .is_some_and(|detail| detail.ends_with("the name is the typed text"))
        );
        assert_eq!(failure["observed"]["after"], "NATIVE FLEET");
        assert!(!outcomes.passed());
        Ok(())
    }

    #[test]
    fn evidence_that_cannot_be_kept_after_a_failed_case_leaves_the_failure_standing() -> Result<()>
    {
        let mut native = crate::native::tests::native()?;
        let case = scrolling::Case::NormalHistory;
        let mut check = |name: &str, held: bool| {
            let mut outcomes = Outcomes::new(
                JOURNEY,
                native.system.evidence.join(name),
                Selection::full(JOURNEY),
            );
            let verdict = Verdict::new().expect("wheel up shows earlier history", held);
            let checked = Cases::over(&mut outcomes).check(&mut native, case, |_| Ok(verdict));
            (checked, outcomes)
        };
        let (checked, outcomes) = check("failed.json", false);
        checked?;
        let failure = outcomes.first_failure().expect("a failed case");
        assert_eq!(failure["check"], case.name());
        assert_eq!(failure["blame"], "product");
        let (checked, outcomes) = check("passed.json", true);
        let unkept = checked.expect_err("A passed case lost its capture without an error");
        assert!(format!("{unkept:#}").contains("Missing display connection"));
        assert_eq!(statuses(&outcomes)[0], format!("{}:passed", case.name()));
        let ledger = std::fs::read_to_string(native.system.evidence.join("actions.jsonl"))?;
        let unkept: Vec<_> = ledger
            .lines()
            .filter(|line| line.contains(r#""event":"unkept""#))
            .collect();
        assert!(
            matches!(unkept[..], [line] if line.contains("Missing display connection")),
            "Only the failed case records the capture that it could not keep: {unkept:?}"
        );
        Ok(())
    }

    #[test]
    fn a_failed_verdict_about_a_stopped_candidate_is_a_hang() -> Result<()> {
        let mut native = crate::native::tests::stopped()?;
        let path = native.system.evidence.join("observations.json");
        let mut outcomes = Outcomes::new(JOURNEY, path, Selection::full(JOURNEY));
        let case = scrolling::Case::NormalHistory;
        let verdict = Verdict::new().expect("wheel up shows earlier history", false);
        let hang = Cases::over(&mut outcomes)
            .check(&mut native, case, |_| Ok(verdict))
            .expect_err("A stopped candidate was judged by an expectation");
        assert_eq!(outcomes.interrupted(), Some(case.name()));
        assert!(outcomes.first_failure().is_none());
        let cause = native.diagnose(&hang);
        assert!(
            matches!(&cause, Cause::Product(detail) if detail.contains("stopped")),
            "A stopped candidate was not blamed on the product"
        );
        assert!(native.cleanup(true).is_empty());
        Ok(())
    }

    #[test]
    fn cases_after_an_interruption_stay_listed_as_skipped() -> Result<()> {
        let mut outcomes = outcomes();
        let [first, second, third, ..] = JOURNEY.cases() else {
            bail!("The journey declares fewer than three cases");
        };
        judge(&mut outcomes, first, held())?;
        judge(&mut outcomes, second, None)?;
        assert_eq!(outcomes.interrupted(), Some(*second));
        assert!(judge(&mut outcomes, third, held()).is_err());
        assert!(outcomes.unrun().is_none());
        let listed = statuses(&outcomes);
        assert_eq!(listed.len(), JOURNEY.cases().len());
        assert_eq!(
            listed[..2],
            [format!("{first}:passed"), format!("{second}:interrupted")]
        );
        assert!(listed[2..].iter().all(|case| case.ends_with(":skipped")));
        Ok(())
    }
}
