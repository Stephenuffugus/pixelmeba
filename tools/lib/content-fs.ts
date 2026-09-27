/** Node loader: reads content/ from disk into the same RawPacks shape as the Vite loader. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RawFile, RawPacks } from '../../src/sim/content/registry';
import { buildRegistry, type ContentRegistry } from '../../src/sim/content/registry';

export const REPO_ROOT = join(import.meta.dirname, '..', '..');
export const CONTENT_DIR = join(REPO_ROOT, 'content');

function readJson(path: string): RawFile {
  const text = readFileSync(path, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${relative(REPO_ROOT, path)}: invalid JSON (${(e as Error).message})`, { cause: e });
  }
  return { file: relative(REPO_ROOT, path).split('\\').join('/'), data };
}

function dir(root: string, name: string): RawFile[] {
  const d = join(root, name);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(d, f)));
}

export function loadRawPacksFs(root: string = CONTENT_DIR): RawPacks {
  return {
    manifest: readJson(join(root, 'manifest.json')),
    loci: readJson(join(root, 'loci.json')),
    species: dir(root, 'species'),
    materials: dir(root, 'materials'),
    modules: dir(root, 'modules'),
    habitats: dir(root, 'habitats'),
    structures: dir(root, 'structures'),
    recipes: dir(root, 'recipes'),
    experiments: dir(root, 'experiments'),
    variants: dir(root, 'variants'),
    objectives: dir(root, 'objectives'),
  };
}

let cached: ContentRegistry | null = null;
export function loadRegistryFs(): ContentRegistry {
  cached ??= buildRegistry(loadRawPacksFs());
  return cached;
}
