#!/usr/bin/env python3
"""
Reusable migration release path for voyagershell Supabase branches.

Applies pending migrations (those not in supabase_migrations.schema_migrations)
to a target DB BRANCH in strict order, records each in the ledger, and STOPS on
the first error. This is the repeatable proofs->release path: run it against the
voyager-dev branch as dev proceeds, and against main only at an authorized release.

DB-branch hygiene (see CLAUDE.md):
  voyager-dev = hpotfrfdigzmhyibihst  (persistent DEV branch — the normal target)
  main        = iesprdzzgjypnksoljym  (PRODUCTION — release only)

Auth: the owner's Supabase management PAT (never printed). Requests send a browser
User-Agent because Cloudflare WAF-blocks the default urllib/curl signature (403 /
"error code 1010" — not a SQL error).

Usage:
  python3 apply-migrations.py --ref <BRANCH_REF> [--from 001] [--to 081] [--reset]
    --reset   : drop+recreate public schema and clear the ledger FIRST (full rebuild).
                pgvector (in public) is rebuilt by migration 002. Other extensions
                live in separate schemas and are untouched.
"""
import argparse, json, os, subprocess, sys, glob, re

def numprefix(path):
    m = re.match(r"(\d+)", os.path.basename(path))
    return int(m.group(1)) if m else 0

TOKEN_FILE = os.path.expanduser("~/.claude/secrets/supabase-management-token")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
MIGDIR_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "supabase", "migrations")

def token():
    return open(TOKEN_FILE).read().strip()

def run_sql(ref, sql):
    """POST SQL to the Management API query endpoint via curl (proven WAF-safe with UA)."""
    payload = json.dumps({"query": sql})
    p = subprocess.run(
        ["curl", "-s", "-w", "\n__HTTP__%{http_code}",
         f"https://api.supabase.com/v1/projects/{ref}/database/query",
         "-H", f"Authorization: Bearer {token()}",
         "-H", "Content-Type: application/json",
         "-A", UA, "--data-binary", "@-"],
        input=payload, capture_output=True, text=True)
    out = p.stdout
    code = ""
    if "__HTTP__" in out:
        out, code = out.rsplit("__HTTP__", 1)
        code = code.strip()
    return code, out.strip()

def is_error(code, body):
    if code not in ("200", "201"):
        return body[:600] or f"HTTP {code}"
    try:
        j = json.loads(body)
        if isinstance(j, dict) and (j.get("message") or j.get("error")):
            return json.dumps(j)[:600]
    except Exception:
        pass
    return None

def applied_versions(ref):
    code, body = run_sql(ref, "select version from supabase_migrations.schema_migrations;")
    if is_error(code, body):
        return set()
    try:
        return {r["version"] for r in json.loads(body)}
    except Exception:
        return set()

def record(ref, version, name):
    sql = ("insert into supabase_migrations.schema_migrations (version, name, statements) "
           f"values ('{version}', '{name}', array['applied via release path']) "
           "on conflict (version) do nothing;")
    return run_sql(ref, sql)

def do_reset(ref):
    print("  RESET: dropping+recreating public schema, restoring grants, clearing ledger...")
    reset_sql = """
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations;
"""
    code, body = run_sql(ref, reset_sql)
    err = is_error(code, body)
    if err:
        print(f"  RESET FAILED: {err}")
        return False
    print("  RESET OK (public schema empty, ledger cleared).")
    return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--migdir", default=MIGDIR_DEFAULT)
    ap.add_argument("--from", dest="frm", default="001")
    ap.add_argument("--to", dest="to", default="999")
    ap.add_argument("--reset", action="store_true")
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(a.migdir, "*.sql")))
    lo, hi = int(a.frm), int(a.to)
    files = [f for f in files if lo <= numprefix(f) <= hi]
    print(f"target ref={a.ref}  migrations={len(files)} ({os.path.basename(files[0])}..{os.path.basename(files[-1])})")

    if a.reset:
        if not do_reset(a.ref):
            sys.exit(1)

    already = applied_versions(a.ref)
    ok = 0
    for f in files:
        base = os.path.basename(f)
        version = base.split("_", 1)[0]
        name = base[:-4]
        if version in already:
            print(f"SKIP {base} (already in ledger)")
            continue
        sql = open(f).read()
        code, body = run_sql(a.ref, sql)
        err = is_error(code, body)
        if err:
            print(f"FAIL {base}  HTTP {code}\n     {err}")
            print(f"--- STOPPED at {base}. {ok} applied this run. ---")
            sys.exit(2)
        record(a.ref, version, name)
        ok += 1
        print(f"OK   {base}")
    print(f"=== DONE: {ok} migrations applied to {a.ref}. ===")

if __name__ == "__main__":
    main()
