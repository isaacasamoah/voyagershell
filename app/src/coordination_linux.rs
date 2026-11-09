use std::{
    fs,
    io::Read,
    os::{
        fd::AsRawFd,
        unix::{fs::MetadataExt, net::UnixStream},
    },
    path::Path,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Identity {
    pub pid: u32,
    pub start: u64,
    pub uid: u32,
}

fn stat(pid: u32) -> Result<(Identity, u32), String> {
    let directory = format!("/proc/{pid}");
    let source = fs::read_to_string(format!("{directory}/stat")).map_err(|e| e.to_string())?;
    let (_, fields) = source.rsplit_once(')').ok_or("Invalid process identity")?;
    let fields: Vec<_> = fields.split_whitespace().collect();
    if matches!(fields.first(), Some(&"Z") | Some(&"X")) {
        return Err("The original process has exited".into());
    }
    let start = fields
        .get(19)
        .ok_or("Process start is unavailable")?
        .parse()
        .map_err(|_| "Invalid process start")?;
    let parent = fields
        .get(1)
        .ok_or("Process parent is unavailable")?
        .parse()
        .map_err(|_| "Invalid process parent")?;
    let uid = fs::metadata(directory).map_err(|e| e.to_string())?.uid();
    Ok((Identity { pid, start, uid }, parent))
}

pub(crate) fn identity(pid: u32) -> Result<Identity, String> {
    stat(pid).map(|(identity, _)| identity)
}

pub(crate) fn image(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok((metadata.dev(), metadata.ino()))
}

pub(crate) fn process_image(pid: u32) -> Result<(u64, u64), String> {
    image(Path::new(&format!("/proc/{pid}/exe")))
}

pub(crate) fn parent(pid: u32) -> Result<u32, String> {
    stat(pid).map(|(_, parent)| parent)
}

pub(crate) fn arguments(pid: u32) -> Result<Vec<String>, String> {
    let mut bytes = Vec::new();
    fs::File::open(format!("/proc/{pid}/cmdline"))
        .map_err(|e| e.to_string())?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 65536 {
        return Err("The launch arguments exceed 64 KiB".into());
    }
    bytes
        .split(|byte| *byte == 0)
        .filter(|arg| !arg.is_empty())
        .map(|arg| String::from_utf8(arg.to_vec()).map_err(|e| e.to_string()))
        .collect()
}

pub(crate) fn peer(stream: &UnixStream) -> Result<Identity, String> {
    let mut credentials = libc::ucred {
        pid: 0,
        uid: 0,
        gid: 0,
    };
    let mut length = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let result = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut credentials as *mut libc::ucred).cast(),
            &mut length,
        )
    };
    if result != 0 || length as usize != std::mem::size_of::<libc::ucred>() {
        return Err("The command's kernel identity is unavailable".into());
    }
    let pid = u32::try_from(credentials.pid).map_err(|_| "Invalid command process")?;
    let actual = identity(pid)?;
    if actual.uid != credentials.uid || actual.uid != identity(std::process::id())?.uid {
        return Err("The command belongs to another user".into());
    }
    Ok(actual)
}

pub(crate) fn belongs_to(peer: Identity, root: Identity) -> Result<(), String> {
    if identity(peer.pid)? != peer || identity(root.pid)? != root || peer.uid != root.uid {
        return Err("The original agent or command process changed".into());
    }
    let mut current = peer.pid;
    for _ in 0..64 {
        let (observed, parent) = stat(current)?;
        if observed.uid != root.uid {
            break;
        }
        if observed == root {
            return if identity(root.pid)? == root && identity(peer.pid)? == peer {
                Ok(())
            } else {
                Err("The original agent run changed during admission".into())
            };
        }
        if parent == 0 || parent == current {
            break;
        }
        current = parent;
    }
    Err("This command does not belong to the selected agent run".into())
}
