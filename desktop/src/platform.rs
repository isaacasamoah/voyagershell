use std::{
    env,
    ffi::OsString,
    io::Write,
    process::{Command, Stdio},
    sync::{
        OnceLock,
        mpsc::{self, SyncSender},
    },
};

pub fn audio_environment() -> Vec<(OsString, OsString)> {
    let mut selected = [
        "SYSTEMROOT",
        "WINDIR",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "TEMP",
        "TMP",
        "TMPDIR",
        "XDG_RUNTIME_DIR",
        "PULSE_SERVER",
        "PULSE_COOKIE",
        "PIPEWIRE_REMOTE",
        "DBUS_SESSION_BUS_ADDRESS",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "REQUESTS_CA_BUNDLE",
        "CURL_CA_BUNDLE",
    ]
    .into_iter()
    .filter_map(|key| env::var_os(key).map(|value| (OsString::from(key), value)))
    .collect::<Vec<_>>();
    for (key, value) in [
        ("GST_PLUGIN_PATH", ""),
        ("GST_PLUGIN_PATH_1_0", ""),
        ("GST_PLUGIN_SYSTEM_PATH", ""),
        ("GST_PLUGIN_SYSTEM_PATH_1_0", ""),
        (
            "GST_REGISTRY",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        ),
        ("GST_REGISTRY_UPDATE", "no"),
        ("GST_REGISTRY_FORK", "no"),
    ] {
        selected.push((key.into(), value.into()));
    }
    #[cfg(target_os = "linux")]
    if let Some(path) = [
        "/usr/lib/x86_64-linux-gnu/alsa-lib",
        "/usr/lib/aarch64-linux-gnu/alsa-lib",
        "/usr/lib/alsa-lib",
        "/usr/lib64/alsa-lib",
    ]
    .into_iter()
    .find(|path| std::path::Path::new(path).is_dir())
    {
        selected.push(("ALSA_PLUGIN_DIR".into(), path.into()));
    }
    selected
}

pub fn native_window(window: &gpui::Window) -> Result<u32, String> {
    #[cfg(target_os = "linux")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        match HasWindowHandle::window_handle(window)
            .map_err(|error| error.to_string())?
            .as_raw()
        {
            RawWindowHandle::Xlib(handle) => {
                u32::try_from(handle.window).map_err(|error| error.to_string())
            }
            RawWindowHandle::Xcb(handle) => Ok(handle.window.get()),
            _ => Err("OS minimise observation is unavailable for this window system".into()),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
        Err("OS minimise observation is not implemented on this platform".into())
    }
}

pub struct WindowPosition {
    #[cfg(target_os = "linux")]
    connection: x11rb::rust_connection::RustConnection,
}

pub enum RestoreError {
    Refused(String),
    Uncertain(String),
}

impl WindowPosition {
    pub fn new() -> Result<Self, String> {
        #[cfg(target_os = "linux")]
        {
            let (connection, _) = x11rb::connect(None).map_err(|error| error.to_string())?;
            Ok(Self { connection })
        }
        #[cfg(not(target_os = "linux"))]
        {
            Err("Native avatar positioning is not implemented on this platform".into())
        }
    }

    pub fn move_to(
        &mut self,
        window: u32,
        position: gpui::Point<i32>,
        cancelled: &std::sync::atomic::AtomicBool,
    ) -> Result<bool, String> {
        if cancelled.load(std::sync::atomic::Ordering::Acquire) {
            return Ok(false);
        }
        #[cfg(target_os = "linux")]
        {
            use x11rb::protocol::xproto::{ConfigureWindowAux, ConnectionExt};
            self.connection
                .configure_window(
                    window,
                    &ConfigureWindowAux::new().x(position.x).y(position.y),
                )
                .map_err(|error| error.to_string())?
                .check()
                .map_err(|error| error.to_string())?;
            Ok(true)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (position, window);
            Err("Native avatar positioning is not implemented on this platform".into())
        }
    }

