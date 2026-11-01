import json

from playwright.sync_api import expect
from proof_common import content_directory, open_picker, processes, recorder


def content_journey(page, evidence):
    initial = processes(page)
    record = recorder(evidence, "content")
    page.evaluate("""() => {
      window.originalContentCall = window.contentClient.call;
      window.contentProof = {calls: [], staleRevision: null};
      window.contentClient.call = async (input, bound) => {
        const attempt = {...input};
        if (attempt.operation === 'content.update' && window.contentProof.staleRevision) {
          attempt.expectedRevision = window.contentProof.staleRevision;
          window.contentProof.staleRevision = null;
        }
        const result = await window.originalContentCall(attempt, bound);
        window.contentProof.calls.push({attempt, result});
        return result;
      };
    }""")
    try:
        opener = page.get_by_role(
            "button", name="Split this Vessel side by side", exact=True
        ).first
        open_picker(page, opener)
        page.locator("#content-picker").get_by_role(
            "button", name="Notes", exact=True
        ).click()
        page.wait_for_selector("iframe.portal-frame")
        content_id = page.evaluate(
            "allLeaves(active().dimension.root).find(p => p.type === 'notes').id"
        )
        frame = page.locator(f'iframe[data-portal="{content_id}"]').content_frame
        text = frame.get_by_role("textbox", name="Note text", exact=True)
        title = frame.get_by_role("textbox", name="Note title", exact=True)
        expect(title).to_have_value("Working notes")
        page.wait_for_function(
            "window.contentProof.calls.some(c => c.result.status === 'snapshot')"
        )
        first = page.evaluate("window.contentProof.calls[0]")
        assert first["attempt"]["contentId"] == content_id
        original_revision = first["result"]["snapshot"]["revision"]
        text.fill("Saved through the typed boundary")
        title.click()
        expect(frame.locator("#state")).to_have_text("Saved")
        page.wait_for_function(
            "window.contentProof.calls.some(c => c.result.status === 'applied')"
        )
        data_file = content_directory(evidence) / "data" / f"{content_id}.json"
        saved = data_file.read_text()
        assert json.loads(saved)["text"] == "Saved through the typed boundary"
        assert processes(page) == initial
        record(
            "Notes loads and saves through the typed contract without creating a process"
        )

        page.evaluate(
            "revision => window.contentProof.staleRevision = revision",
            original_revision,
        )
        text.fill("This stale attempt must not replace the file")
        title.click()
        expect(frame.locator("#state")).to_contain_text("Read it again")
        assert data_file.read_text() == saved
        rejected = page.evaluate(
            "window.contentProof.calls.find(c => c.result.status === 'rejected')"
        )
        assert rejected["result"]["code"] == "stale-revision"
        assert rejected["result"]["expectedRevision"] == original_revision
        assert rejected["result"]["requestId"] == rejected["attempt"]["requestId"]
        record(
            "A stale user save is visibly refused with its attempted revision and unchanged data"
        )

        text.fill("Edited successfully after rejection")
        title.click()
        expect(frame.locator("#state")).to_have_text("Saved")
        page.wait_for_function(
            "window.contentProof.calls.filter(c => c.result.status === 'applied').length === 2"
        )
        assert (
            json.loads(data_file.read_text())["text"]
            == "Edited successfully after rejection"
        )
        writes = page.evaluate(
            "window.contentProof.calls.filter(c => c.attempt.operation === 'content.update')"
        )
        assert [item["result"]["status"] for item in writes] == [
            "applied",
            "rejected",
            "applied",
        ]
        assert len({item["attempt"]["requestId"] for item in writes}) == 3
        assert all(item["attempt"]["contentId"] == content_id for item in writes)
        assert processes(page) == initial
        record(
            "The same Notes instance remains editable after rejection, with no automatic replay"
        )
        (evidence / "content-wire.json").write_text(
            json.dumps(page.evaluate("window.contentProof.calls"), indent=2)
        )
        page.screenshot(path=str(evidence / "content.png"))
    finally:
        page.evaluate(
            "() => { window.contentClient.call = window.originalContentCall; }"
        )
