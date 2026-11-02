import json
from playwright.sync_api import sync_playwright


def prove(url, output):
    errors = []
    requests = []
    downloads = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/google-chrome",
                                             args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("request", lambda request: requests.append({"method": request.method, "url": request.url}))
        page.on("download", lambda download: downloads.append(download.suggested_filename))
        page.goto(url)
        page.locator("#content").wait_for(state="visible")
        assert "44 nodes · 86 edges" in page.locator("#snapshot-source").inner_text()
        assert page.locator("g.node").count() == 44
        assert page.locator("path.edge-hit").count() == 86
        assert "Problem" in page.locator("#bindings").inner_text()
        page.screenshot(path=str(output / "preview-setup.png"))
        page.get_by_role("link", name="Explore the recorded graph").click()
        page.locator("#find-record").select_option("node:a-expanded")
        assert "refutes" in page.locator("#metadata-fields").inner_text()
        assert "1681=41*41" in page.locator("#metadata-fields").inner_text()
        page.locator('g.node[aria-label="Assessment: a-A"]').focus()
        assert "proposed" in page.locator("#metadata-fields").inner_text()
        page.keyboard.press("Enter")
        page.locator('g.node[aria-label="Problem: math"]').hover()
        assert page.locator("#selection-state").inner_text() == "Hover preview"
        page.mouse.move(0, 0)
        assert page.locator("#metadata-heading").inner_text() == "Assessment: a-A"
        page.locator('path.edge-hit[aria-label="AboutCandidate: a-A → A"]').focus()
        assert "AboutCandidate" in page.locator("#metadata-fields").inner_text()
        page.keyboard.press("Enter")
        page.locator("#related").get_by_role("button", name="Candidate: Rewrite A", exact=True).click()
        assert "Record research attempts" in page.locator("#metadata-fields").inner_text()
        before = page.locator("g.node circle").first.bounding_box()["width"]
        page.get_by_role("button", name="Zoom in", exact=True).click()
        assert page.locator("g.node circle").first.bounding_box()["width"] > before
        page.get_by_role("button", name="Reset view", exact=True).click()
        page.locator("#scope").select_option("writing")
        assert page.locator('g.node[aria-label="Problem: math"]').count() == 0
        assert page.locator('g.node[aria-label="Problem: writing"]').count() == 1
        page.locator("#find-record").select_option("node:a-A")
        page.locator("#graph-section").screenshot(path=str(output / "preview-graph.png"))
        page.locator("#objective").fill(" ")
        page.get_by_role("button", name="Export setup draft").click()
        assert page.locator("#objective:invalid").count() == 1
        assert "before exporting" in page.locator("#export-status").inner_text()
        page.locator("#objective").fill("Find a shorter sentence while preserving the intended meaning.")
        page.locator("#voyage-name").fill("A community writing question")
        page.get_by_text("Edit the structure source", exact=True).click()
        schema = page.locator("#schema").input_value()
        page.locator("#schema").fill(schema.replace("objective: String", "objective: String\n  budget: String?"))
        assert "budget" in page.locator("#type-fields").inner_text()
        page.get_by_text("Edit role and relation bindings", exact=True).click()
        bindings = page.locator("#binding-source").input_value()
        page.locator("#binding-source").fill(bindings.replace("content: content}", "content: content, label: label}"))
        page.get_by_text("Edit agent-use rules", exact=True).click()
        usage = page.locator("#usage").input_value()
        page.locator("#usage").fill(usage.replace("jev-1.14.0", "jev-1.13.0"))
        with page.expect_download() as download_info:
            page.get_by_role("button", name="Export setup draft").click()
        path = output / "preview-draft.json"
        download_info.value.save_as(path)
        draft = json.loads(path.read_text())
        assert draft["active"] is False and draft["engine_validated"] is False
        assert draft["voyage"]["name"] == "A community writing question"
        assert "budget: String?" in draft["graph_structure"]["source"]
        assert "label: label" in draft["graph_structure"]["bindings"]["source"]
        assert "bindings: bindings.yaml" in draft["agent_use"]["source"]
        assert "candidate: {node:" not in draft["agent_use"]["source"]
        assert "jev-1.13.0" in draft["agent_use"]["source"]
        assert "record" in draft["recorded_snapshot"]
        assert "No Voyage or graph was created or activated" in page.locator("#export-status").inner_text()
        assert page.locator('g.node[aria-label="Problem: writing"]').count() == 1
        page.locator("#schema").fill(" ")
        page.get_by_text("Edit the structure source", exact=True).click()
        page.get_by_role("button", name="Export setup draft").click()
        assert page.locator("#schema").is_visible()
        assert page.locator("#schema").evaluate("element => element === document.activeElement")
        assert "Enter progress.pg before exporting" in page.locator("#export-status").inner_text()
        assert len(downloads) == 1
        for width in [320, 768]:
            page.set_viewport_size({"width": width, "height": 1000})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.locator("#graph-section").screenshot(path=str(output / f"preview-{width}.png"))
        assert errors == [], errors
        failure = browser.new_page()
        failure.route("**/export.jsonl", lambda route: route.fulfill(status=200, body="malformed graph"))
        failure.goto(url)
        failure.locator("#error").wait_for(state="visible")
        assert failure.locator("#content").is_hidden()
        assert "No graph or configuration was changed" in failure.locator("#error").inner_text()
        assert all(request["method"] == "GET" and request["url"].startswith(url) for request in requests)
        (output / "preview-results.json").write_text(json.dumps({
            "url": url, "nodes": 44, "edges": 86, "metadata": ["hover", "selection", "keyboard focus", "edge", "related record"],
            "draft_export": True, "independent_layers": True, "blank_objective_refused": True,
            "malformed_snapshot_refused": True, "hidden_invalid_editor_revealed": True, "widths": [1440, 768, 320],
            "console_errors": errors, "requests": requests
        }, indent=2))
        browser.close()
