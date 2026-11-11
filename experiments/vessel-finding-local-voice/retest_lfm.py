"""Shared helper for the LFM3 re-test. Talks to the local llama-server only."""
import json, urllib.request, copy, time

import os
URL = os.environ.get("LFM_URL", "http://127.0.0.1:8111/v1/chat/completions")
EXP = "/home/isaac/voyagershell/.worktrees/experiment-lfm3-avatar"
SESSION_SYSTEM = "You are Voyager, a workspace administrator. Use voyager_workspace to inspect the workspace before answering."
ORIGINAL_DESC = (
    "Inspect and manage the captured avatar focus. Inspect first (expectedVersion 0), "
    "then use its returned version for each effect. Use exact IDs from inspection. "
    "Dock changes focus only when the human asks; it does not retarget this request. "
    "No project/content-file edits. The application supplies request identity and authority."
)

def load_schema(name="workspaceTool"):
    return json.load(open(f"{EXP}/contract/generated/{name}.schema.json"))

def strip_meta(schema):
    s = copy.deepcopy(schema)
    s.pop("$schema", None); s.pop("title", None)
    return s

def operation_first(schema):
    """Same content; only the property ORDER inside each Action variant changes:
    operation first, then the other fields in the order the Rust type declares them (the `required` order),
    then any optional leftovers."""
    s = copy.deepcopy(schema)
    for v in s["definitions"]["Action"]["oneOf"]:
        props = v["properties"]
        order = [k for k in v.get("required", []) if k in props]
        order = ["operation"] + [k for k in order if k != "operation"] + [k for k in props if k not in order and k != "operation"]
        v["properties"] = {k: props[k] for k in order}
    return s

def tool(schema, desc=ORIGINAL_DESC, name="voyager_workspace"):
    return {"type": "function", "function": {"name": name, "description": desc, "parameters": schema}}

def chat(messages, tools=None, think=True, max_tokens=1500, temperature=0.0, **extra):
    payload = {"model": "lfm3", "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = extra.pop("tool_choice", "auto")
    if not think:
        payload["chat_template_kwargs"] = {"enable_thinking": False}
    payload.update(extra)
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=int(os.environ.get("LFM_TIMEOUT", "300"))) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:600], "wall_ms": int((time.time()-t0)*1000)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"[:200], "wall_ms": int((time.time()-t0)*1000)}
    wall = int((time.time() - t0) * 1000)
    ch = body["choices"][0]; msg = ch["message"]
    tcs = msg.get("tool_calls") or []
    out = {
        "finish": ch["finish_reason"],
        "tokens": body["usage"]["completion_tokens"],
        "prompt_tokens": body["usage"]["prompt_tokens"],
        "wall_ms": wall,
        "gen_ms": int(body.get("timings", {}).get("predicted_ms", 0)),
        "content": msg.get("content") or "",
        "reasoning": msg.get("reasoning_content") or "",
        "calls": [(tc["function"]["name"], tc["function"]["arguments"]) for tc in tcs],
        "raw_tool_calls": tcs,
    }
    out["op"] = None
    if tcs:
        try:
            out["args"] = json.loads(tcs[0]["function"]["arguments"])
            a = out["args"].get("action")
            out["op"] = a.get("operation") if isinstance(a, dict) else out["args"].get("operation")
        except Exception:
            out["args"] = None; out["op"] = "<unparsed>"
    return out

def ask(prompt, tools, system=SESSION_SYSTEM, **kw):
    return chat([{"role": "system", "content": system}, {"role": "user", "content": prompt}], tools=tools, **kw)
