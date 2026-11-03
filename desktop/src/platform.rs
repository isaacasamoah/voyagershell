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
}

pub struct WindowState {
    #[cfg(target_os = "linux")]
    connection: x11rb::rust_connection::RustConnection,
    #[cfg(target_os = "linux")]
    readiness: async_io::Async<std::os::fd::OwnedFd>,
    window: u32,
    atom: u32,
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
                .intern_atom(true, b"WM_STATE")
                .map_err(|error| error.to_string())?
                .reply()
                .map_err(|error| error.to_string())?
                .atom;
            if atom == 0 {
                return Err("The window manager does not expose WM_STATE".into());
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
            use x11rb::protocol::xproto::ConnectionExt;
            loop {
                let property = self
                    .connection
                    .get_property(false, self.window, self.atom, self.atom, 0, 2)
                    .map_err(|error| error.to_string())?
                    .reply()
                    .map_err(|error| error.to_string())?;
                let state = property.value32().and_then(|mut values| values.next());
                let changed = self.drain()?;
                if !self.alive {
                    return Ok(None);
                }
                if changed {
                    continue;
                }
                return match state {
                    Some(3) => Ok(Some(true)),
                    Some(0 | 1) => Ok(Some(false)),
                    None => Ok(None),
                    Some(state) => Err(format!("Unknown window manager state {state}")),
                };
            }
        }
        #[cfg(not(target_os = "linux"))]
        Err("OS minimise observation is not implemented on this platform".into())
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
