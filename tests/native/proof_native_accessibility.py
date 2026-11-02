import gi
import time

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, Gio, GLib


def enabled(value=None):
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    args = ("org.a11y.Status", "IsEnabled")
    method = "Get" if value is None else "Set"
    variant = (
        GLib.Variant("(ss)", args)
        if value is None
        else GLib.Variant("(ssv)", (*args, GLib.Variant("b", value)))
    )
    result = bus.call_sync(
        "org.a11y.Bus",
        "/org/a11y/bus",
        "org.freedesktop.DBus.Properties",
        method,
        variant,
        None,
        Gio.DBusCallFlags.NONE,
        3000,
        None,
    )
    return result.unpack()[0] if value is None else enabled()


def fields(pid, names=("Note title", "Note text"), coordinate_space="screen"):
    Atspi.init()
    desktop = Atspi.get_desktop(0)
    for _ in range(30):
        while GLib.MainContext.default().pending():
            GLib.MainContext.default().iteration(False)
        applications = []
        for index in range(desktop.get_child_count()):
            application = desktop.get_child_at_index(index)
            if application.get_process_id() == pid:
                applications.append(application)
        if len(applications) == 1:
            break
        time.sleep(0.1)
    assert len(applications) == 1, "No unique accessible candidate application"
    pending = applications
    result = []
    visited = 0
    while pending:
        node = pending.pop()
        visited += 1
        assert visited <= 512, "Unexpectedly large candidate accessibility tree"
        name = node.get_name()
        if names is None or name in names:
            coordinates = {
                "screen": Atspi.CoordType.SCREEN,
                "window": Atspi.CoordType.WINDOW,
            }
            try:
                rectangle = node.get_component_iface().get_extents(
                    coordinates[coordinate_space]
                )
            except Exception:
                if names is not None:
                    raise
                rectangle = None
            try:
                value = (
                    node.get_text_iface().get_text(0, -1) if node.is_text() else None
                )
            except Exception:
                if names is not None:
                    raise
                value = None
            metadata = {
                "name": name,
                "role": node.get_role_name(),
                "description": node.get_description(),
                "value": value,
                "x": rectangle.x if rectangle else None,
                "y": rectangle.y if rectangle else None,
                "width": rectangle.width if rectangle else None,
                "height": rectangle.height if rectangle else None,
                "focused": node.get_state_set().contains(Atspi.StateType.FOCUSED),
            }
            result.append((node, metadata))
        pending.extend(
            node.get_child_at_index(index) for index in range(node.get_child_count())
        )
    return sorted(result, key=lambda item: (item[1]["x"] or 0, item[1]["y"] or 0))
