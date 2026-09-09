#!/usr/bin/env python3
"""Privacy gate for shaping's publish step. Stdlib only, Python 3.10+.

Usage: check-publish.py <draft-file> <publish-file> [title]

Scans text about to be published for leaks. Exit 0 = clear to show the
user, 1 = findings (fail-closed), 2 = usage/read error. Runs BEFORE the
human approval gate, never instead of it.
"""

import re
import sys

# --- checks ---------------------------------------------------------------

# (pattern, label). Matched against publish text AND title.
LEAK_PATTERNS = [
    (r"\.issues(?![\w-])", "draft-directory path"),
    (r"/Users/[^\s`)\]]+", "local absolute path"),
    (r"/home/[^\s`)\]]+", "local absolute path"),
    (r"ghp_[A-Za-z0-9]{20,}", "GitHub token"),
    (r"gho_[A-Za-z0-9]{20,}", "GitHub token"),
    (r"github_pat_[A-Za-z0-9_]{20,}", "GitHub fine-grained token"),
    (r"glpat-[A-Za-z0-9_-]{20,}", "GitLab token"),
    (r"gitea_[A-Za-z0-9]{20,}", "Gitea token"),
    (r"sk-[A-Za-z0-9]{20,}", "API key"),
    (r"AKIA[0-9A-Z]{16}", "AWS access key"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY", "private key"),
    (r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", "bearer token"),
    (r"(?i)(password|passwd|secret|token)\s*[:=]\s*\S+", "credential assignment"),
]

# Five required template sections (matched case-insensitively).
REQUIRED_SECTIONS = [
    "problem",
    "solution",
    "acceptance",
    "key decisions",
    "out of scope",
]

MIN_PASTE_LINE = 30  # min length for verbatim-paste detection
PASTE_EXEMPT_PREFIXES = ("#", "|", "-")  # headings, tables, list items


# --- helpers ---------------------------------------------------------------


def findings_in(text, label_prefix=""):
    """Check 1: leak patterns. One finding per match, with line number."""
    out = []
    for pattern, label in LEAK_PATTERNS:
        for m in re.finditer(pattern, text):
            line = text.count("\n", 0, m.start()) + 1
            out.append(f"{label_prefix}line {line}: {label} leaked: {m.group(0)[:60]}")
    return out


def paste_findings(draft, publish):
    """Check 2: any long publish line copied verbatim from the draft."""
    draft_lines = {
        line.strip()
        for line in draft.splitlines()
        if len(line.strip()) >= MIN_PASTE_LINE
    }
    out = []
    for i, line in enumerate(publish.splitlines(), 1):
        s = line.strip()
        if (
            len(s) >= MIN_PASTE_LINE
            and s in draft_lines
            and not s.startswith(PASTE_EXEMPT_PREFIXES)
        ):
            out.append(f"line {i}: verbatim draft line, rewrite: {s[:50]}...")
    return out


def section_findings(publish):
    """Check 3: all five template sections present."""
    low = publish.lower()
    return [
        f"template section missing: {section}"
        for section in REQUIRED_SECTIONS
        if section not in low
    ]


def read_file(path):
    """Read UTF-8 text; clean error + exit 2 on failure (fail-closed)."""
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError) as e:
        print(f"error: cannot read {path}: {e}", file=sys.stderr)
        sys.exit(2)


# --- main -------------------------------------------------------------------


def main():
    if len(sys.argv) not in (3, 4):
        print(__doc__.strip())
        return 2
    draft = read_file(sys.argv[1])
    publish = read_file(sys.argv[2])
    title = sys.argv[3] if len(sys.argv) == 4 else ""

    findings = (
        findings_in(publish)
        + paste_findings(draft, publish)
        + section_findings(publish)
    )
    if title:
        findings += findings_in(title, "title: ")

    if findings:
        print("PUBLISH GATE FAIL")
        for f in findings:
            print(" -", f)
        return 1
    print("OK: publish text passed the privacy gate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
