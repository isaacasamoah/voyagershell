import importlib
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
for option, folder, module in [
    ("--native-mod-host", "native-content", "proof_native_mod_host"),
    ("--native-avatar", "gpui-avatar", "proof_native_avatar"),
    ("--foundation", "native-content", "proof_native_mod_host"),
]:
    if option in sys.argv:
        sys.path.insert(0, str(root / "desktop"))
        sys.path.insert(0, str(root / "experiments" / folder))
        importlib.import_module(module).run()
        break
else:
    directory = root / "experiments/electron-reference"
    sys.path.insert(0, str(directory))
    runpy.run_path(str(directory / "proof.py"), run_name="__main__")
