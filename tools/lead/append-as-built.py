#!/usr/bin/env python3
"""Append an "as built" note to the STATE template literal of a wave tasks file (lead tool, 2026-10-11).

Usage: python3 tools/lead/append-as-built.py <tasks file> <note file> NAME=value [NAME=value ...]

Each <<NAME>> in the note is replaced by its value. The script refuses, and writes nothing, when a <<...>> is left,
when the note or a value holds a backtick or "${" (STATE is a JS template literal), when the note's first line is
already in the tasks file, or when the tasks file does not have exactly one "export const STATE = `" literal.
"""
import re
import sys

tasks_path, note_path, *pairs = sys.argv[1:]
note = open(note_path).read().strip()
for pair in pairs:
    name, _, value = pair.partition('=')
    if f'<<{name}>>' not in note:
        sys.exit(f'refused: the note has no <<{name}>>')
    note = note.replace(f'<<{name}>>', value)
left = re.findall(r'<<[A-Z0-9_]+>>', note)
if left:
    sys.exit(f'refused: placeholders left: {left}')
if '`' in note or '${' in note:
    sys.exit('refused: the note holds a backtick or "${"')
s = open(tasks_path).read()
head = 'export const STATE = `'
if s.count(head) != 1:
    sys.exit('refused: the tasks file must have exactly one "export const STATE = `"')
first_line = note.splitlines()[0][:80]
if first_line in s:
    sys.exit('refused: the note is already in the tasks file')
start = s.index(head) + len(head)
end = s.index('`', start)  # STATE holds no backtick, so the next one closes it
s = s[:end] + '\n\n' + note + s[end:]
open(tasks_path, 'w').write(s)
print(f'appended {len(note)} characters to STATE in {tasks_path}')
