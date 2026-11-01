import hashlib
import json
import os
import time
from contextlib import contextmanager

from PIL import ImageChops


def atomic(file, text):
    temporary = file.with_name(file.name + ".proof-tmp")
    if isinstance(text, bytes):
        temporary.write_bytes(text)
    else:
        temporary.write_text(text)
    os.replace(temporary, file)


def once(source, old, new):
    assert source.count(old) == 1, f"Expected one source control anchor: {old}"
    return source.replace(old, new)


class NotesActions:
    def __init__(self, profile, native, pid):
        self.profile, self.native, self.pid = profile, native, pid

    def tap(self, key):
        self.native("key", key, True)
        self.native("key", key, False)

    def widgets(self):
        return self.native("fields", self.pid())["fields"]

    def editors(self):
        result = self.widgets()
        for name in ("Note title", "Note text"):
            assert len([item for item in result if item["name"] == name]) == 2
        return result

    def field(self, name, index):
        return [item for item in self.editors() if item["name"] == name][index]

    def focus(self, name, index):
        self.native("focus", self.pid(), name, index)
        time.sleep(0.1)
        assert self.field(name, index)["focused"], "Expected native editor focus"

    def replace(self, name, index, text):
        self.focus(name, index)
        self.native("key", 65507, True)
        self.tap(ord("a"))
        self.native("key", 65507, False)
        for character in text:
            self.tap(65293 if character == "\n" else ord(character))

    def path(self, id):
        return self.profile / "data" / f"notes-{id}.json"

    def saved(self, id):
        return json.loads(self.path(id).read_text())

    def wait_saved(self, id, key, expected):
        for _ in range(60):
            if self.saved(id)[key] == expected:
                return
            time.sleep(0.05)
        raise AssertionError(f"Notes {id} did not save {key}")


@contextmanager
def source_control(profile, close, start_frame, name, transform):
    package = profile / "mods/notes/main.js"
    source = package.read_text()
    controlled = transform(source)
    close()
    atomic(package, controlled)
    try:
        start_frame(f"{name}-start")
        yield
    finally:
        try:
            close()
        finally:
            atomic(package, source)


def status_rect(body):
    return body["x"], body["y"] + body["height"] + 32, body["width"], 48


def image_crop(image, geometry, rect):
    scale = image.width / int(geometry()["WIDTH"])
    x, y, width, height = rect
    bounds = tuple(round(value * scale) for value in (x, y, x + width, y + height))
    assert 0 <= bounds[0] < bounds[2] <= image.width
    assert 0 <= bounds[1] < bounds[3] <= image.height
    return image.crop(bounds)


def known_refusal_clears(*, profile, evidence, native, pid, capture, close, **_options):
    notes = NotesActions(profile, native, pid)
    notes.editors()
    original = notes.path("a").read_bytes()
    protected = notes.path("b").read_bytes()
    capture("known-refusal-baseline")
    try:
        atomic(notes.path("a"), "{")
        notes.replace("Note title", 0, "Retry unchanged draft")
        notes.focus("Note title", 1)
        time.sleep(0.5)
        capture("known-refusal-invalid-data")
        assert notes.path("a").read_bytes() == b"{", "Refusal changed invalid data"
        assert notes.path("b").read_bytes() == protected
        atomic(notes.path("a"), original)
        notes.focus("Note title", 0)
        notes.focus("Note title", 1)
        notes.wait_saved("a", "title", "Retry unchanged draft")
        assert notes.path("b").read_bytes() == protected
        capture("known-refusal-cleared-saved")
    except BaseException:
        close()
        atomic(notes.path("a"), original)
        assert notes.path("b").read_bytes() == protected
        raise
    return ["known-refusal-clears-with-unchanged-draft"]


def delayed_initial_read(
    *, profile, evidence, native, pid, capture, close, start_frame, **_options
):
    notes = NotesActions(profile, native, pid)
    original = notes.saved("a")
    protected = notes.path("b").read_bytes()
    delayed = """if (this.id === "notes-a") {
      cx.timer.after(2500, (task) => {
        if (!this.dirty) throw Error("Proof edit did not precede initial read");
        this.read(task);
      });
    } else {
      this.read(cx);
    }"""
    with source_control(
        profile,
        close,
        start_frame,
        "delayed-read",
        lambda source: once(source, "this.read(cx);", delayed),
    ):
        notes.replace("Note title", 0, "Title before first read")
        assert notes.saved("a") == original, "Typing unexpectedly saved before blur"
        capture("delayed-read-typed-before-response")
        notes.focus("Note text", 0)
        time.sleep(3)
        notes.wait_saved("a", "title", "Title before first read")
        assert notes.saved("a")["text"] == original["text"], (
            "Initial body was not hydrated"
        )
        assert notes.path("b").read_bytes() == protected
        expected = notes.saved("a")
        capture("delayed-read-saved")
        (evidence / "delayed-read-fields.json").write_text(
            json.dumps(notes.editors(), indent=2)
        )
    start_frame("delayed-read-reopened")
    assert notes.saved("a") == expected and notes.path("b").read_bytes() == protected
    notes.editors()
    return [
        "edit-before-initial-read-preserved-and-hydrated",
        "delayed-read-save-reopened",
    ]


