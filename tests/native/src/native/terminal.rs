use super::{Native, QUIET, Wheel, pid, placed};
use crate::inspection::{Target, region};
use crate::system::{Identity, PATIENCE, save, settle, until};
use crate::x11::{Key, Pixels};
use anyhow::{Result, ensure};
use serde_json::json;
use std::time::Duration;
use voyager_contract::{ContentId, CoreTerminalId, Layout, PlacementId};

const EXPECTATION: Duration = Duration::from_secs(4);
const WHEEL_CLICKS: usize = 6;

pub struct Terminal {
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
        save(
            native.system.evidence.join("identity.json"),
            &json!({"core":native.core,"coreId":native.core_id,"shell":shell,"terminal":address,"placement":placement}),
        )?;
        native.adopt("shell".into(), shell.clone());
        Ok(Self {
            address,
            placement,
            shell,
        })
    }

    pub fn target(&self) -> Target {
        Target::terminal(&self.placement)
    }

    pub fn focus(&self, native: &Native) -> Result<()> {
        native.click(&self.target())
    }

    pub fn line(&self, native: &Native, text: &str) -> Result<()> {
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
        self.shell.verify()?;
        ensure!(
            pid(&native
                .system
                .rpc("terminal.get", json!({"terminal":self.address}))?)?
                == self.shell.pid,
            "Terminal shell changed"
        );
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
