import json
import sys
import time

from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
service = "org.gnome.Mutter.RemoteDesktop"


def call(path, interface, method, args=None, bus_name=service):
    return bus.call_sync(
        bus_name,
        path,
        interface,
        method,
        args,
        None,
        Gio.DBusCallFlags.NONE,
        3000,
        None,
    )


session = call("/org/gnome/Mutter/RemoteDesktop", service, "CreateSession").unpack()[0]
pointer = None
if "--pointer" in sys.argv:
    from proof_native_pointer import Pointer

    pointer = Pointer(call, session, bus)
call(session, service + ".Session", "Start")
accessibility_before = None
try:
    for line in sys.stdin:
        try:
            args = json.loads(line)
            action = args[0]
            result = {"ok": True}
            if action in ("move", "button", "capture"):
                assert pointer is not None, "Pointer session was not prepared"
                if action == "move":
                    pointer.move(*args[1:])
                elif action == "capture":
                    result["capture"] = pointer.capture(*args[1:])
                else:
                    pointer.button(args[1])
            elif action == "accessibility-state":
                from proof_native_accessibility import enabled

                result["enabled"] = enabled()
            elif action in ("fields", "focus"):
                from proof_native_accessibility import enabled, fields

                if accessibility_before is None:
                    accessibility_before = enabled()
                    if not accessibility_before:
                        assert enabled(True), "Accessibility could not be enabled"
                names = (
                    args[2]
                    if action == "fields" and len(args) > 2
                    else ("Note title", "Note text")
                )
                coordinates = (
                    args[3] if action == "fields" and len(args) > 3 else "screen"
                )
                matches = fields(args[1], names, coordinates)
                if action == "fields":
                    result["fields"] = [metadata for _, metadata in matches]
                else:
                    for _ in range(30):
                        targets = [
                            item for item in matches if item[1]["name"] == args[2]
                        ]
                        if len(targets) > args[3]:
                            break
                        time.sleep(0.1)
                        matches = fields(args[1])
                    assert len(targets) > args[3], (
                        "Native editor did not become accessible"
                    )
                    assert targets[args[3]][0].get_component_iface().grab_focus()
            elif action == "key":
                call(
                    session,
                    service + ".Session",
                    "NotifyKeyboardKeysym",
                    GLib.Variant("(ub)", (args[1], args[2])),
                )
            else:
                raise ValueError("Unsupported native input action")
            print(json.dumps(result), flush=True)
        except Exception as error:
            print(json.dumps({"error": str(error)}), flush=True)
finally:
    if pointer is not None:
        pointer.close()
    call(session, service + ".Session", "Stop")
    if accessibility_before is not None:
        from proof_native_accessibility import enabled

        if not accessibility_before:
            enabled(False)
        print(
            json.dumps(
                {
                    "accessibilityBefore": accessibility_before,
                    "accessibilityAfter": enabled(),
                }
            ),
            flush=True,
        )
