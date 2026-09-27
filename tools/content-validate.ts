/**
 * npm run content:validate [-- --write]
 * Validates every content pack, prints exact file → field on failure, and checks (or with --write,
 * updates) the manifest's contentHash. Exit code ≠ 0 on any error.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeContentHash, validateContent } from '../src/sim/content/registry';
import { CONTENT_DIR, loadRawPacksFs } from './lib/content-fs';

const write = process.argv.includes('--write');
const raw = loadRawPacksFs();
const { registry, issues } = validateContent(raw);
const hash = await computeContentHash(raw);
const manifestPath = join(CONTENT_DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { contentHash: string };

let errors = issues.filter((i) => i.severity === 'error').length;
for (const i of issues) {
  const where = `${i.file}${i.path ? ` → ${i.path}` : ''}`;
  console[i.severity === 'error' ? 'error' : 'warn'](`${i.severity.toUpperCase()} ${where}: ${i.message}`);
}

if (manifest.contentHash !== hash) {
  if (write && errors === 0) {
    manifest.contentHash = hash;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`wrote contentHash ${hash}`);
  } else if (!write) {
    console.error(`ERROR content/manifest.json → contentHash: is "${manifest.contentHash}", content hashes to "${hash}" (run npm run content:validate -- --write)`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`content: ${errors} error(s)`);
  process.exit(1);
}
const r = registry!;
console.log(
  `content ok · contentHash ${hash} · species ${r.speciesIds.length} (enabled ${r.manifest.enabledSpecies.length}) · ` +
    `materials ${r.materialIds.length} · modules ${r.moduleIds.length} · habitats ${r.habitatIds.length} · ` +
    `recipes ${r.recipeIds.length} · experiments ${r.experimentIds.length} · variants ${r.variantIds.length}`,
);
