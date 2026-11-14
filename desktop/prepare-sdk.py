import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
REVISION = "944803984cf0ba3111861d6e1aa9d6265c109ff9"
URL = "https://github.com/longbridge/gpui-kit"
PATCHES = (
    ROOT / "desktop" / "patches" / "gpui-shell-native-overlay.patch",
    ROOT / "desktop" / "patches" / "gpui-shell-engine-limits.patch",
)
CHECKOUT = (
    Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    / "voyagershell"
    / "sdk"
    / f"{REVISION}-"
    f"{hashlib.sha256(b''.join(p.read_bytes() for p in PATCHES)).hexdigest()[:12]}"
)
CONFIG = ROOT / ".cargo" / "config.toml"
PACKAGES = {
    "gpui-base": "base",
    "gpui-fps": "fps",
    "gpui-kit": "kit",
    "gpui-shell": "shell",
}
LINUX_VERSION = "0.3.10"
LINUX_SHA256 = "7c6ffd2dce7b75cce0bb3382994912f84c2a05389a4a236bb8bd72cb098fc083"
LINUX_PATCHES = (
    ROOT / "desktop" / "patches" / "gpui-linux-mailbox.patch",
    ROOT / "desktop" / "patches" / "gpui-linux-monitor-clock.patch",
)
LINUX_SOURCE = CHECKOUT.parent / (
    f"gpui-pre-linux-{LINUX_VERSION}-"
    f"{hashlib.sha256(b''.join(p.read_bytes() for p in LINUX_PATCHES)).hexdigest()[:12]}"
)


def prepare_linux(check):
    name = f"gpui-pre-linux-{LINUX_VERSION}"
    cargo = Path(os.environ.get("CARGO_HOME") or Path.home() / ".cargo")
    cached = list((cargo / "registry" / "cache").glob(f"*/{name}.crate"))
    if cached:
        archive = cached[0].read_bytes()
    else:
        with urllib.request.urlopen(
            f"https://static.crates.io/crates/gpui-pre-linux/{name}.crate", timeout=30
        ) as response:
            archive = response.read()
    if hashlib.sha256(archive).hexdigest() != LINUX_SHA256:
        raise RuntimeError("Native Linux source differs from the pinned archive")
    with tempfile.TemporaryDirectory(prefix="voyager-platform-") as directory:
        with tarfile.open(fileobj=io.BytesIO(archive)) as package:
            package.extractall(directory, filter="data")
        source = Path(directory) / name
        subprocess.run(
            ["git", "apply", *(str(p) for p in LINUX_PATCHES)], cwd=source, check=True
        )
        expected = {p.relative_to(source): p.read_bytes() for p in source.rglob("*") if p.is_file()}
        if LINUX_SOURCE.exists():
            actual = {
                p.relative_to(LINUX_SOURCE): p.read_bytes()
                for p in LINUX_SOURCE.rglob("*") if p.is_file()
            }
            if actual != expected:
                raise RuntimeError("Preserving modified native Linux source")
        elif check:
            raise RuntimeError("Native Linux source is not prepared")
        else:
            LINUX_SOURCE.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, LINUX_SOURCE)


def git(*args, env=None):
    return subprocess.check_output(
        ["git", "-C", str(CHECKOUT), *args], text=True, env=env
    )


def reviewed_tree():
    with tempfile.TemporaryDirectory(prefix="voyager-sdk-index-") as directory:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(directory) / "index")}
        git("read-tree", REVISION, env=env)
        git("apply", "--cached", *(str(p) for p in PATCHES), env=env)
        return git("write-tree", env=env).strip()


def prepare(check):
    previous = f'[patch."{URL}"]\n' + "".join(
        f"{package} = {{ path = {json.dumps(str(CHECKOUT / 'crates' / folder))} }}\n"
        for package, folder in PACKAGES.items()
    )
    config = previous + (
        '\n[patch.crates-io]\n'
        f'gpui-pre-linux = {{ path = {json.dumps(str(LINUX_SOURCE))} }}\n'
    )
    existing = CONFIG.read_text() if CONFIG.exists() else None
    if existing is not None and existing != config and (check or existing != previous):
        raise RuntimeError(f"Preserving existing Cargo configuration: {CONFIG}")
    if not CHECKOUT.exists():
        if check:
            raise RuntimeError(
                "Native SDK is not prepared; run python3 desktop/prepare-sdk.py"
            )
        CHECKOUT.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--filter=blob:none", "--no-checkout", URL, str(CHECKOUT)],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(CHECKOUT), "checkout", "--detach", REVISION], check=True
        )
    if git("rev-parse", "HEAD").strip() != REVISION:
        raise RuntimeError("Native SDK revision differs from the pinned source")
    if git("ls-files", "--others", "--exclude-standard").strip():
        raise RuntimeError(
            "Native SDK contains untracked source; preserving it unchanged"
        )
    if not git("diff", "--binary", "HEAD") and not check:
        git("apply", *(str(p) for p in PATCHES))
    if git("diff", "--binary", reviewed_tree()):
        raise RuntimeError("Native SDK differs from the reviewed overlay patches")
    prepare_linux(check)
    if existing != config:
        if check:
            raise RuntimeError("Native SDK Cargo configuration is missing")
        if (CONFIG.read_text() if CONFIG.exists() else None) != existing:
            raise RuntimeError(f"Preserving changed Cargo configuration: {CONFIG}")
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        with CONFIG.open("x" if existing is None else "w") as file:
            file.write(config)
    print(
        f"Native SDK ready: {REVISION}, reviewed overlay patches, coherent shared crates"
    )


if __name__ == "__main__":
    if sys.argv[1:] not in ([], ["--check"]):
        raise SystemExit("Usage: python3 desktop/prepare-sdk.py [--check]")
    try:
        prepare(sys.argv[1:] == ["--check"])
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
