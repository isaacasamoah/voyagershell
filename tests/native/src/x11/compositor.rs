use super::{Bounded, Window, atom, connect};
use anyhow::{Result, ensure};
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ConnectionExt as _, CreateWindowAux, PropMode, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;
use x11rb::{COPY_DEPTH_FROM_PARENT, COPY_FROM_PARENT, CURRENT_TIME};

pub struct Compositor {
    connection: RustConnection<Bounded>,
    window: Window,
    selections: Vec<Atom>,
}

fn selection_names(root: Window) -> [String; 2] {
    ["_NET_WM_CM_S0".to_owned(), format!("_NET_WM_CM_S{root}")]
}

fn supported_with(existing: &[Atom], extra: Atom) -> Vec<Atom> {
    let mut supported = existing.to_vec();
    if !supported.contains(&extra) {
        supported.push(extra);
    }
    supported
}

impl Compositor {
    pub fn start(display: &str) -> Result<Self> {
        let connection = connect(display)?;
        let root = connection.setup().roots[0].root;
        let window = connection.generate_id()?;
        connection
            .create_window(
                COPY_DEPTH_FROM_PARENT,
                window,
                root,
                0,
                0,
                1,
                1,
                0,
                WindowClass::INPUT_OUTPUT,
                COPY_FROM_PARENT,
                &CreateWindowAux::new(),
            )?
            .check()?;
        let mut selections = Vec::new();
        for name in selection_names(root) {
            let selection = atom(&connection, &name)?;
            connection.set_selection_owner(window, selection, CURRENT_TIME)?;
            selections.push(selection);
        }
        let frame_extents = atom(&connection, "_GTK_FRAME_EXTENTS")?;
        let supported_atom = atom(&connection, "_NET_SUPPORTED")?;
        let existing = connection
            .get_property(false, root, supported_atom, AtomEnum::ATOM, 0, 1024)?
            .reply()?
            .value32()
            .map(Iterator::collect::<Vec<_>>)
            .unwrap_or_default();
        connection.change_property32(
            PropMode::REPLACE,
            root,
            supported_atom,
            AtomEnum::ATOM,
            &supported_with(&existing, frame_extents),
        )?;
        let compositor = Self {
            connection,
            window,
            selections,
        };
        ensure!(
            compositor.owns()?,
            "The display did not keep the verifier as the compositor"
        );
        Ok(compositor)
    }

    pub fn owns(&self) -> Result<bool> {
        for selection in &self.selections {
            let owner = self
                .connection
                .get_selection_owner(*selection)?
                .reply()?
                .owner;
            if owner != self.window {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_compositor_is_named_for_the_screen_and_for_the_root_window() {
        assert_eq!(
            selection_names(1077),
            ["_NET_WM_CM_S0".to_owned(), "_NET_WM_CM_S1077".to_owned()]
        );
    }

    #[test]
    fn the_frame_extents_atom_is_added_once_to_what_the_display_supports() {
        assert_eq!(supported_with(&[4, 5], 9), [4, 5, 9]);
        assert_eq!(supported_with(&[4, 9], 9), [4, 9]);
        assert_eq!(supported_with(&[], 9), [9]);
    }
}
