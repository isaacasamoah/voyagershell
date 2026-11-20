import argparse
import collections
import json
import os
from pathlib import Path
import secrets
import socket
import socketserver
import struct
import sys
import threading
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests/native"))
from proof_process import process_identity


class Refused(Exception):
    pass


class Inbox:
    def __init__(self, actors):
        self.actors = actors
        self.pending = {actor: {} for actor in actors}
        self.receipts = collections.OrderedDict()

    def call(self, actor, request):
        if (
            actor not in self.actors
            or request.get("generation") != self.actors[actor]["generation"]
        ):
            raise Refused("stale-binding")
        operation = request.get("operation")
        fields = {
            "self": set(),
            "post": {"target", "targetGeneration", "kind", "text"},
            "read": set(),
            "ack": {"itemId"},
            "operation": {"lookup"},
        }
        if operation not in fields:
            raise Refused("unknown-operation")
        if set(request) != {"generation", "requestId", "operation"} | fields[operation]:
            raise Refused("invalid-fields")
        if (
            not isinstance(request["requestId"], str)
            or not 1 <= len(request["requestId"]) <= 128
        ):
            raise Refused("invalid-request-id")
        key = (actor, request["requestId"])
        if key in self.receipts:
            previous, result, error = self.receipts[key]
            if previous != request:
                raise Refused("request-conflict")
            if error:
                raise Refused(error)
            return result
        try:
            result = self.apply(actor, request)
            error = None
        except Refused as failure:
            result, error = None, str(failure)
        if operation in {"post", "ack"}:
            self.receipts[key] = (request.copy(), result, error)
            if len(self.receipts) > 32:
                self.receipts.popitem(last=False)
        if error:
            raise Refused(error)
        return result

    def apply(self, actor, request):
        operation = request["operation"]
        if operation == "self":
            return {
                "actor": actor,
                **self.actors[actor],
                "allowed": ["post", "read", "ack", "operation"],
            }
        if operation == "post":
            target = request["target"]
            if (
                target not in self.actors
                or request["targetGeneration"] != self.actors[target]["generation"]
            ):
                raise Refused("stale-target")
            if request["kind"] not in {"information", "request"} or not isinstance(
                request["text"], str
            ):
                raise Refused("invalid-message")
            item = uuid.uuid4().hex
            envelope = {
                "itemId": item,
                "sender": actor,
                "recipient": target,
                "recipientGeneration": request["targetGeneration"],
                "kind": request["kind"],
                "text": request["text"],
                "authority": "peer-conversation",
            }
            if len(json.dumps(envelope, ensure_ascii=False).encode()) > 8192:
                raise Refused("too-large")
            if len(self.pending[target]) == 32:
                raise Refused("inbox-full")
            self.pending[target][item] = envelope
            return {"status": "recorded", "itemId": item}
        if operation == "read":
            item = next(iter(self.pending[actor].values()), None)
            return {"status": "read", "envelope": item} if item else {"status": "empty"}
        if operation == "ack":
            if request["itemId"] not in self.pending[actor]:
                raise Refused("item-unavailable")
            del self.pending[actor][request["itemId"]]
            return {"status": "acknowledged", "itemId": request["itemId"]}
        receipt = self.receipts.get((actor, request["lookup"]))
        return (
            {"status": "receipt-unavailable"}
            if receipt is None
            else {"status": "retained", "result": receipt[1], "error": receipt[2]}
        )


def descendant(pid, root, start):
    if process_identity(root, metadata_only=True)["start"] != start:
        return False
    for _ in range(64):
        if pid == root:
            return True
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
        pid = int(fields[1])
        if pid <= 1:
            return False
    return False


