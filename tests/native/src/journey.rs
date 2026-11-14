mod input;
mod layout;
mod quit_restore;
mod scrolling;
mod voyage_close;
mod workspace;

use crate::native::{Native, Sidebar};
use crate::system::save;
use anyhow::{Context as _, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::marker::PhantomData;
use std::path::PathBuf;

pub trait Case: Copy + 'static {
    const NAMES: &'static [&'static str];
    fn name(self) -> &'static str;
}

macro_rules! cases {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq)]
        pub enum Case {
            $($variant),+
        }

        impl crate::journey::Case for Case {
            const NAMES: &'static [&'static str] = &[$($name),+];

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
    TerminalInput => "terminal-input" in input, sidebar: None, window: None;
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

    pub fn control_patch(self) -> String {
        format!("tests/native/controls/{}.patch", self.name())
    }

    pub fn listing() -> Value {
        Self::ALL
            .iter()
            .map(|journey| {
                json!({"journey":journey,"cases":journey.cases(),"sidebar":journey.sidebar(),"smallestWindow":journey.window(),"control":{"case":journey.control(),"patch":journey.control_patch()}})
            })
            .collect()
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
}

impl Outcomes {
    pub fn new(journey: Journey, path: PathBuf) -> Self {
        let cases = journey
            .cases()
            .iter()
            .map(|case| Outcome {
                case,
                status: Status::Skipped,
                verdict: Verdict::new(),
            })
            .collect();
        Self { cases, path }
    }

    pub fn passed(&self) -> bool {
        self.cases.iter().all(|case| case.status == Status::Passed)
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
        save(&self.path, &json!({"cases":self.cases,"error":error}))
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

    fn outcomes() -> Outcomes {
        Outcomes::new(JOURNEY, PathBuf::from("unsaved"))
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
    fn every_journey_has_a_control_patch_that_still_applies() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        for journey in Journey::ALL {
            let patch = journey.control_patch();
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
            let mut outcomes = Outcomes::new(JOURNEY, native.system.evidence.join(name));
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
        let mut outcomes = Outcomes::new(JOURNEY, path);
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
