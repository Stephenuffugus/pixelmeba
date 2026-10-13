#!/usr/bin/env python3
"""Build a wave run file from a tasks file and the Phase 4 runner (lead tool).

Usage: python3 tools/lead/build-run-file.py <tasks file> <wave id> <description> <owner context> <key,key,...> <out file> [runner file]

The runner defaults to docs/agent/g4-runner-ft.workflow.js.txt (Phase 4); Phase 5 passes docs/agent/g5-runner-ft.workflow.js.txt.

The run file is: the meta block; the tasks file with "export " removed (STATE, TASKS, WAVE_TASKS); WAVE_ID,
OWNER_CONTEXT and ag(); then docs/agent/g4-runner-ft.workflow.js.txt from "// ---- runner" on, with agent( -> ag(
and A.only set to the given keys. It checks that the result parses as an async function body.
"""
import json
import re
import subprocess
import sys

tasks_path, wave_id, description, owner_context, keys, out_path = sys.argv[1:7]
runner_path = sys.argv[7] if len(sys.argv) > 7 else 'docs/agent/g4-runner-ft.workflow.js.txt'
keys = [k for k in keys.split(',') if k]
tasks = open(tasks_path).read()
tasks = re.sub(r'^export ', '', tasks, flags=re.M)
# The runner declares its own TASKS: the tasks file's list becomes WAVE_TASKS (as the wave 5a run file did).
if len(re.findall(r'^const TASKS = \[', tasks, flags=re.M)) != 1 or len(re.findall(r'^const WAVE_TASKS = TASKS\s*$', tasks, flags=re.M)) != 1:
    sys.exit('refused: the tasks file must have one "const TASKS = [" and one "const WAVE_TASKS = TASKS"')
tasks = re.sub(r'^const WAVE_TASKS = TASKS\s*$\n?', '', tasks, flags=re.M)
tasks = re.sub(r'^const TASKS = \[', 'const WAVE_TASKS = [', tasks, flags=re.M)
runner_src = open(runner_path).read()
runner = runner_src[runner_src.index('// ---- runner'):]
runner = re.sub(r'\bagent\(', 'ag(', runner)
old_a = 'const A = { wave: WAVE_ID, state: STATE, tasks: WAVE_TASKS }'
if runner.count(old_a) != 1:
    sys.exit('refused: the runner has no single A line')
runner = runner.replace(old_a, f'const A = {{ wave: WAVE_ID, state: STATE, tasks: WAVE_TASKS, only: {json.dumps(keys)} }}')
for k in keys:
    if f"key: '{k}'" not in tasks:
        sys.exit(f'refused: no task {k}')
if '`' in owner_context or '${' in owner_context:
    sys.exit('refused: the owner context has a backtick or ${')
meta = f"""export const meta = {{
  name: {json.dumps(wave_id)},
  description: {json.dumps(description)},
  phases: [
    {{ title: 'Build', detail: 'one builder per task, effort high; unit tests + own e2e on desktop and phone-portrait' }},
    {{ title: 'Verify', detail: 'one rules verifier over the wave diff; a saves lens per critical task' }},
    {{ title: 'Fix', detail: 'only tasks with a BLOCKER/MAJOR; at most two rounds' }},
  ],
}}

// Run file built by tools/lead/build-run-file.py from {tasks_path} ("export" removed) and the Phase 4 runner
// (docs/agent/g4-runner-ft.workflow.js.txt from "// ---- runner" on, agent( -> ag( so every prompt starts with
// OWNER_CONTEXT). This run: {', '.join(keys)}.
"""
body = (meta + '\n' + tasks.rstrip('\n') + '\n\n' + f"const WAVE_ID = {json.dumps(wave_id)} // reports go to docs/reports/reviews/{wave_id}/\n"
        + f"const OWNER_CONTEXT = `{owner_context}`\n"
        + 'const ag = (prompt, opts) => agent(`${OWNER_CONTEXT}\\n\\n${prompt}`, opts)\n\n' + runner)
open(out_path, 'w').write(body)
check = ("const fs=require('fs');let s=fs.readFileSync(process.argv[1],'utf8').replace(/^export const meta/m,'const meta');"
         "new Function('agent','parallel','pipeline','phase','log','args','budget','return (async()=>{'+s+'})');console.log('parse ok')")
r = subprocess.run(['node', '-e', check, out_path], capture_output=True, text=True)
print(r.stdout.strip() or r.stderr.strip()[:400])
sys.exit(0 if r.returncode == 0 else 1)
