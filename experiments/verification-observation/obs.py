import json, os, socket, subprocess, sys, time

evidence, pid, window = sys.argv[1], int(sys.argv[2]), sys.argv[3]
inspect_path = os.path.join(evidence, "inspect.json")
out = {"errors": []}
TARGETS = ["fleet", "split", "notes", "avatar"]


def save():
    json.dump(out, open(os.path.join(evidence, "observation-result.json"), "w"), indent=1)


def rpc(method, params):
    s = socket.socket(socket.AF_UNIX)
    s.connect(os.environ["HC_SOCKET"])
    s.sendall((json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}) + "\n").encode())
    data = b""
    while not data.endswith(b"\n"):
        chunk = s.recv(65536)
        if not chunk:
            break
        data += chunk
    return json.loads(data)["result"]


def layout():
    return rpc("doc.get", {"name": "voyager-layout-v1"})["value"]


def sh(*args):
    return subprocess.run(args, capture_output=True, text=True, timeout=10).stdout.strip()


def shot(name):
    sh("import", "-window", window, os.path.join(evidence, name + ".png"))


def click(box):
    x, y = int(box[0] + box[2] / 2), int(box[1] + box[3] / 2)
    sh("xdotool", "mousemove", "--window", window, str(x), str(y))
    time.sleep(0.2)
    sh("xdotool", "click", "1")


def until(name, fn, timeout=15.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.05)
    raise RuntimeError("timed out: " + name)


def placements():
    value = layout()
    voyage = value["voyages"][0]
    fleet = voyage["fleets"][0]
    types = {c["id"]: c["typeId"] for c in value["contents"]}
    return value, fleet, [(v["id"], types.get(v["content"]), v["name"]) for v in fleet["vessels"]]


