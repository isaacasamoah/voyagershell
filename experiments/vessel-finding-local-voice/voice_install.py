"""Download, verify and unpack the local voice: LFM3-Omni-2B and the llama.cpp server that runs it.

usage: voice_install.py --accept-licence [--runtime cpu|vulkan] [--into DIRECTORY]

Every file is pinned by size and SHA-256. A file already present with the right digest is kept, a partial download
resumes, and a wrong digest is deleted and refused. Nothing is started. The last line printed is the server command.
"""
import hashlib, json, os, shutil, sys, tarfile, urllib.request
from pathlib import Path

VERSION = "lfm3-omni-2b-q4km-llama-b12242"
LICENCE = "https://huggingface.co/LiquidAI/LFM3-Omni-2B/blob/main/LICENSE"
MODEL = "https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/resolve/main/"
RELEASE = "https://github.com/ggml-org/llama.cpp/releases/download/b12242/"
FILES = {
    "LFM3-Omni-2B-Q4_K_M.gguf": (MODEL, 1099630080, "9f8d30e9d4fd7a9349d586e077988229b3ca0a0e4ad730897563d1eccc9893e2"),
    "mmproj-LFM3-Omni-2B-Q4_K_M.gguf": (MODEL, 291586720, "0a746c0794782a16d4456b230c2a0b5888a2d94a6677211edbed7d7a4177a39a"),
}
RUNTIMES = {
    "cpu": ("llama-b12242-bin-ubuntu-x64.tar.gz", 23158635, "909eef25cd53e6601c8a07c866d8dbb2983e74177088d55182137a8fb8255d62"),
    "vulkan": ("llama-b12242-bin-ubuntu-vulkan-x64.tar.gz", 35970391, "09fcffddcfe37615ed79936c3384c43324c82f5a5735c8cd766421fa537ca623"),
}


def digest(path):
    hashed = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            hashed.update(block)
    return hashed.hexdigest()


def fetch(url, path, size, sha256):
    if path.exists() and path.stat().st_size == size and digest(path) == sha256:
        print(f"kept {path.name}")
        return
    part = path.with_name(path.name + ".part")
    start = part.stat().st_size if part.exists() else 0
    if start > size:
        part.unlink()
        start = 0
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-"} if start else {})
    with urllib.request.urlopen(request, timeout=60) as reply, open(part, "ab" if reply.status == 206 else "wb") as out:
        shutil.copyfileobj(reply, out, 1 << 20)
    if part.stat().st_size != size or digest(part) != sha256:
        part.unlink()
        raise SystemExit(f"{path.name} did not match its pinned digest; it was deleted and nothing was installed")
    part.rename(path)
    print(f"downloaded {path.name}")


def unpack(archive, into):
    with tarfile.open(archive) as bundle:
        for member in bundle.getmembers():
            target = (into / member.name).resolve()
            if into.resolve() not in target.parents and target != into.resolve() or member.islnk() or member.isdev():
                raise SystemExit(f"{archive.name} holds an unsafe entry, {member.name}; nothing was unpacked")
        bundle.extractall(into, filter="tar")


def main(arguments):
    if "--accept-licence" not in arguments:
        raise SystemExit(f"LFM3-Omni-2B is under the LFM Open License v1.0, {LICENCE}. Commercial use is licensed only below "
                         "US$10 million annual revenue. Rerun with --accept-licence to download about 1.4 GB.")
    runtime = arguments[arguments.index("--runtime") + 1] if "--runtime" in arguments else "cpu"
    into = Path(arguments[arguments.index("--into") + 1] if "--into" in arguments else
                Path.home() / ".cache/voyagershell/voice") / VERSION
    into.mkdir(parents=True, exist_ok=True)
    for name, (base, size, sha256) in FILES.items():
        fetch(base + name, into / name, size, sha256)
    archive, size, sha256 = RUNTIMES[runtime]
    fetch(RELEASE + archive, into / archive, size, sha256)
    unpacked = into / runtime
    if not (unpacked / "llama-b12242/llama-server").is_file():
        unpack(into / archive, unpacked)
    server = unpacked / "llama-b12242/llama-server"
    names = list(FILES)
    command = [str(server), "-m", str(into / names[0]), "-mm", str(into / names[1]), "--host", "127.0.0.1", "--jinja",
               "--reasoning", "off", "--temp", "0", "-c", "8192"] + (["-ngl", "999"] if runtime == "vulkan" else [])
    (into / "ready.json").write_text(json.dumps({"version": VERSION, "runtime": runtime, "licence": LICENCE, "command": command}, indent=2))
    print(f"LD_LIBRARY_PATH={server.parent} " + " ".join(command))


if __name__ == "__main__":
    main(sys.argv[1:])
