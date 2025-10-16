#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scan_bmb_names.py
Scan a project directory for file/folder names that may cause ZIP/archive issues:
- Emoji or other pictographs
- Non-ASCII characters
- Reserved/illegal characters on Windows (< > : " / \ | ? *)
- Control characters
- Leading/trailing spaces or trailing dots
- Windows reserved device names (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
It prints a summary and writes a CSV report with suggested safe names.
"""
import os
import sys
import csv
import unicodedata
from typing import List, Tuple

# Emoji / pictograph ranges (best-effort; covers most practical cases)
EMOJI_RANGES: List[Tuple[int, int]] = [
    (0x1F300, 0x1FAFF),  # Misc symbols & pictographs -> Supplemental symbols & Pictographs
    (0x1F600, 0x1F64F),  # Emoticons
    (0x1F680, 0x1F6FF),  # Transport & map
    (0x2600,  0x26FF),   # Misc symbols
    (0x2700,  0x27BF),   # Dingbats
    (0xFE0F,  0xFE0F),   # Variation Selector-16
]

ILLEGAL_CHARS = set('<>:"/\\|?*')
CONTROL_CHARS = {chr(c) for c in range(0x00, 0x20)}  # 0x00-0x1F

WIN_RESERVED_BASENAMES = {
    'CON','PRN','AUX','NUL',
    *(f'COM{i}' for i in range(1,10)),
    *(f'LPT{i}' for i in range(1,10)),
}

def has_emoji(s: str) -> bool:
    for ch in s:
        cp = ord(ch)
        for lo, hi in EMOJI_RANGES:
            if lo <= cp <= hi:
                return True
    return False

def has_non_ascii(s: str) -> bool:
    return any(ord(ch) > 127 for ch in s)

def has_illegal_chars(s: str) -> bool:
    return any(ch in ILLEGAL_CHARS for ch in s)

def has_control_chars(s: str) -> bool:
    return any(ch in CONTROL_CHARS for ch in s)

def has_leading_or_trailing_space_or_dot(s: str) -> bool:
    return (s != s.strip()) or s.endswith('.') or s.endswith(' ')

def is_windows_reserved_basename(s: str) -> bool:
    base = os.path.splitext(s)[0].upper()
    return base in WIN_RESERVED_BASENAMES

def bad_chars(s: str) -> str:
    # show the specific offending characters (unique, in order of appearance)
    seen = set()
    out = []
    for ch in s:
        cond = (
            ord(ch) > 127 or
            ch in ILLEGAL_CHARS or
            ch in CONTROL_CHARS
        )
        if cond and ch not in seen:
            out.append(ch)
            seen.add(ch)
    return ''.join(out)

def sanitize_name(s: str) -> str:
    """
    Produce a conservative, cross-platform safe suggestion:
    - Keep ASCII letters/digits/space/._-
    - Collapse runs of spaces to single spaces
    - Strip leading/trailing spaces and dots
    - Replace everything else with '_'
    """
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ._-")
    out = []
    prev_space = False
    for ch in s:
        if ch in allowed and ch not in CONTROL_CHARS:
            if ch == ' ':
                if not prev_space:
                    out.append(ch)
                prev_space = True
            else:
                out.append(ch)
                prev_space = False
        else:
            out.append('_')
            prev_space = False
    candidate = ''.join(out).strip(' .')
    # Avoid empty name
    return candidate or 'renamed_item'

def analyze_name(name: str) -> List[str]:
    issues = []
    if has_emoji(name):
        issues.append('emoji')
    if has_non_ascii(name):
        issues.append('non-ascii')
    if has_illegal_chars(name):
        issues.append('illegal-chars')
    if has_control_chars(name):
        issues.append('control-chars')
    if has_leading_or_trailing_space_or_dot(name):
        issues.append('leading/trailing-space-or-dot')
    if is_windows_reserved_basename(name):
        issues.append('windows-reserved-name')
    return issues

def main():
    if len(sys.argv) > 1:
        root = sys.argv[1]
    else:
        root = '.'

    if not os.path.exists(root):
        print(f"Path does not exist: {root}", file=sys.stderr)
        sys.exit(2)

    print(f"Scanning: {os.path.abspath(root)}")
    findings = []  # rows for CSV
    count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # analyze directories
        for d in dirnames:
            rel_path = os.path.join(dirpath, d)
            rel_path_display = os.path.relpath(rel_path, root)
            issues = analyze_name(d)
            if issues:
                count += 1
                findings.append({
                    'type': 'dir',
                    'path': rel_path_display,
                    'issues': ';'.join(issues),
                    'bad_chars': bad_chars(d),
                    'suggested_safe_name': sanitize_name(d),
                })
        # analyze files
        for f in filenames:
            rel_path = os.path.join(dirpath, f)
            rel_path_display = os.path.relpath(rel_path, root)
            issues = analyze_name(f)
            if issues:
                count += 1
                findings.append({
                    'type': 'file',
                    'path': rel_path_display,
                    'issues': ';'.join(issues),
                    'bad_chars': bad_chars(f),
                    'suggested_safe_name': sanitize_name(f),
                })

    if findings:
        csv_path = os.path.abspath('weird_names_report.csv')
        with open(csv_path, 'w', newline='', encoding='utf-8') as fp:
            w = csv.DictWriter(fp, fieldnames=['type','path','issues','bad_chars','suggested_safe_name'])
            w.writeheader()
            w.writerows(findings)
        print(f"\nFound {count} problematic items.")
        print(f"CSV report written to: {csv_path}")
        print("\nPreview of first 20 items:")
        for row in findings[:20]:
            print(f"- [{row['type']}] {row['path']} | issues={row['issues']} | bad={row['bad_chars']} | suggestion={row['suggested_safe_name']}")
        print("\nNote: This script does NOT rename anything. Review the CSV first.")
        print("If you want, you can ask me to generate a renamer (git-safe) from that CSV.")
    else:
        print("No problematic names detected. You're good to archive/zip.")

if __name__ == '__main__':
    main()
