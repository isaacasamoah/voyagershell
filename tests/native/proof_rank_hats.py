import json
import time

from proof_process import process_identity
from proof_workspace import core_rpc, named_button, wait


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "rank-hats"
    rpc = lambda method, params={}: core_rpc(session, env, method, params)
    document = lambda: rpc("doc.get", {"name": "voyager-layout-v1"})
    observed = {
        "trial": "rank-hats",
        "modelPromptsSubmittedByFixture": 0,
        "vesselStartup": "codex --no-daemon --yolo",
        "portalStartup": "existing Create Codex Portal operation",
    }

    def press(name, roles=("button", "push button", "menu item", "menu_item")):
        point = named_button(native, evidence, name, roles=roles)
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(point[0] * 2),
            int(bounds["Y"]) + round(point[1] * 2),
            2,
        )
        time.sleep(0.15)
        native("button", True)
        native("button", False)

    def state(content, rank):
        return wait(
            document,
            lambda d: any(
                c["id"] == content and c.get("rank", "crew") == rank
                for c in d["value"]["contents"]
            ),
            rank + " persisted at the owner",
        )

    def promote(panel, desired):
        current = document()["value"]
        voyage = current["voyages"][0]
        panel_data = next(
            p
            for p in voyage["fleets"][0]["vessels"] + voyage["portals"]
            if p["id"] == panel
        )
        press("Promote to " + desired.title() + " for " + panel_data["name"])
        result = state(panel_data["content"], desired)
        assert result["value"]["context"] == context
        capture("rank-" + desired)
        return result

    try:
        first = wait(
            document,
            lambda d: bool(d.get("value", {}).get("voyages")),
            "initial workspace",
        )
        context = first["value"]["context"]
        vessel = first["value"]["voyages"][0]["fleets"][0]["vessels"][0]
        backend = wait(
            document,
            lambda d: bool(d["value"]["contents"][0].get("backend")),
            "initial shell binding",
        )["value"]["contents"][0]["backend"]
        press("Terminal", roles=("terminal",))
        for character in "codex --no-daemon --yolo" + chr(10):
            key = 65293 if character == chr(10) else ord(character)
            native("key", key, True)
            native("key", key, False)
        wait(
            lambda: rpc("terminal.get", {"terminal": backend}),
            lambda t: (t.get("foreground") or {}).get("name") == "codex",
            "real Codex in Vessel",
        )
        capture("rank-crew")
        promote(vessel["id"], "captain")
        press("Split Vessel right")
        capture("rank-split-menu")
        native("key", 65307, True)
        native("key", 65307, False)
        promote(vessel["id"], "commodore")
        press("Show Portals")
        press("Create Codex Portal")
        portal_doc = wait(
            document,
            lambda d: len(d["value"]["voyages"][0]["portals"]) == 1,
            "Portal creation",
        )
        portal = portal_doc["value"]["voyages"][0]["portals"][0]
        portal_content = portal["content"]
        bound = wait(
            document,
            lambda d: any(
                c["id"] == portal_content and c.get("backend")
                for c in d["value"]["contents"]
            ),
            "Portal Core binding",
        )
        addresses = [
            backend,
            next(
                c["backend"]
                for c in bound["value"]["contents"]
                if c["id"] == portal_content
            ),
        ]
        terminals = [
            wait(
                lambda address=address: rpc("terminal.get", {"terminal": address}),
                lambda t: (t.get("foreground") or {}).get("name") == "codex",
                "real Codex in panel",
            )
            for address in addresses
        ]
        identities = {
            str(pid): process_identity(pid, metadata_only=True)
            for t in terminals
            for pid in (t["pid"], t["foreground"]["pid"])
        }
        observed["identities"] = identities
        promote(portal["id"], "admiral")
        press("Embed Portals")
        x, y = named_button(native, evidence, "Split Portal right")
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round((x - 18) * 2),
            int(bounds["Y"]) + round(y * 2),
            2,
        )
        native("button", True, 273)
        native("button", False, 273)
        press("Reset rank to Crew")
        state(portal_content, "crew")
        capture("rank-reset-crew")
        promote(portal["id"], "admiral")
        press("Hide Portals")
        press("Show Portals")
        state(portal_content, "admiral")
        press("Create Fleet")
        press("Create Terminal Vessel")
        wait(
            document,
            lambda d: len(d["value"]["voyages"][0]["fleets"]) == 2,
            "new Fleet selected",
        )
        state(portal_content, "admiral")
        state(vessel["content"], "commodore")
        press(first["value"]["voyages"][0]["fleets"][0]["name"])
        before = document()
        close()
        start_frame("rank-reopened")
        restored = wait(
            document,
            lambda d: d["value"] == before["value"],
            "same saved ranks/layout after viewer reopen",
        )
        assert all(
            process_identity(int(pid), metadata_only=True) == identity
            for pid, identity in identities.items()
        )
        assert restored["value"]["context"] == context
        capture("rank-final")
        observed.update(
            {
                "samePrograms": True,
                "sameContext": True,
                "reopenedLayout": restored,
                "candidateLeftOpen": True,
                "commandAuthority": "unavailable",
            }
        )
        return [
            "native-vessel-captain-commodore",
            "native-portal-admiral",
            "hide-reveal-navigation-reopen-retains-ranks-and-programs",
        ]
    except BaseException:
        observed["failed"] = True
        raise
    finally:
        (evidence / "rank-hats.json").write_text(json.dumps(observed, indent=2))
