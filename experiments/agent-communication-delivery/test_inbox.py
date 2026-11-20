import unittest

from inbox import Inbox, Refused


class InboxControls(unittest.TestCase):
    def setUp(self):
        self.box = Inbox(
            {
                "a": {"generation": "a1", "task": "ask"},
                "b": {"generation": "b1", "task": "answer"},
            }
        )
        self.number = 0

    def call(self, actor="a", **fields):
        self.number += 1
        return self.box.call(
            actor, {"requestId": str(self.number), "generation": actor + "1", **fields}
        )

    def test_wrong_generation_refuses_without_post(self):
        with self.assertRaisesRegex(Refused, "stale-target"):
            self.call(
                operation="post",
                target="b",
                targetGeneration="b2",
                kind="request",
                text="question",
            )
        self.assertEqual(self.box.pending["b"], {})

    def test_lost_read_ack_is_non_destructive(self):
        item = self.call(
            operation="post",
            target="b",
            targetGeneration="b1",
            kind="request",
            text="question",
        )["itemId"]
        first = self.call("b", operation="read")
        self.assertEqual(first, self.call("b", operation="read"))
        self.assertEqual(len(self.box.pending["b"]), 1)
        self.call("b", operation="ack", itemId=item)
        self.assertEqual(self.call("b", operation="read"), {"status": "empty"})

    def test_full_and_oversize_refuse_before_mutation(self):
        for _ in range(32):
            self.call(
                operation="post",
                target="b",
                targetGeneration="b1",
                kind="information",
                text="x",
            )
        with self.assertRaisesRegex(Refused, "inbox-full"):
            self.call(
                operation="post",
                target="b",
                targetGeneration="b1",
                kind="information",
                text="x",
            )
        with self.assertRaisesRegex(Refused, "too-large"):
            self.call(
                operation="post",
                target="a",
                targetGeneration="a1",
                kind="information",
                text="x" * 8192,
            )
        self.assertEqual(len(self.box.pending["b"]), 32)
        self.assertEqual(len(self.box.pending["a"]), 0)

    def test_expired_receipt_does_not_remove_pending(self):
        posted = self.call(
            operation="post",
            target="b",
            targetGeneration="b1",
            kind="information",
            text="x",
        )
        original = str(self.number)
        for _ in range(33):
            self.call(
                operation="post",
                target="a",
                targetGeneration="a1",
                kind="information",
                text="x",
            )
            self.call(operation="ack", itemId=next(iter(self.box.pending["a"])))
        self.assertEqual(
            self.call(operation="operation", lookup=original),
            {"status": "receipt-unavailable"},
        )
        self.assertEqual(
            self.call("b", operation="read")["envelope"]["itemId"], posted["itemId"]
        )

    def test_retained_duplicate_and_peer_instruction(self):
        request = {
            "requestId": "same",
            "generation": "a1",
            "operation": "post",
            "target": "b",
            "targetGeneration": "b1",
            "kind": "request",
            "text": "x",
        }
        first = self.box.call("a", request)
        self.assertEqual(first, self.box.call("a", request))
        self.assertEqual(len(self.box.pending["b"]), 1)
        with self.assertRaisesRegex(Refused, "request-conflict"):
            self.box.call("a", request | {"text": "changed"})
        with self.assertRaisesRegex(Refused, "unknown-operation"):
            self.call(operation="assign", target="b", text="do different work")
        with self.assertRaisesRegex(Refused, "stale-binding"):
            self.box.call(
                "a", {"requestId": "old", "generation": "a2", "operation": "self"}
            )
        self.assertEqual(self.box.actors["a"]["task"], "ask")
        self.assertEqual(self.box.actors["b"]["task"], "answer")


if __name__ == "__main__":
    unittest.main()