    pub fn restore_bounds(
        &mut self,
        window: u32,
        bounds: gpui::Bounds<gpui::ScaledPixels>,
        cancelled: &std::sync::atomic::AtomicBool,
    ) -> Result<bool, RestoreError> {
        if cancelled.load(std::sync::atomic::Ordering::Acquire) {
            return Ok(false);
        }
        #[cfg(target_os = "linux")]
        {
            use x11rb::errors::ReplyError;
            use x11rb::protocol::xproto::{
                AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, Gravity,
            };
            let refused = |error: String| RestoreError::Refused(error);
            let root = self
                .connection
                .get_geometry(window)
                .map_err(|error| refused(error.to_string()))?
                .reply()
                .map_err(|error| refused(error.to_string()))?
                .root;
            let atom = self
                .connection
                .intern_atom(true, b"_NET_MOVERESIZE_WINDOW")
                .map_err(|error| refused(error.to_string()))?
                .reply()
                .map_err(|error| refused(error.to_string()))?
                .atom;
            let supported = self
                .connection
                .intern_atom(true, b"_NET_SUPPORTED")
                .map_err(|error| refused(error.to_string()))?
                .reply()
                .map_err(|error| refused(error.to_string()))?
                .atom;
            if atom == 0 || supported == 0 {
                return Err(refused(
                    "The desktop does not advertise precise window restoration".into(),
                ));
            }
            let capabilities = self
                .connection
                .get_property(false, root, supported, AtomEnum::ATOM, 0, 1024)
                .map_err(|error| refused(error.to_string()))?
                .reply()
                .map_err(|error| refused(error.to_string()))?;
            if !capabilities
                .value32()
                .is_some_and(|mut atoms| atoms.any(|value| value == atom))
            {
                return Err(refused(
                    "The desktop does not support precise window restoration".into(),
                ));
            }
            let x = i32::from(gpui::DevicePixels::from(bounds.origin.x));
            let y = i32::from(gpui::DevicePixels::from(bounds.origin.y));
            let width = u32::try_from(i32::from(gpui::DevicePixels::from(bounds.size.width)))
                .map_err(|error| refused(error.to_string()))?;
            let height = u32::try_from(i32::from(gpui::DevicePixels::from(bounds.size.height)))
                .map_err(|error| refused(error.to_string()))?;
            let event = ClientMessageEvent::new(
                32,
                window,
                atom,
                [
                    u32::from(Gravity::STATIC) | (0b1111 << 8) | (1 << 12),
                    x as u32,
                    y as u32,
                    width,
                    height,
                ],
            );
            if cancelled.load(std::sync::atomic::Ordering::Acquire) {
                return Ok(false);
            }
            self.connection
                .send_event(
                    false,
                    root,
                    EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                    event,
                )
                .map_err(|error| RestoreError::Uncertain(error.to_string()))?
                .check()
                .map_err(|error| match error {
                    ReplyError::X11Error(error) => RestoreError::Refused(format!("{error:?}")),
                    ReplyError::ConnectionError(error) => {
                        RestoreError::Uncertain(error.to_string())
                    }
                })?;
            Ok(true)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (window, bounds);
            Err(RestoreError::Refused(
                "Native workspace restoration is not implemented on this platform".into(),
            ))
        }
    }
}

pub struct WindowState {
    #[cfg(target_os = "linux")]
    connection: x11rb::rust_connection::RustConnection,
    #[cfg(target_os = "linux")]
    readiness: async_io::Async<std::os::fd::OwnedFd>,
    window: u32,
    atom: u32,
    hidden: u32,
    ready: bool,
    alive: bool,
}

