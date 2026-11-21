#!/usr/bin/env python3
"""Build a one-time historical seed file from the old dashboard HTML.

The seed is written to data/historical-seed.json, which is gitignored.
Do not commit it. An admin imports it once from the dashboard
(Admin Data Upload → Import historical seed).

Usage:
  python3 scripts/extract-historical-seed.py
  python3 scripts/extract-historical-seed.py --file /path/to/old-index.html
  python3 scripts/extract-historical-seed.py --rev <commit>

With no arguments, the script walks git history and uses the newest
index.html that still contains the embedded run rows.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "historical-seed.json"
MARKER = "__embeddedRawRows"


def git_show(rev: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{rev}:index.html"], cwd=ROOT, text=True, errors="replace"
    )


def newest_rev_with_marker() -> str:
    revs = subprocess.check_output(
        ["git", "rev-list", "HEAD", "--", "index.html"], cwd=ROOT, text=True
    ).split()
    for rev in revs:
        blob = subprocess.check_output(
            ["git", "show", f"{rev}:index.html"], cwd=ROOT, text=True, errors="replace"
        )
        if MARKER in blob:
            return rev
    raise SystemExit(
        "Could not find index.html with embedded history in git. "
        "Pass --file pointing at a copy of the old index.html."
    )


def extract_json_assignment(source: str, const_name: str):
    token = f"const {const_name} = "
    start = source.find(token)
    if start < 0:
        token = f"let {const_name} = "
        start = source.find(token)
    if start < 0:
        raise SystemExit(f"Could not find `{const_name}` in the HTML.")
    i = source.find("{", start) if const_name == "allData" else source.find("[", start)
    if i < 0:
        raise SystemExit(f"Could not find the data for `{const_name}`.")
    open_ch, close_ch = ("{", "}") if source[i] == "{" else ("[", "]")
    depth = 0
    in_str = False
    esc = False
    for pos in range(i, len(source)):
        ch = source[pos]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return json.loads(source[i : pos + 1])
    raise SystemExit(f"Unbalanced data while reading `{const_name}`.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="Path to an old index.html that still has the embedded rows")
    parser.add_argument("--rev", help="Git commit to read index.html from")
    args = parser.parse_args()

    source_label = ""
    if args.file:
        source = Path(args.file).read_text(encoding="utf-8", errors="replace")
        source_label = str(Path(args.file))
    elif args.rev:
        source = git_show(args.rev)
        source_label = args.rev
    else:
        rev = newest_rev_with_marker()
        source = git_show(rev)
        source_label = rev

    dashboard = extract_json_assignment(source, "allData")
    raw_rows = extract_json_assignment(source, "__embeddedRawRows")
    if not isinstance(dashboard, dict) or "skus" not in dashboard:
        raise SystemExit("Extracted dashboard data is missing skus.")
    if not isinstance(raw_rows, list) or not raw_rows:
        raise SystemExit("Extracted raw rows are empty.")

    payload = {
        "dashboardData": dashboard,
        "rawRows": raw_rows,
        "source": source_label,
        "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "Gitignored one-time import. Do not commit this file.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    print(
        f"Wrote {OUT.relative_to(ROOT)} "
        f"({len(raw_rows)} raw rows, {len(dashboard.get('skus', {}))} SKUs) "
        f"from {source_label}"
    )
    print("This file is gitignored. Import it from the dashboard admin panel, then delete it.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode or 1)
