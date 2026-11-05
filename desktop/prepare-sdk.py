import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
REVISION = "944803984cf0ba3111861d6e1aa9d6265c109ff9"
URL = "https://github.com/longbridge/gpui-kit"
PATCH = ROOT / "desktop" / "patches" / "gpui-shell-native-overlay.patch"
CHECKOUT = (
    Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    / "voyagershell"
    / "sdk"
    / f"{REVISION}-{hashlib.sha256(PATCH.read_bytes()).hexdigest()[:12]}"
)
CONFIG = ROOT / ".cargo" / "config.toml"
PACKAGES = {
    "gpui-base": "base",
    "gpui-fps": "fps",
    "gpui-kit": "kit",
    "gpui-shell": "shell",
}


def git(*args):
    return subprocess.check_output(["git", "-C", str(CHECKOUT), *args], text=True)


def prepare(check):
    config = f'[patch."{URL}"]\n' + "".join(
        f"{package} = {{ path = {json.dumps(str(CHECKOUT / 'crates' / folder))} }}\n"
        for package, folder in PACKAGES.items()
    )
    if CONFIG.exists() and CONFIG.read_text() != config:
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
    patch = PATCH.read_text()
    difference = git("diff", "--binary", "HEAD")
    if not difference and not check:
        subprocess.run(["git", "-C", str(CHECKOUT), "apply", str(PATCH)], check=True)
        difference = git("diff", "--binary", "HEAD")
    if difference != patch:
        raise RuntimeError("Native SDK differs from the reviewed overlay patch")
    if not CONFIG.exists():
        if check:
            raise RuntimeError("Native SDK Cargo configuration is missing")
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        with CONFIG.open("x") as file:
            file.write(config)
    print(
        f"Native SDK ready: {REVISION}, reviewed overlay patch, coherent shared crates"
    )


if __name__ == "__main__":
    if sys.argv[1:] not in ([], ["--check"]):
        raise SystemExit("Usage: python3 desktop/prepare-sdk.py [--check]")
    try:
        prepare(sys.argv[1:] == ["--check"])
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
