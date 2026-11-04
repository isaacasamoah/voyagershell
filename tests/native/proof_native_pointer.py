import math
import subprocess
import time

from gi.repository import Gio, GLib

remote = "org.gnome.Mutter.RemoteDesktop"
cast = "org.gnome.Mutter.ScreenCast"
config = "org.gnome.Mutter.DisplayConfig"
properties = "org.freedesktop.DBus.Properties"


class Pointer:
    def __init__(self, invoke, session, bus):
        self.invoke = invoke
        self.session = session
        self.bus = bus
        self.streams = []
        self.nodes = {}
        session_id = invoke(
            session,
            properties,
            "Get",
            GLib.Variant("(ss)", (remote + ".Session", "SessionId")),
        ).unpack()[0]
        cast_session = invoke(
            "/org/gnome/Mutter/ScreenCast",
            cast,
            "CreateSession",
            GLib.Variant(
                "(a{sv})",
                ({"remote-desktop-session-id": GLib.Variant("s", session_id)},),
            ),
            bus_name=cast,
        ).unpack()[0]
        monitors = invoke(
            "/org/gnome/Mutter/DisplayConfig",
            config,
            "GetCurrentState",
            bus_name=config,
        ).unpack()[2]
        for monitor in monitors:
            stream = invoke(
                cast_session,
                cast + ".Session",
                "RecordMonitor",
                GLib.Variant("(sa{sv})", (monitor[5][0][0], {})),
                bus_name=cast,
            ).unpack()[0]
            params = invoke(
                stream,
                properties,
                "Get",
                GLib.Variant("(ss)", (cast + ".Stream", "Parameters")),
                bus_name=cast,
            ).unpack()[0]
            self.streams.append(
                (stream, params["position"], params["size"], monitor[2])
            )
        self.context = (
            GLib.MainContext.get_thread_default() or GLib.MainContext.default()
        )
        self.subscription = bus.signal_subscribe(
            cast,
            cast + ".Stream",
            "PipeWireStreamAdded",
            None,
            None,
            Gio.DBusSignalFlags.NONE,
            self.stream_added,
        )

    def stream_added(self, _bus, _sender, path, _interface, _signal, params, *_data):
        if any(stream[0] == path for stream in self.streams):
            self.nodes[path] = params.unpack()[0]

    def move(self, x, y, device_scale):
        x = float(x) / float(device_scale)
        y = float(y) / float(device_scale)
        matches = [
            (stream, position, size, scale)
            for stream, position, size, scale in self.streams
            if position[0] <= x < position[0] + size[0]
            and position[1] <= y < position[1] + size[1]
        ]
        if len(matches) != 1:
            raise ValueError("Pointer target is outside the monitor layout")
        stream, position, size, scale = matches[0]
        sent = [(x - position[0]) * scale, (y - position[1]) * scale]
        before = time.monotonic()
        self.invoke(
            self.session,
            remote + ".Session",
            "NotifyPointerMotionAbsolute",
            GLib.Variant("(sdd)", (stream, *sent)),
        )
        acknowledged = time.monotonic()
        time.sleep(0.08)
        return {
            "stream": stream,
            "position": list(position),
            "size": list(size),
            "scale": scale,
            "sent": sent,
            "before": before,
            "acknowledged": acknowledged,
        }

    def button(self, pressed, code=272):
        assert isinstance(pressed, bool) and type(code) is int and code in (272, 273), (
            "Unsupported native button"
        )
        self.invoke(
            self.session,
            remote + ".Session",
            "NotifyPointerButton",
            GLib.Variant("(ib)", (code, pressed)),
        )

    def capture(self, path, rect, device_scale):
        started = time.time()
        device_scale = float(device_scale)
        x, y, width, height = [float(value) / device_scale for value in rect]
        matches = [
            (stream, position, size, scale)
            for stream, position, size, scale in self.streams
            if width > 0
            and height > 0
            and position[0] <= x < x + width <= position[0] + size[0]
            and position[1] <= y < y + height <= position[1] + size[1]
        ]
        if len(matches) != 1:
            raise ValueError("Capture must be wholly inside one monitor")
        stream, position, size, scale = matches[0]
        full_width, full_height = [round(value * scale) for value in size]
        left = math.ceil((x - position[0]) * scale)
        top = math.ceil((y - position[1]) * scale)
        right = math.floor((x + width - position[0]) * scale)
        bottom = math.floor((y + height - position[1]) * scale)
        if not (0 <= left < right <= full_width and 0 <= top < bottom <= full_height):
            raise ValueError("Capture bounds do not contain a complete stream pixel")
        deadline = time.monotonic() + 5
        while stream not in self.nodes:
            self.context.iteration(False)
            if stream not in self.nodes and time.monotonic() >= deadline:
                raise TimeoutError("Mutter did not announce the PipeWire stream")
            time.sleep(0.01)
        node = self.nodes[stream]
        command = [
            "gst-launch-1.0",
            "-q",
            "pipewiresrc",
            f"path={node}",
            "num-buffers=1",
            "!",
            "videoconvert",
            "!",
            f"video/x-raw,format=RGB,width={full_width},height={full_height}",
            "!",
            "videocrop",
            f"left={left}",
            f"top={top}",
            f"right={full_width - right}",
            f"bottom={full_height - bottom}",
            "!",
            "pngenc",
            "snapshot=true",
            "!",
            "fdsink",
            "fd=1",
        ]
        result = subprocess.run(command, capture_output=True, timeout=10, check=False)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors="replace").strip())
        if not result.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("GStreamer did not return a PNG crop")
        with open(path, "xb") as output:
            output.write(result.stdout)
        return {
            "backend": "mutter-screencast-pipewire-gstreamer-rgb-png",
            "path": str(path),
            "requestedBounds": list(rect),
            "croppedBounds": [
                (position[0] + left / scale) * device_scale,
                (position[1] + top / scale) * device_scale,
                (right - left) / scale * device_scale,
                (bottom - top) / scale * device_scale,
            ],
            "streamCrop": [left, top, right - left, bottom - top],
            "sourceDimensions": [full_width, full_height],
            "monitorLogicalBounds": [*position, *size],
            "monitorScale": scale,
            "deviceScale": device_scale,
            "stream": stream,
            "node": node,
            "startedAt": started,
            "finishedAt": time.time(),
        }

    def close(self):
        if self.subscription is not None:
            self.bus.signal_unsubscribe(self.subscription)
            self.subscription = None
