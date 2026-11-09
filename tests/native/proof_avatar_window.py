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


def warm_restore(*, original, native, capture, geometry, env, wait, name):
    def execute(*arguments):
        return subprocess.check_output(arguments, env=env, text=True, timeout=5)

    geometry()
    execute("xdotool", "windowquit", original["window"])
    state = wait(
        lambda: execute("xprop", "-id", original["window"], "WM_STATE"),
        lambda value: "Iconic" in value,
        "warm workspace close",
    )
    floating = wait(
        lambda: floating_windows(original, geometry, env),
        lambda items: len(items) == 1,
        "one retained floating avatar",
    )[0]
    capture(name + "-warm-floating", floating)
    bounds = geometry(floating)
    native(
        "move",
        int(bounds["X"]) + int(bounds["WIDTH"]) // 2,
        int(bounds["Y"]) + int(bounds["HEIGHT"]) // 2,
        2,
    )
    location = dict(
        line.split("=", 1)
        for line in execute("xdotool", "getmouselocation", "--shell").splitlines()
    )
    assert location["WINDOW"] == floating, location
    native("button", True)
    native("button", False)
    wait(
        lambda: execute("xprop", "-id", original["window"], "WM_STATE"),
        lambda value: "Normal" in value,
        "same workspace Restore",
    )
    assert floating_windows(original, geometry, env) == [floating]
    return {"warmWindowState": state, "restorePointer": location}
