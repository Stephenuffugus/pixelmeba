#!/usr/bin/env python3
"""Add dated wave notes to WORKLOG task lines without ticking them (lead tool; D-0104: nothing is ticked before its flip).

Usage: python3 tools/lead/worklog-notes.py <notes.json> [SHA=<sha>]

notes.json maps a task id ("P5.1") to the note text; "{SHA}" in a note is replaced by the given sha. Each note is
inserted before the line's closing "; not enabled)" (or before its final ")" when that tail is absent, or appended in a
new parenthesis when the line has none). A task line that is missing or already ticked is an error; nothing is written
unless every note applies.
"""
import json
import re
import sys

notes = json.load(open(sys.argv[1]))
sha = next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('SHA=')), '')
path = 'docs/WORKLOG.md'
lines = open(path).read().split('\n')
for task, note in notes.items():
    note = note.replace('{SHA}', sha)
    idx = [i for i, l in enumerate(lines) if re.match(r'^- \[[ ~]\] ' + re.escape(task) + r' ', l)]
    if len(idx) != 1:
        sys.exit(f'refused: {task} matches {len(idx)} unticked lines')
    i = idx[0]
    l = lines[i]
    if l.endswith('; not enabled)'):
        l = l[: -len('; not enabled)')] + f'; {note}; not enabled)'
    elif l.endswith(')'):
        l = l[:-1] + f'; {note})'
    else:
        l = l + f' ({note})'
    lines[i] = l
open(path, 'w').write('\n'.join(lines))
print('notes added:', ', '.join(notes))
