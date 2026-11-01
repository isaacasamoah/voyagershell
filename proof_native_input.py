import json
import sys

from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
service = "org.gnome.Mutter.RemoteDesktop"


def call(path, interface, method, args=None):
    return bus.call_sync(
        service, path, interface, method, args,
        None, Gio.DBusCallFlags.NONE, 3000, None,
    )


session = call("/org/gnome/Mutter/RemoteDesktop", service, "CreateSession").unpack()[0]
call(session, service + ".Session", "Start")
try:
    for line in sys.stdin:
        try:
            action, key, pressed = json.loads(line)
            if action != "key":
                raise ValueError("Unsupported native input action")
            call(
                session, service + ".Session", "NotifyKeyboardKeysym",
                GLib.Variant("(ub)", (key, pressed)),
            )
            print(json.dumps({"ok": True}), flush=True)
        except Exception as error:
            print(json.dumps({"error": str(error)}), flush=True)
finally:
    call(session, service + ".Session", "Stop")