def serve(folder):
    config = json.loads((folder / "bindings.json").read_text())
    box = Inbox(
        {
            key: {name: value[name] for name in ("generation", "task")}
            for key, value in config.items()
        }
    )
    condition = threading.Condition()
    deadline = json.loads((folder / "protocol.json").read_text())["deadlineMonotonic"]

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            self.connection.settimeout(185)
            event = {"timeNs": time.time_ns(), "peerPid": None}
            try:
                pid, uid, _ = struct.unpack(
                    "3i",
                    self.connection.getsockopt(
                        socket.SOL_SOCKET, socket.SO_PEERCRED, 12
                    ),
                )
                event["peerPid"] = pid
                request = json.loads(self.rfile.readline(16385))
                capability = request.pop("capability", "")
                binding = json.loads((folder / "bindings.json").read_text())
                actor = next(
                    (
                        key
                        for key, value in binding.items()
                        if secrets.compare_digest(value["capability"], capability)
                    ),
                    None,
                )
                if uid != os.getuid() or actor is None:
                    raise Refused("missing-or-invalid-binding")
                identity = binding[actor]
                event.update(
                    actor=actor,
                    generation=identity["generation"],
                    rootPid=identity.get("pid"),
                    rootStart=identity.get("start"),
                    peerIdentity=process_identity(pid, metadata_only=True),
                )
                if not descendant(pid, identity["pid"], identity["start"]):
                    raise Refused("wrong-agent-process")
                if request.get("operation") == "post":
                    target = binding.get(request.get("target"), {})
                    if (
                        "pid" not in target
                        or process_identity(target["pid"], metadata_only=True)["start"]
                        != target["start"]
                    ):
                        raise Refused("stale-target")
                wait = request.pop("wait", 0)
                if type(wait) is not int or not 0 <= wait <= 180:
                    raise Refused("invalid-wait")
                with condition:
                    end = min(time.monotonic() + wait, deadline)
                    while (
                        request.get("operation") == "read"
                        and not box.pending[actor]
                        and time.monotonic() < end
                    ):
                        condition.wait(min(1, end - time.monotonic()))
                    if not descendant(pid, identity["pid"], identity["start"]):
                        raise Refused("stale-binding")
                    result = box.call(actor, request)
                    condition.notify_all()
                    event.update(
                        request=request,
                        result=result,
                        tasks={key: value["task"] for key, value in box.actors.items()},
                    )
            except (Refused, ValueError, KeyError, OSError) as error:
                result = {"status": "refused", "reason": str(error)}
                event["result"] = result
            with condition:
                with (folder / "events.jsonl").open("a") as log:
                    log.write(json.dumps(event) + "\n")
            self.wfile.write((json.dumps(result) + "\n").encode())

    class Server(socketserver.ThreadingUnixStreamServer):
        daemon_threads = True

    with Server(str(folder / "owner.sock"), Handler) as server:
        os.chmod(folder / "owner.sock", 0o600)
        server.timeout = 1
        while time.monotonic() < deadline and not (folder / "stop").exists():
            server.handle_request()
    (folder / "owner.sock").unlink()


def client(arguments):
    context = json.loads(Path(os.environ["VOYAGER_DELIVERY_CONTEXT"]).read_text())
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "operation", choices=["self", "post", "read", "ack", "operation"]
    )
    parser.add_argument("values", nargs="*")
    parser.add_argument("--wait", type=int, default=0)
    parser.add_argument("--request-id", default=uuid.uuid4().hex)
    args = parser.parse_args(arguments)
    request = {
        "generation": context["generation"],
        "capability": context["capability"],
        "requestId": args.request_id,
        "operation": args.operation,
    }
    names = {
        "self": [],
        "post": ["target", "targetGeneration", "kind", "text"],
        "read": [],
        "ack": ["itemId"],
        "operation": ["lookup"],
    }[args.operation]
    if len(names) != len(args.values):
        parser.error("Wrong argument count")
    request.update(zip(names, args.values))
    if args.wait:
        request["wait"] = args.wait
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(185)
        connection.connect(context["socket"])
        connection.sendall((json.dumps(request) + "\n").encode())
        connection.shutdown(socket.SHUT_WR)
        result = json.loads(connection.makefile("rb").readline(32769))
    print(json.dumps(result))
    return 2 if result.get("status") == "refused" else 0


if __name__ == "__main__":
    if sys.argv[1:2] == ["serve"]:
        serve(Path(sys.argv[2]))
    else:
        sys.exit(client(sys.argv[1:]))