impl WindowState {
    pub fn new(window: u32) -> Result<Self, String> {
        #[cfg(target_os = "linux")]
        {
            use std::os::fd::AsFd;
            use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt, EventMask};
            let (connection, _) = x11rb::connect(None).map_err(|error| error.to_string())?;
            let atom = connection
                .intern_atom(true, b"_NET_WM_STATE")
                .map_err(|error| error.to_string())?
                .reply()
                .map_err(|error| error.to_string())?
                .atom;
            let hidden = connection
                .intern_atom(true, b"_NET_WM_STATE_HIDDEN")
                .map_err(|error| error.to_string())?
                .reply()
                .map_err(|error| error.to_string())?
                .atom;
            if atom == 0 || hidden == 0 {
                return Err("The window manager does not expose native hidden state".into());
            }
            connection
                .change_window_attributes(
                    window,
                    &ChangeWindowAttributesAux::new()
                        .event_mask(EventMask::PROPERTY_CHANGE | EventMask::STRUCTURE_NOTIFY),
                )
                .map_err(|error| error.to_string())?
                .check()
                .map_err(|error| error.to_string())?;
            let descriptor = connection
                .stream()
                .as_fd()
                .try_clone_to_owned()
                .map_err(|error| error.to_string())?;
            let readiness =
                async_io::Async::new_nonblocking(descriptor).map_err(|error| error.to_string())?;
            Ok(Self {
                connection,
                readiness,
                window,
                atom,
                hidden,
                ready: true,
                alive: true,
            })
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = window;
            Err("OS minimise observation is not implemented on this platform".into())
        }
    }

    #[cfg(target_os = "linux")]
    fn drain(&mut self) -> Result<bool, String> {
        use x11rb::{connection::Connection, protocol::Event};
        let mut changed = false;
        while let Some(event) = self
            .connection
            .poll_for_event()
            .map_err(|error| error.to_string())?
        {
            match event {
                Event::PropertyNotify(event)
                    if event.window == self.window && event.atom == self.atom =>
                {
                    changed = true
                }
                Event::DestroyNotify(event) if event.window == self.window => self.alive = false,
                _ => (),
            }
        }
        Ok(changed)
    }

    pub fn recheck(&mut self) {
        self.ready = true;
    }

    pub async fn next(&mut self) -> Result<bool, String> {
        #[cfg(target_os = "linux")]
        loop {
            let changed = self.drain()?;
            if !self.alive {
                return Ok(false);
            }
            if std::mem::replace(&mut self.ready, false) || changed {
                return Ok(true);
            }
            self.readiness
                .readable()
                .await
                .map_err(|error| error.to_string())?;
        }
        #[cfg(not(target_os = "linux"))]
        Err("OS minimise observation is not implemented on this platform".into())
    }

    pub fn read(&mut self) -> Result<Option<bool>, String> {
        #[cfg(target_os = "linux")]
        {
            use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};
            loop {
                let property = self
                    .connection
                    .get_property(false, self.window, self.atom, AtomEnum::ATOM, 0, u32::MAX)
                    .map_err(|error| error.to_string())?
                    .reply()
                    .map_err(|error| error.to_string())?;
                let changed = self.drain()?;
                if !self.alive {
                    return Ok(None);
                }
                if changed {
                    continue;
                }
                return hidden_state(&property, self.hidden);
            }
        }
        #[cfg(not(target_os = "linux"))]
        Err("OS minimise observation is not implemented on this platform".into())
    }
}

#[cfg(target_os = "linux")]
fn hidden_state(
    property: &x11rb::protocol::xproto::GetPropertyReply,
    hidden: u32,
) -> Result<Option<bool>, String> {
    use x11rb::protocol::xproto::AtomEnum;
    if property.type_ == 0 {
        return Ok(None);
    }
    if property.type_ != u32::from(AtomEnum::ATOM) || property.format != 32 {
        return Err("Native window state is not an atom list".into());
    }
    Ok(property
        .value32()
        .map(|mut atoms| atoms.any(|atom| atom == hidden)))
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::hidden_state;
    use x11rb::protocol::xproto::{AtomEnum, GetPropertyReply};

    #[test]
    fn hidden_atom_distinguishes_minimize_from_iconic_and_other_window_states() {
        let mut property = GetPropertyReply {
            format: 32,
            type_: AtomEnum::ATOM.into(),
            ..Default::default()
        };
        property.value = [3_u32, 41].into_iter().flat_map(u32::to_ne_bytes).collect();
        assert_eq!(hidden_state(&property, 75), Ok(Some(false)));
        property.value.extend(75_u32.to_ne_bytes());
        assert_eq!(hidden_state(&property, 75), Ok(Some(true)));
        property.type_ = 90;
        assert!(hidden_state(&property, 75).is_err());
        property.type_ = 0;
        assert_eq!(hidden_state(&property, 75), Ok(None));
    }
}

pub fn tone(docking: bool) {
    static AUDIO: OnceLock<SyncSender<bool>> = OnceLock::new();
    let sender = AUDIO.get_or_init(|| {
        let (sender, receiver) = mpsc::sync_channel(4);
        std::thread::spawn(move || {
            let waves = [false, true].map(|dock| {
                crate::avatar_motion::samples(dock)
                    .into_iter()
                    .flat_map(f32::to_le_bytes)
                    .collect::<Vec<_>>()
            });
            while let Ok(dock) = receiver.recv() {
                if let Err(error) = play(&waves[usize::from(dock)]) {
                    eprintln!("Avatar sound unavailable: {error}");
                }
            }
        });
        sender
    });
    if let Err(error) = sender.try_send(docking) {
        eprintln!("Avatar sound not queued: {error}");
    }
}

fn play(samples: &[u8]) -> std::io::Result<()> {
    let mut child = Command::new("paplay")
        .args([
            "--raw",
            "--rate=48000",
            "--format=float32le",
            "--channels=1",
            "--client-name=Voyager avatar",
        ])
        .stdin(Stdio::piped())
        .spawn()?;
    let written = child
        .stdin
        .take()
        .map_or(Ok(()), |mut input| input.write_all(samples));
    let status = child.wait();
    written?;
    let status = status?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "Audio process exited {status}"
        )))
    }
}