def uncertain_confirmation(
    *, profile, evidence, native, pid, capture, close, start_frame, geometry, **_options
):
    notes = NotesActions(profile, native, pid)

    def transform(source):
        source = once(
            source,
            "return invoke(JSON.stringify(request)).then((raw) => {",
            """if (operation === "content.update") {
      this.proofUpdates = (this.proofUpdates || 0) + 1;
    }
    return invoke(JSON.stringify(request)).then((raw) => {""",
        )
        source = once(
            source,
            "return result;",
            """if (operation === "content.update" && !this.proofLost) {
        if (result.status !== "applied") throw Error("Real proof update did not apply");
        const uncertain = {
          version: result.version,
          status: "uncertain",
          requestId: result.requestId,
          contentId: result.contentId,
          expectedRevision: request.expectedRevision,
          message: "Proof: real write applied; confirmation deliberately withheld",
        };
        if (!validateResponse(uncertain) ||
            uncertain.requestId !== request.requestId ||
            uncertain.contentId !== request.contentId ||
            uncertain.expectedRevision !== request.expectedRevision) {
          throw Error("Invalid uncertain proof confirmation");
        }
        this.proofLost = true;
        return uncertain;
      }
      return result;""",
        )
        return once(
            source,
            ".child(this.status)",
            """.child(
        div().h(24).child(`Proof updates ${this.proofUpdates || 0}; loss ${!!this.proofLost}`)
      )
      .child(div().child(this.status))""",
        )

    with source_control(profile, close, start_frame, "uncertain", transform):
        original_body = notes.saved("a")["text"]
        protected_b = notes.path("b").read_bytes()
        notes.replace("Note title", 0, "Real write with lost confirmation")
        region = status_rect(notes.field("Note text", 0))
        before = image_crop(capture("uncertain-before-blur"), geometry, region)
        notes.focus("Note title", 1)
        notes.wait_saved("a", "title", "Real write with lost confirmation")
        assert notes.saved("a")["text"] == original_body
        applied = notes.path("a").read_bytes()
        time.sleep(0.4)
        first = image_crop(capture("uncertain-first-confirmation"), geometry, region)
        assert ImageChops.difference(before, first).getbbox(), (
            "Proof counter was not visible"
        )
        notes.focus("Note title", 0)
        notes.focus("Note title", 1)
        time.sleep(0.4)
        second = image_crop(
            capture("uncertain-unchanged-second-blur"), geometry, region
        )
        assert ImageChops.difference(first, second).getbbox() is None, (
            "Unchanged blur issued another update"
        )
        assert (
            notes.path("a").read_bytes() == applied
            and notes.path("b").read_bytes() == protected_b
        )
        (evidence / "uncertain-proof.json").write_text(
            json.dumps(
                {
                    "simulation": "Applied response replaced once by validated uncertain response",
                    "expectedUpdateCalls": 1,
                    "counterWindowBounds": region,
                    "appliedSha256": hashlib.sha256(applied).hexdigest(),
                    "fields": notes.editors(),
                },
                indent=2,
            )
        )
    start_frame("uncertain-source-restored")
    return [
        "real-applied-write-with-lost-confirmation",
        "uncertain-generation-not-replayed",
    ]


