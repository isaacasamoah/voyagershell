import argparse
import importlib
import runpy
import sys
from pathlib import Path

ROUTES = {
    "--foundation": ("tests/native", "proof_native_mod_host"),
    "--reference": ("experiments/electron-reference", None),
    "--native-mod-host": ("tests/native", "proof_native_mod_host"),
    "--native-avatar": ("experiments/gpui-avatar", "proof_native_avatar"),
}


def main():
    parser = argparse.ArgumentParser(
        description="Historical reproduction only. Choose one explicit legacy route.",
        epilog="Use tests/native/target/debug/voyager-verification for native verification. See tests/native/README.md.",
        add_help=False,
    )
    routes = parser.add_mutually_exclusive_group(required=True)
    for option in ROUTES:
        routes.add_argument(option, dest="route", action="store_const", const=option)
    parser.add_argument("--legacy-reproduction", action="store_true")
    arguments = sys.argv[1:]
    if not any(option in arguments for option in ROUTES) and any(
        option in arguments for option in ("-h", "--help")
    ):
        parser.print_help()
        return
    selected, remaining = parser.parse_known_args(arguments)
    root = Path(__file__).resolve().parent
    if not selected.legacy_reproduction and not any(
        option in remaining for option in ("-h", "--help")
    ):
        parser.error("Use voyager-verification. Historical drivers require --legacy-reproduction; they do not extend native environment coverage.")
    folder, module = ROUTES[selected.route]
    directory = root / folder
    sys.path.insert(0, str(directory))
    sys.argv = [sys.argv[0], *([] if module is None else [selected.route]), *remaining]
    if module is None:
        runpy.run_path(str(directory / "proof.py"), run_name="__main__")
    else:
        importlib.import_module(module).run()


if __name__ == "__main__":
    main()
