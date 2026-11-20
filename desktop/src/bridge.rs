use gpui::{AnyElement, App, Window};
use gpui_shell::{ComponentArgs, HostArguments, HostError, HostModule, HostResult, HostValue};
use std::{collections::BTreeSet, future::Future};
use voyager_contract::operations::{Entry, Module, Supplied};

pub(crate) struct Bridge {
    spec: &'static Module,
    module: HostModule,
    bound: BTreeSet<&'static str>,
    refusals: Vec<String>,
}

pub(crate) fn decimal(arguments: &HostArguments, index: usize) -> Result<u64, HostError> {
    arguments
        .string(index)?
        .parse::<u64>()
        .map_err(|_| HostError::new("Expected a decimal revision"))
}

fn supplied(arguments: &HostArguments) -> Vec<Supplied<'_>> {
    (0..arguments.len())
        .filter_map(|index| arguments.get(index))
        .map(|value| match value {
            HostValue::Null => Supplied::Null,
            HostValue::Bool(flag) => Supplied::Bool(*flag),
            HostValue::Str(text) => Supplied::Text(text),
            other => Supplied::Other(other.describe()),
        })
        .collect()
}

fn admit(entry: &Entry, arguments: &HostArguments) -> Result<(), HostError> {
    entry.check(&supplied(arguments)).map_err(HostError::new)
}

impl Bridge {
    pub(crate) fn new(spec: &'static Module) -> Self {
        Self {
            spec,
            module: HostModule::new(spec.name).declarations(spec.declarations()),
            bound: BTreeSet::new(),
            refusals: Vec::new(),
        }
    }

    fn claim(
        &mut self,
        name: &'static str,
        wanted: &'static str,
        matches: fn(&Entry) -> bool,
    ) -> Option<Entry> {
        let Some(entry) = self.spec.entry(name).copied() else {
            self.refusals.push(format!(
                "{} is not in the operation catalogue of {}",
                name, self.spec.name
            ));
            return None;
        };
        if !matches(&entry) {
            self.refusals.push(format!(
                "{} of {} is not {wanted} in the operation catalogue",
                name, self.spec.name
            ));
            return None;
        }
        if !self.bound.insert(name) {
            self.refusals.push(format!(
                "{} of {} is registered twice",
                name, self.spec.name
            ));
            return None;
        }
        Some(entry)
    }

    pub(crate) fn function(
        mut self,
        name: &'static str,
        body: impl Fn(&HostArguments) -> HostResult + 'static,
    ) -> Self {
        let Some(entry) = self.claim(name, "a synchronous function", |entry| {
            !entry.is_async() && !entry.is_component()
        }) else {
            return self;
        };
        self.module = self.module.function(name, move |arguments| {
            admit(&entry, arguments)?;
            body(arguments)
        });
        self
    }

    pub(crate) fn async_function<F>(
        mut self,
        name: &'static str,
        body: impl Fn(&HostArguments) -> Result<F, HostError> + 'static,
    ) -> Self
    where
        F: Future<Output = HostResult> + Send + 'static,
    {
        let Some(entry) = self.claim(name, "an asynchronous function", Entry::is_async) else {
            return self;
        };
        self.module = self.module.async_function(name, move |arguments| {
            admit(&entry, arguments)?;
            body(arguments)
        });
        self
    }

