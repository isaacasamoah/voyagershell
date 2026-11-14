import subprocess


def floating_windows(launch, geometry, env):
    windows = subprocess.check_output(
        ["xdotool", "search", "--pid", str(launch["pid"])], env=env, text=True
    ).splitlines()
    floating = []
    for window in windows:
        if window == launch["window"]:
            continue
        try:
            bounds = geometry(window)
        except subprocess.CalledProcessError:
            remaining = subprocess.check_output(
                ["xdotool", "search", "--pid", str(launch["pid"])],
                env=env,
                text=True,
            ).splitlines()
            if window in remaining:
                raise
            continue
        if bounds["WIDTH"] == "240" and bounds["HEIGHT"] == "240":
            floating.append(window)
    return floating
