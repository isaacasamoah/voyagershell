import gi
import time

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, Gio, GLib


def enabled(value=None):
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    args = ("org.a11y.Status", "IsEnabled")
    method = "Get" if value is None else "Set"
    variant = GLib.Variant("(ss)", args) if value is None else GLib.Variant(
        "(ssv)", (*args, GLib.Variant("b", value))
    )
    result = bus.call_sync(
        "org.a11y.Bus", "/org/a11y/bus", "org.freedesktop.DBus.Properties",
        method, variant, None, Gio.DBusCallFlags.NONE, 3000, None,
    )
    return result.unpack()[0] if value is None else enabled()


def fields(pid):
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
        if name in ("Note title", "Note text"):
            rectangle = node.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
            value = node.get_text_iface().get_text(0, -1) if node.is_text() else None
            metadata = {
                "name": name,
                "role": node.get_role_name(),
                "value": value,
                "x": rectangle.x,
                "y": rectangle.y,
                "width": rectangle.width,
                "height": rectangle.height,
                "focused": node.get_state_set().contains(Atspi.StateType.FOCUSED),
            }
            result.append((node, metadata))
        pending.extend(
            node.get_child_at_index(index) for index in range(node.get_child_count())
        )
    return sorted(result, key=lambda item: (item[1]["x"], item[1]["y"]))