def endpoint_snapshot():
    try:
        with open(inspect_path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def endpoint_find(ids):
    snap = endpoint_snapshot()
    if not snap:
        return {}
    elements = snap["elements"]
    found = {}
    for target, match in ids.items():
        hits = [e for key, e in elements.items() if match(key, e)]
        if len(hits) == 1:
            e = hits[0]
            s = e.get("scale", 1)
            found[target] = [round(e["x"] * s), round(e["y"] * s), round(e["width"] * s), round(e["height"] * s)]
        elif len(hits) > 1:
            found[target] = "ambiguous"
    return found


def endpoint_ids(first, notes, fleet_id):
    return {
        "fleet": lambda k, e: k.startswith('navigation-{"kind":"fleet","id":"%s"}' % fleet_id),
        "split": lambda k, e: k == "split-%s-right" % first,
        "notes": lambda k, e: k.startswith('navigation-{"kind":"vessel","id":"%s"}' % notes),
        "avatar": lambda k, e: k == "voyager-avatar",
        "toggle": lambda k, e: k == "toggle-sidebar",
        "create-notes": lambda k, e: k == "create-notes-vessel",
    }


def time_lookups(name, fn, n=10):
    times, results = [], []
    for _ in range(n):
        t = time.perf_counter()
        r = fn()
        times.append((time.perf_counter() - t) * 1000)
        results.append(r)
    times.sort()
    return {"approach": name, "medianMs": times[n // 2], "maxMs": times[-1], "minMs": times[0],
            "allFoundEveryTime": all(all(isinstance(r.get(t), list) for t in TARGETS) for r in results),
            "consistent": all(r == results[0] for r in results), "last": results[-1]}


def stable(fn, settle=0.4, timeout=15.0):
    start = time.monotonic()
    last, since = None, time.monotonic()
    while time.monotonic() - start < timeout:
        cur = fn()
        if cur != last:
            last, since = cur, time.monotonic()
        elif time.monotonic() - since >= settle and all(isinstance(cur.get(t), list) for t in TARGETS):
            return cur, since - start
        time.sleep(0.03)
    return last, None


def contains(box, point):
    return isinstance(box, list) and box[0] <= point[0] < box[0] + box[2] and box[1] <= point[1] < box[1] + box[3]


def centre(box):
    return [box[0] + box[2] // 2, box[1] + box[3] // 2]


def cpu():
    with open("/proc/%d/stat" % pid) as f:
        fields = f.read().rsplit(")", 1)[1].split()
    return (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK")


def burst(terminal_point, label):
    sh("xdotool", "mousemove", "--window", window, str(terminal_point[0]), str(terminal_point[1]))
    time.sleep(0.2)
    sh("xdotool", "click", "1")
    time.sleep(0.5)
    idle0 = cpu()
    time.sleep(2.0)
    idle = cpu() - idle0
    sh("xdotool", "type", "--delay", "1", "for i in $(seq 1 300); do echo %s-$i; sleep 0.005; done" % label)
    sh("xdotool", "key", "Return")
    start = cpu()
    time.sleep(4.0)
    return {"idleCpuSecondsPer2s": round(idle, 3), "burstCpuSecondsPer4s": round(cpu() - start, 3)}


def settle_both(t0, fns, timeout=15.0, quiet=0.6):
    last = {k: None for k in fns}
    changed = {k: None for k in fns}
    stable_since = time.monotonic()
    while time.monotonic() - t0 < timeout:
        for k, fn in fns.items():
            cur = fn()
            if cur != last[k]:
                last[k] = cur
                changed[k] = time.monotonic() - t0
                stable_since = time.monotonic()
        if time.monotonic() - stable_since > quiet and all(all(isinstance(last[k].get(t), list) for t in TARGETS) for k in fns):
            break
        time.sleep(0.02)
    return last, changed


def window_size(w, h):
    sh("xdotool", "windowsize", window, str(w), str(h))


try:
    until("endpoint snapshot", lambda: endpoint_snapshot() and endpoint_snapshot()["elements"])
    value, fleet, vessels = placements()
    first = vessels[0][0]
    fleet_id = fleet["id"]
    ids = endpoint_ids(first, None, fleet_id)
    split = until("split via endpoint", lambda: endpoint_find({"split": ids["split"]}).get("split"))
    click(split)
    menu = until("create-notes via endpoint", lambda: endpoint_find({"c": ids["create-notes"]}).get("c"))
    click(menu)
    until("notes vessel in layout", lambda: any(t == "notes" for _, t, _ in placements()[2]))
    value, fleet, vessels = placements()
    notes = [p for p, t, _ in vessels if t == "notes"][0]
    out["vessels"] = vessels
    ids = endpoint_ids(first, notes, fleet_id)
    find_endpoint = lambda: endpoint_find({t: ids[t] for t in TARGETS})
    sh("xdotool", "mousemove", "--window", window, "700", "500")

    a_endpoint, settle = stable(find_endpoint)
    out["layoutA"] = {"size": [1450, 940], "endpoint": a_endpoint, "endpointSettleSeconds": settle}
    out["layoutA"]["endpointTiming"] = time_lookups("endpoint", find_endpoint)
    shot("layout-a")

    toggle = until("toggle via endpoint", lambda: endpoint_find({"t": ids["toggle"]}).get("t"))
    t0 = time.monotonic()
    window_size(1180, 820)
    click(toggle)
    last, changed = settle_both(t0, {"endpoint": find_endpoint})
    settle = changed["endpoint"]
    until("sidebar collapsed", lambda: layout()["canvas"]["sidebarCollapsed"])
    sh("xdotool", "mousemove", "--window", window, "700", "500")
    b_endpoint, _ = stable(find_endpoint)
    out["layoutB"] = {"size": [1180, 820], "sidebarCollapsed": True, "endpoint": b_endpoint, "endpointSettleSeconds": settle}
    out["layoutB"]["endpointSnapshotBytes"] = os.path.getsize(inspect_path)
    out["layoutB"]["endpointTiming"] = time_lookups("endpoint", find_endpoint)
    out["layoutB"]["fixedOffsetFromAStillHits"] = {t: contains(b_endpoint.get(t), centre(a_endpoint[t])) for t in TARGETS if isinstance(a_endpoint.get(t), list)}
    out["endpointState"] = endpoint_snapshot()["state"]
    shot("layout-b")

    before = len(placements()[2])
    click(b_endpoint["split"])
    menu = until("create-notes via endpoint B", lambda: endpoint_find({"c": ids["create-notes"]}).get("c"))
    click(menu)
    until("effect: split in layout B added a vessel", lambda: len(placements()[2]) == before + 1)
    out["layoutB"]["endpointSplitEffect"] = True
    value, fleet, vessels = placements()
    out["vesselsAfterB"] = vessels
    first_split = until("first split", lambda: endpoint_find({"s": ids["split"]}).get("s"))
    terminal_point = [first_split[0] - 60, first_split[1] + 300]
    out["a11yOff"] = burst(terminal_point, "OFF")
    save()

    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi, Gio, GLib

    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    t0 = time.monotonic()
    bus.call_sync("org.a11y.Bus", "/org/a11y/bus", "org.freedesktop.DBus.Properties", "Set",
                  GLib.Variant("(ssv)", ("org.a11y.Status", "IsEnabled", GLib.Variant("b", True))),
                  None, Gio.DBusCallFlags.NONE, 3000, None)
    Atspi.init()
    desktop = Atspi.get_desktop(0)

    def application():
        for i in range(desktop.get_child_count()):
            c = desktop.get_child_at_index(i)
            if c is not None and c.get_process_id() == pid:
                return c
        return None

    app = until("AT-SPI application", application)

    notes_name = [n for p, t, n in vessels if p == notes][0]

    def walk(node, acc):
        if node is None or len(acc) > 4000:
            return
        acc.append(node)
        for i in range(node.get_child_count()):
            walk(node.get_child_at_index(i), acc)

    def atspi_find(full=False):
        nodes = []
        walk(app, nodes)
        found, seen = {}, []
        for node in nodes:
            name, role = node.get_name(), node.get_role_name()
            try:
                e = node.get_component_iface().get_extents(Atspi.CoordType.WINDOW)
                box = [e.x, e.y, e.width, e.height]
            except Exception:
                box = None
            if full:
                text = None
                try:
                    ti = node.get_text_iface()
                    if ti is not None:
                        text = ti.get_text(0, -1)[:120]
                except Exception:
                    pass
                seen.append({"name": name, "role": role, "box": box, "text": text, "description": node.get_description()})
            key = None
            if role == "button" and name == fleet["name"]:
                key = "fleet"
            elif name == "Split Vessel right":
                key = "split"
            elif role == "button" and name == notes_name:
                key = "notes"
            elif name == "Voyager avatar":
                key = "avatar"
            if key:
                found.setdefault(key + "_all", []).append(box)
        result = {}
        for t in TARGETS:
            boxes = found.get(t + "_all", [])
            if t == "split" and boxes:
                result[t] = sorted(boxes)[0]
                result["splitCandidates"] = len(boxes)
            elif len(boxes) == 1:
                result[t] = boxes[0]
            elif len(boxes) > 1:
                result[t] = "ambiguous"
        if full:
            result["nodes"] = seen
        return result

    first_tree = until("AT-SPI tree populated", lambda: (lambda r: r if all(isinstance(r.get(t), list) for t in TARGETS) else None)(atspi_find()), timeout=20)
    out["atspiActivationSeconds"] = time.monotonic() - t0
    b_atspi, settle = stable(atspi_find)
    out["layoutB"]["atspi"] = b_atspi
    out["layoutB"]["atspiTiming"] = time_lookups("atspi", atspi_find)
    out["layoutB"]["endpointAfterA11y"] = find_endpoint()
    out["layoutB"]["agree"] = {t: b_atspi.get(t) == out["layoutB"]["endpointAfterA11y"].get(t) for t in TARGETS}
    full = atspi_find(full=True)
    out["atspiNodes"] = full["nodes"]
    out["a11yOn"] = burst(terminal_point, "ON")
    note = [n["box"] for n in full["nodes"] if n["name"] == "Note text"]
    if note:
        click(note[-1])
        time.sleep(0.3)
        sh("xdotool", "type", "--delay", "5", "hello notes")
        time.sleep(1.0)
        texts = []
        for node in []:
            pass
        nodes = []
        walk(app, nodes)
        for node in nodes:
            if node.get_name() in ("Note text", "Note title", "Terminal"):
                entry = {"name": node.get_name(), "isText": node.is_text()}
                try:
                    entry["text"] = node.get_text_iface().get_text(0, -1)[:200]
                except Exception as error:
                    entry["textError"] = str(error)[:120]
                try:
                    entry["value"] = node.get_value_iface().get_current_value()
                except Exception:
                    pass
                texts.append(entry)
        out["atspiText"] = texts
    save()

    toggle = atspi_find(full=True)
    tbox = [n["box"] for n in toggle["nodes"] if n["name"] == "Expand sidebar"]
    t0 = time.monotonic()
    window_size(1450, 940)
    if tbox:
        click(tbox[0])
    last, changed = settle_both(t0, {"atspi": atspi_find, "endpoint": find_endpoint})
    until("sidebar expanded", lambda: not layout()["canvas"]["sidebarCollapsed"])
    sh("xdotool", "mousemove", "--window", window, "700", "500")
    a2_atspi, settle = stable(atspi_find)
    out["layoutA2"] = {"atspi": a2_atspi, "settleSeconds": changed}
    out["layoutA2"]["atspiTiming"] = time_lookups("atspi", atspi_find)
    out["layoutA2"]["endpoint"] = find_endpoint()
    out["layoutA2"]["agree"] = {t: a2_atspi.get(t) == out["layoutA2"]["endpoint"].get(t) for t in TARGETS}
    shot("layout-a2")
except Exception as error:
    import traceback
    out["errors"].append(traceback.format_exc())
save()