def resize_and_refresh(
    *, profile, evidence, native, pid, capture, close, start_frame, geometry, **_options
):
    notes = NotesActions(profile, native, pid)
    actions = """.w_full().h(24)
      .on_mouse_down("left", (event, cx) => {
        if (this.id !== "notes-a") return;
        cx.stop_propagation();
        if (event.local_position.x < event.bounds.width / 2) {
          this.title.set_value("A updated while B is dirty");
          this.changed("title", cx);
          this.save(cx);
        } else {
          window.push_toast({ id: "n2-root-proof", title: "Root repaint", timeout: 1000 });
        }
      })
      .child(this.status || "Proof actions")"""

    def move(x, y):
        bounds = geometry()
        native("move", int(bounds["X"]) + round(x), int(bounds["Y"]) + round(y), 2)

    def click(x, y):
        move(x, y)
        native("button", True)
        native("button", False)

    with source_control(
        profile,
        close,
        start_frame,
        "resilience",
        lambda source: once(source, ".child(this.status)", actions),
    ):
        notes.focus("Note title", 0)
        a, b = notes.field("Note text", 0), notes.field("Note text", 1)
        initial = capture("resize-before")
        protected_b = notes.path("b").read_bytes()
        grip_x, grip_y = a["x"] + a["width"] - 16, a["y"] + a["height"] + 28
        move(grip_x, grip_y)
        native("button", True)
        try:
            move(grip_x, grip_y + 24)
            move(grip_x, grip_y + 120)
        finally:
            native("button", False)
        time.sleep(0.3)
        grown, unchanged = notes.field("Note text", 0), notes.field("Note text", 1)
        assert grown["height"] >= a["height"] + 80, "Body editing viewport did not grow"
        assert unchanged == b, "Resizing A changed B editor bounds/state"
        resized = capture("resize-after")
        region = (
            initial.width // 2,
            initial.height // 5,
            initial.width,
            initial.height,
        )
        assert (
            ImageChops.difference(initial.crop(region), resized.crop(region)).getbbox()
            is None
        )
        notes.replace("Note title", 1, "B retains this unsaved draft")
        status = status_rect(grown)
        click(status[0] + status[2] / 4, status[1] + status[3] / 2)
        notes.wait_saved("a", "title", "A updated while B is dirty")
        assert notes.path("b").read_bytes() == protected_b
        assert notes.field("Note title", 1)["focused"], "A action stole B focus"
        capture("dirty-b-after-a-update")
        click(status[0] + status[2] * 3 / 4, status[1] + status[3] / 2)
        observations = []
        for delay in (0.05, 0.3, 1.1):
            time.sleep(delay)
            observations.append(notes.editors())
            assert notes.field("Note title", 1)["focused"], "Root toast stole B focus"
            assert notes.path("b").read_bytes() == protected_b
        capture("dirty-b-after-root-overlay")
        notes.focus("Note title", 0)
        notes.wait_saved("b", "title", "B retains this unsaved draft")
        (evidence / "resize-and-refresh.json").write_text(
            json.dumps(
                {
                    "bodyBefore": a,
                    "bodyAfter": grown,
                    "bodyB": unchanged,
                    "rootOverlayFields": observations,
                },
                indent=2,
            )
        )
    start_frame("resilience-source-restored")
    return [
        "native-body-viewport-resize",
        "dirty-b-survives-a-update",
        "root-overlay-retains-editors",
    ]