    pub(crate) fn component(
        mut self,
        name: &'static str,
        build: impl for<'a> Fn(ComponentArgs<'a>, &mut Window, &mut App) -> AnyElement + 'static,
    ) -> Self {
        if self
            .claim(name, "a component", Entry::is_component)
            .is_some()
        {
            self.module = self.module.component(name, build);
        }
        self
    }

    pub(crate) fn finish(mut self) -> Result<HostModule, HostError> {
        for entry in self.spec.entries {
            if !self.bound.contains(entry.name) {
                self.refusals.push(format!(
                    "{} of {} is in the operation catalogue but not registered",
                    entry.name, self.spec.name
                ));
            }
        }
        if self.refusals.is_empty() {
            Ok(self.module)
        } else {
            Err(HostError::new(self.refusals.join("; ")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui_shell::HostArguments;
    use voyager_contract::operations::{self, Parameter, Shape, Ty};

    const PROBE: Module = Module {
        name: "voyager_probe",
        entries: &[
            Entry {
                name: "flag",
                shape: Shape::Sync {
                    parameters: &[Parameter {
                        name: "on",
                        ty: Ty::Bool,
                        max_bytes: None,
                    }],
                    returns: Ty::Bool,
                },
            },
            Entry {
                name: "later",
                shape: Shape::Async {
                    parameters: &[],
                    returns: Ty::Text,
                },
            },
        ],
    };

    fn probe() -> Bridge {
        Bridge::new(&PROBE)
            .function("flag", |_| Ok(HostValue::Null))
            .async_function("later", |_| Ok(async { Ok(HostValue::Null) }))
    }

    fn registered(source: &str) -> BTreeSet<String> {
        ["function", "async_function", "component"]
            .into_iter()
            .flat_map(|kind| {
                let marker = format!(".{kind}(\"");
                source
                    .match_indices(&marker)
                    .map(|(at, _)| {
                        let rest = &source[at + marker.len()..];
                        rest[..rest.find('"').expect("closing quote")].to_owned()
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    }

    fn catalogued(modules: &[&Module]) -> BTreeSet<String> {
        modules
            .iter()
            .flat_map(|module| module.entries.iter().map(|entry| entry.name.to_owned()))
            .collect()
    }

    #[test]
    fn a_complete_registration_finishes_and_declares_its_entries() {
        let module = probe().finish().unwrap();
        assert_eq!(module.function_names(), ["flag", "later"]);
        assert!(module.validate().is_ok());
    }

    #[test]
    fn a_host_function_missing_from_the_catalogue_fails_by_name() {
        let error = probe()
            .function("ghost", |_| Ok(HostValue::Null))
            .finish()
            .err()
            .expect("unlisted function");
        assert!(error.message().contains("ghost"), "{}", error.message());
        assert!(error.message().contains("not in the operation catalogue"));
    }

    #[test]
    fn a_catalogue_entry_without_a_registration_fails_by_name() {
        let error = Bridge::new(&PROBE)
            .function("flag", |_| Ok(HostValue::Null))
            .finish()
            .err()
            .expect("unregistered entry");
        assert!(error.message().contains("later"), "{}", error.message());
    }

    #[test]
    fn a_function_registered_as_the_wrong_kind_fails_by_name() {
        let error = Bridge::new(&PROBE)
            .async_function("flag", |_| Ok(async { Ok(HostValue::Null) }))
            .function("later", |_| Ok(HostValue::Null))
            .finish()
            .err()
            .expect("wrong kinds");
        assert!(error.message().contains("flag"), "{}", error.message());
        assert!(error.message().contains("later"), "{}", error.message());
    }

    #[test]
    fn a_wrong_argument_is_refused_before_the_handler_runs() {
        let module = Bridge::new(&PROBE)
            .function("flag", |_| panic!("handler must not run"))
            .async_function("later", |_| Ok(async { Ok(HostValue::Null) }))
            .finish()
            .unwrap();
        let wrong = HostArguments::new([HostValue::Number(1.0)]);
        let error = module.call("flag", &wrong).expect_err("refused");
        assert!(
            error.message().contains("flag argument on"),
            "{}",
            error.message()
        );
    }

    #[test]
    fn every_registration_names_exactly_the_catalogue_entries() {
        let sources: [(&str, &[&Module]); 4] = [
            (
                include_str!("host.rs"),
                &[&operations::THEME, &operations::WORKSPACE],
            ),
            (
                include_str!("conversation.rs"),
                &[&operations::CONVERSATION],
            ),
            (include_str!("avatar.rs"), &[&operations::AVATAR]),
            (
                include_str!("notes.rs"),
                &[&operations::CONTENT_VIEW, &operations::VESSEL],
            ),
        ];
        for (source, modules) in sources {
            let source = source.split("#[cfg(test)]").next().expect("source");
            assert_eq!(registered(source), catalogued(modules));
        }
    }

    #[test]
    fn a_seeded_unlisted_registration_name_breaks_the_parity_scan() {
        let source = include_str!("avatar.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("source");
        let seeded = format!("{source}\n.function(\"ghost\", |_| Ok(HostValue::Null))");
        assert!(registered(&seeded).contains("ghost"));
        assert_ne!(registered(&seeded), catalogued(&[&operations::AVATAR]));
    }
}
