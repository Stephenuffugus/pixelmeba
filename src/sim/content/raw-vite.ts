/**
 * Browser/worker/Vitest loader: bundles every content JSON file through Vite's import.meta.glob.
 * Node CLI tools use tools/lib/content-fs.ts, which produces the identical RawPacks shape.
 */
import type { RawFile, RawPacks } from './registry';

type Glob = Record<string, unknown>;

function files(glob: Glob): RawFile[] {
  return Object.keys(glob)
    .sort()
    .map((path) => {
      const mod = glob[path] as { default?: unknown };
      return { file: path.replace(/^.*\/content\//, 'content/'), data: mod.default ?? mod };
    });
}

const manifestGlob = import.meta.glob('../../../content/manifest.json', { eager: true });
const lociGlob = import.meta.glob('../../../content/loci.json', { eager: true });

function single(glob: Glob, name: string): RawFile {
  const f = files(glob)[0];
  if (f === undefined) throw new Error(`content/${name} is missing`);
  return f;
}

export function loadRawPacksVite(): RawPacks {
  return {
    manifest: single(manifestGlob, 'manifest.json'),
    loci: single(lociGlob, 'loci.json'),
    species: files(import.meta.glob('../../../content/species/*.json', { eager: true })),
    materials: files(import.meta.glob('../../../content/materials/*.json', { eager: true })),
    modules: files(import.meta.glob('../../../content/modules/*.json', { eager: true })),
    habitats: files(import.meta.glob('../../../content/habitats/*.json', { eager: true })),
    structures: files(import.meta.glob('../../../content/structures/*.json', { eager: true })),
    recipes: files(import.meta.glob('../../../content/recipes/*.json', { eager: true })),
    experiments: files(import.meta.glob('../../../content/experiments/*.json', { eager: true })),
    variants: files(import.meta.glob('../../../content/variants/*.json', { eager: true })),
    objectives: files(import.meta.glob('../../../content/objectives/*.json', { eager: true })),
  };
}
