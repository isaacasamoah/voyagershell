use super::{Defect, Native, QUIET, Wheel, pid, placed};
use crate::inspection::{Target, region};
use crate::system::{Identity, PATIENCE, settle, until};
use crate::x11::{Key, Pixels};
use anyhow::{Result, ensure};
use serde::Serialize;
use serde_json::json;
use std::time::Duration;
use voyager_contract::{ContentId, CoreTerminalId, Layout, PlacementId};

const EXPECTATION: Duration = Duration::from_secs(4);
const WHEEL_CLICKS: usize = 6;

#[derive(Serialize)]
pub struct Terminal {
    #[serde(rename = "terminal")]
    address: CoreTerminalId,
    placement: PlacementId,
    shell: Identity,
}

impl Terminal {
    pub fn first(native: &mut Native) -> Result<Self> {
        let (address, placement) = until("bound terminal", || {
            let Some(layout) = native.document()? else {
                return Ok(None);
            };
            Ok(layout.contents.first().and_then(|content| {
                Some((
                    content.backend.clone()?,
                    placement_of(&layout, &content.id)?.clone(),
                ))
            }))
        })?;
        let shell = Identity::read(pid(&native
            .system
            .rpc("terminal.get", json!({"terminal":address}))?)?)?;
        native.adopt("shell".into(), shell.clone());
        let terminal = Self {
            address,
            placement,
            shell,
        };
        native.identify(Some(&terminal))?;
        Ok(terminal)
    }

    pub fn target(&self) -> Target {
        Target::terminal(&self.placement)
    }

    pub fn focus(&self, native: &Native) -> Result<()> {
        native.click(&self.target())
    }

    pub fn line(&self, native: &Native, text: &str) -> Result<()> {
        self.focus(native)?;
        native.type_text(text)?;
        native.press(Key::Return)
    }

    pub fn shows(&self, native: &Native, text: &str) -> Result<()> {
        until(&format!("{text} in the terminal"), || {
            let read = native
                .system
                .watch("terminal.read", json!({"terminal":self.address}))?;
            Ok(read["text"]
                .as_str()
                .is_some_and(|shown| shown.contains(text))
                .then_some(()))
        })
    }

    pub fn wheel(&self, native: &Native, direction: Wheel) -> Result<()> {
        native.wheel(&self.target(), direction, WHEEL_CLICKS)
    }

    pub fn look(&self, native: &Native) -> Result<Pixels> {
        let target = self.target();
        let (terminal, avatar) = native.wait_for(&target.to_string(), PATIENCE, |frame| {
            let terminal = target.find(frame)?;
            let avatar = Target::AVATAR.find(frame);
            Some((
                region(frame, &terminal.bounds),
                avatar.map(|avatar| region(frame, &avatar.bounds)),
            ))
        })?;
        let mut pixels = native.x11()?.capture(native.window, terminal)?;
        if let Some(avatar) = avatar {
            pixels.mask(avatar);
        }
        Ok(pixels)
    }

    pub fn settled(
        &self,
        native: &Native,
        name: &str,
        expected: impl Fn(&Pixels) -> bool,
    ) -> Result<Pixels> {
        let look = settle(EXPECTATION, QUIET, || self.look(native), expected)?;
        native.keep(name, &look)?;
        Ok(look)
    }

    pub fn settled_with<T: PartialEq>(
        &self,
        native: &Native,
        name: &str,
        mut observe: impl FnMut() -> Result<T>,
        expected: impl Fn(&T, &Pixels) -> bool,
    ) -> Result<(T, Pixels)> {
        let (value, look) = settle(
            EXPECTATION,
            QUIET,
            || Ok((observe()?, self.look(native)?)),
            |(value, look)| expected(value, look),
        )?;
        native.keep(name, &look)?;
        Ok((value, look))
    }

    pub fn same_program(&self, native: &Native) -> Result<()> {
        let survived = || -> Result<()> {
            self.shell.verify()?;
            let reported = native
                .system
                .rpc("terminal.get", json!({"terminal":self.address}))?;
            ensure!(
                pid(&reported)? == self.shell.pid,
                "Core reports another program for the terminal"
            );
            Ok(())
        };
        survived().map_err(|error| {
            Defect(format!(
                "the shell of {} did not survive: {error:#}",
                self.target()
            ))
        })?;
        native.same_core()
    }
}

fn placement_of<'a>(layout: &'a Layout, content: &ContentId) -> Option<&'a PlacementId> {
    placed(layout)
        .find(|placed| &placed.content == content)
        .map(|placed| &placed.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::{Cause, tests::native};
    use std::path::Path;

    #[test]
    fn a_shell_that_died_is_a_product_failure() -> Result<()> {
        let mut native = native()?;
        let mut shell = native.system.spawn(
            Path::new("/usr/bin/tail"),
            &["-f", "/dev/null"],
            &[],
            "shell.log",
        )?;
        shell.child.kill()?;
        shell.child.wait()?;
        let terminal = Terminal {
            address: CoreTerminalId("t1".into()),
            placement: PlacementId("placement-3".into()),
            shell: shell.identity.clone(),
        };
        let error = terminal
            .same_program(&native)
            .expect_err("A shell that died counted as the same program");
        ensure!(
            matches!(native.diagnose(&error), Cause::Product(detail) if detail.contains("placement-3")),
            "A shell that died was blamed on the fixture: {error:#}"
        );
        Ok(())
    }

    #[test]
    fn the_terminal_placement_is_found_by_its_content() {
        let layout: Layout = serde_json::from_value(json!({
            "voyages": [{
                "id": "voyage-1",
                "name": "Voyager",
                "fleets": [{
                    "id": "fleet-4",
                    "name": "Fleet 1",
                    "root": null,
                    "vessels": [
                        {"id": "placement-7", "content": "content-6", "name": "Agents 1"},
                        {"id": "placement-3", "content": "content-2", "name": "Terminal 1"}
                    ]
                }],
                "portals": [{"id": "placement-9", "content": "content-8", "name": "Notes"}]
            }],
            "contents": [],
            "selectedVoyage": "voyage-1",
            "selectedFleet": "fleet-4",
            "context": {"kind": "workspace"},
            "nextId": "10"
        }))
        .expect("a contract layout");
        let placed = |content: &str| {
            placement_of(&layout, &ContentId(content.into())).map(|placement| placement.0.as_str())
        };
        assert_eq!(placed("content-2"), Some("placement-3"));
        assert_eq!(placed("content-8"), Some("placement-9"));
        assert_eq!(placed("content-1"), None);
    }
}
