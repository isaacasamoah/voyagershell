use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read as _},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use voyager_contract::{CoreTerminalId, Layout, VesselId, caller::Caller};

pub const FILE: &str = "voyager.json";

const LIMIT: u64 = 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stored {
    terminal: String,
}

#[derive(Clone, Debug, Default)]
pub struct Binding {
    path: Option<PathBuf>,
    terminal: Arc<Mutex<Option<CoreTerminalId>>>,
}

impl Binding {
    pub fn unbound() -> Self {
        Self::default()
    }

    pub fn load(profile: &Path) -> Self {
        let path = profile.join(FILE);
        let terminal = match read(&path) {
            Ok(terminal) => terminal,
            Err(error) => {
                eprintln!("Voyager binding {} ignored: {error}", path.display());
                None
            }
        };
        Self {
            path: Some(path),
            terminal: Arc::new(Mutex::new(terminal)),
        }
    }

    pub fn terminal(&self) -> Option<CoreTerminalId> {
        self.terminal.lock().ok().and_then(|bound| bound.clone())
    }

    pub(crate) fn caller(&self, layout: &Layout, program: Option<&VesselId>) -> Caller {
        let Some(program) = program else {
            return Caller::Person;
        };
        let is_voyager = layout
            .vessels
            .iter()
            .find(|vessel| &vessel.id == program)
            .and_then(|vessel| vessel.backend.as_ref())
            .is_some_and(|terminal| self.names(terminal));
        if is_voyager {
            Caller::Voyager
        } else {
            Caller::Agent
        }
    }

    pub fn names(&self, terminal: &CoreTerminalId) -> bool {
        self.terminal
            .lock()
            .is_ok_and(|bound| bound.as_ref() == Some(terminal))
    }

    pub fn forget(&self) {
        if let Ok(mut bound) = self.terminal.lock() {
            *bound = None;
        }
    }

    pub fn bind(&self, terminal: CoreTerminalId) -> io::Result<()> {
        let mut bound = self
            .terminal
            .lock()
            .map_err(|_| io::Error::other("Voyager binding is unavailable"))?;
        if let Some(path) = &self.path {
            let stored = serde_json::to_vec(&Stored {
                terminal: terminal.0.clone(),
            })
            .map_err(io::Error::other)?;
            let staged = path.with_extension("json.tmp");
            fs::write(&staged, stored)?;
            fs::rename(&staged, path)?;
        }
        *bound = Some(terminal);
        Ok(())
    }
}

fn read(path: &Path) -> Result<Option<CoreTerminalId>, String> {
    let mut source = Vec::new();
    match fs::File::open(path).and_then(|file| file.take(LIMIT + 1).read_to_end(&mut source)) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
        Ok(_) => {}
    }
    if source.len() as u64 > LIMIT {
        return Err(format!("larger than {LIMIT} bytes"));
    }
    let stored: Stored = serde_json::from_slice(&source).map_err(|error| error.to_string())?;
    if stored.terminal.is_empty() {
        return Err("names no terminal".into());
    }
    Ok(Some(CoreTerminalId(stored.terminal)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terminal(id: &str) -> CoreTerminalId {
        CoreTerminalId(id.into())
    }

    fn profile(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "voyager-binding-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn nothing_is_bound_until_the_app_writes_the_file() {
        let profile = profile("empty");
        let binding = Binding::load(&profile);
        assert!(!binding.names(&terminal("t1")));
        assert!(!profile.join(FILE).exists());
        fs::remove_dir_all(profile).unwrap();
    }

    #[test]
    fn a_written_binding_names_one_terminal_and_survives_a_restart() {
        let profile = profile("write");
        let binding = Binding::load(&profile);
        binding.bind(terminal("t7")).unwrap();
        assert!(binding.names(&terminal("t7")));
        assert!(!binding.names(&terminal("t8")));
        let reopened = Binding::load(&profile);
        assert!(reopened.names(&terminal("t7")));
        assert!(!reopened.names(&terminal("t8")));
        binding.bind(terminal("t8")).unwrap();
        assert!(!binding.names(&terminal("t7")));
        assert!(Binding::load(&profile).names(&terminal("t8")));
        assert!(!profile.join("voyager.json.tmp").exists());
        fs::remove_dir_all(profile).unwrap();
    }

    #[test]
    fn a_damaged_or_oversized_file_binds_nobody() {
        for contents in [
            "not json".to_owned(),
            r#"{"terminal":""}"#.to_owned(),
            r#"{"terminal":"t1","rank":"voyager"}"#.to_owned(),
            r#"{"terminal":7}"#.to_owned(),
            format!(r#"{{"terminal":"{}"}}"#, "t".repeat(2048)),
        ] {
            let profile = profile("damaged");
            fs::write(profile.join(FILE), &contents).unwrap();
            assert!(
                !Binding::load(&profile).names(&terminal("t1")),
                "{contents}"
            );
            fs::remove_dir_all(profile).unwrap();
        }
    }

    #[test]
    fn forgetting_leaves_the_file_and_names_nobody_until_the_next_write() {
        let profile = profile("forget");
        let binding = Binding::load(&profile);
        binding.bind(terminal("t7")).unwrap();
        binding.forget();
        assert!(!binding.names(&terminal("t7")));
        assert!(Binding::load(&profile).names(&terminal("t7")));
        binding.bind(terminal("t9")).unwrap();
        assert!(binding.names(&terminal("t9")));
        fs::remove_dir_all(profile).unwrap();
    }

    #[test]
    fn a_handle_without_a_profile_holds_its_binding_in_memory_only() {
        let binding = Binding::unbound();
        binding.bind(terminal("t2")).unwrap();
        assert!(binding.names(&terminal("t2")));
    }
}