def pointer_diagnostic(profile, evidence, native, capture, geometry):
    assert not native("accessibility-state")["enabled"], (
        "Expected unchanged disabled accessibility"
    )
    initial = capture("notes-pointer-initial")
    bounds = geometry()

    def click(x, y):
        native("move", int(bounds["X"]) + x, int(bounds["Y"]) + y, 2)
        native("button", True)
        native("button", False)

    def tap(key):
        native("key", key, True)
        native("key", key, False)

    click(250, 405)
    native("key", 65507, True)
    tap(ord("a"))
    native("key", 65507, False)
    for character in "Pointer alpha":
        tap(ord(character))
    click(250, 510)
    time.sleep(0.4)
    assert (
        json.loads((profile / "data/notes-a.json").read_text())["title"]
        == "Pointer alpha"
    )
    edited = capture("notes-pointer-edited")
    region = (initial.width // 2, initial.height // 5, initial.width, initial.height)
    assert (
        ImageChops.difference(initial.crop(region), edited.crop(region)).getbbox()
        is None
    )
    assert not native("accessibility-state")["enabled"]
    return ["pointer-edit-with-accessibility-disabled"]


def prove(
    *,
    profile,
    evidence,
    native,
    pid,
    capture,
    close,
    start_frame,
    resize_window,
    geometry,
    pointer_only,
):
    if pointer_only:
        return pointer_diagnostic(profile, evidence, native, capture, geometry)
    notes = NotesActions(profile, native, pid)
    tap, widgets, focus, replace = notes.tap, notes.widgets, notes.focus, notes.replace
    path, saved, wait_saved = notes.path, notes.saved, notes.wait_saved

    time.sleep(0.5)
    capture("notes-initial")
    activation_started = time.monotonic()
    initial = widgets()
    while any(
        sum(item["name"] == name for item in initial) != 2
        for name in ("Note title", "Note text")
    ):
        remaining = activation_started + 1 - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(0.1, remaining))
        initial = widgets()
    (evidence / "notes-accessibility.json").write_text(json.dumps(initial, indent=2))
    for name in ("Note title", "Note text"):
        matches = [item for item in initial if item["name"] == name]
        assert len(matches) == 2, f"Expected two real native {name} editors"
        assert all(item["width"] > 0 and item["height"] > 0 for item in matches)
    baseline = {id: saved(id) for id in ("a", "b")}
    replace("Note title", 0, "Alpha work")
    assert saved("a") == baseline["a"], "Typing must wait for blur before saving"
    tap(65289)
    wait_saved("a", "title", "Alpha work")
    (evidence / "notes-after-title.json").write_text(json.dumps(widgets(), indent=2))
    replace("Note text", 0, "first line\nsecond line")
    assert saved("a")["text"] == baseline["a"]["text"], "Enter must insert a newline"
    observed = widgets()
    (evidence / "notes-after-body.json").write_text(json.dumps(observed, indent=2))
    capture("notes-after-body")
    if len([item for item in observed if item["name"] == "Note title"]) != 2:
        resize_window()
        capture("notes-after-window-resize")
        (evidence / "notes-resize-diagnostic.json").write_text(
            json.dumps(widgets(), indent=2)
        )
        raise AssertionError(
            "Editing A removed B accessibility nodes; resize diagnostic retained"
        )
    focus("Note title", 1)
    wait_saved("a", "text", "first line\nsecond line")
    replace("Note title", 1, "Beta draft")
    assert saved("b") == baseline["b"], "The second draft must remain unsaved"
    capture("notes-b-draft")
    focus("Note title", 0)
    wait_saved("b", "title", "Beta draft")
    expected = {id: saved(id) for id in ("a", "b")}
    capture("notes-saved")
    close()
    start_frame("notes-reopened")
    assert {id: saved(id) for id in ("a", "b")} == expected
    (evidence / "notes-reopened-expected.json").write_text(
        json.dumps(expected, indent=2)
    )
    for name in ("Note title", "Note text"):
        assert len([item for item in widgets() if item["name"] == name]) == 2
    external = {"title": "External alpha", "text": "external decision"}
    atomic(path("a"), json.dumps(external))
    unchanged = path("a").read_bytes()
    replace("Note title", 0, "Stale choice")
    tap(65289)
    time.sleep(0.4)
    assert path("a").read_bytes() == unchanged, "A stale update changed real data"
    capture("notes-stale-refusal")
    atomic(path("a"), "{")
    replace("Note title", 0, "Invalid data choice")
    tap(65289)
    time.sleep(0.4)
    assert path("a").read_bytes() == b"{", "Malformed data was silently overwritten"
    capture("notes-invalid-refusal")
    atomic(path("a"), json.dumps(external))
    close()
    start_frame("notes-after-refusals")
    assert saved("a") == external and saved("b") == expected["b"]
    package = profile / "mods/notes/main.js"
    source = package.read_text()
    revision = hashlib.sha256(path("b").read_bytes()).hexdigest()
    protected_b = path("b").read_bytes()
    forged = json.dumps(
        {
            "version": "1",
            "operation": "content.update",
            "requestId": "scope-ui",
            "contentId": "notes-b",
            "expectedRevision": revision,
            "data": {"title": "Forged choice", "text": "must not apply"},
        }
    )
    replacement = """if (this.id === "notes-a") {
      cx.spawn(async (task) => {
        const request = FORGED_REQUEST;
        if (!validateRequest(request)) throw Error("Invalid proof request");
        const response = JSON.parse(await invoke(JSON.stringify(request)));
        if (!validateResponse(response)) throw Error("Invalid proof response");
        this.status = `${response.status}: ${response.message}`;
        task.notify();
      });
    } else { this.read(cx); }""".replace("FORGED_REQUEST", forged)
    assert source.count("this.read(cx);") == 1
    close()
    atomic(package, source.replace("this.read(cx);", replacement))
    start_frame("notes-forged-request")
    time.sleep(0.5)
    capture("notes-forged-refusal")
    assert path("b").read_bytes() == protected_b, "Forged A call changed B"
    close()
    atomic(package, source)
    start_frame("notes-final")
    return [
        "native-labeled-editors",
        "blur-save-and-body-newline",
        "A-B-persistence",
        "stale-and-invalid-refused-unchanged",
        "captured-A-forgery-refused",
    ]
