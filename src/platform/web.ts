/**
 * P4.11 the web and arcade build (ARCH §14; BUILD_DIRECTIVE P4.11): the build flag for the demo, the
 * offline service worker's registration, and the arcade host's two messages. No Capacitor import: the
 * native app answers isNativePlatform() through src/platform/capacitor.ts.
 *
 * Iframe-safe: nothing here (or anywhere in src/) reads window.top, window.parent, window.opener or
 * frameElement (eslint.config.js; tests/platform/iframe-safe.test.ts).
 */
import { isNativePlatform } from './capacitor';
import { demoScope, type DemoScope, type ScopeSource } from './demoScope';
import type { Manifest, RecipeDef, Species, VariantDef } from '@sim/content/schema';

/** DEMO_MODE (ARCH §14): built with VITE_DEMO_MODE=1 (npm run build:demo). Default off: the full game. */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === '1';

/** What registerServiceWorker reads (fakes in tests/platform/sw-register.test.ts). */
export interface SwEnv {
  /** A production build (import.meta.env.PROD); dev and test builds never register. */
  readonly production: boolean;
  /** The Capacitor app serves the bundle itself: no service worker there. */
  readonly native: boolean;
  readonly secureContext: boolean;
  readonly serviceWorker: { register(url: string, options: { scope: string; type?: 'classic' }): Promise<unknown> } | undefined;
  /** document.baseURI and location.href: a <base> element that moves the document's directory stops registration. */
  readonly baseURI: string;
  readonly href: string;
}

export type SwDecision = 'registered' | 'dev' | 'native' | 'unsupported' | 'insecure' | 'moved-base' | 'failed';

/** The browser's own environment (main thread only). */
export function browserSwEnv(): SwEnv {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { serviceWorker?: ServiceWorkerContainer }) : undefined;
  return {
    production: import.meta.env.PROD,
    native: isNativePlatform(),
    secureContext: typeof isSecureContext === 'boolean' ? isSecureContext : false,
    serviceWorker: nav && 'serviceWorker' in nav ? nav.serviceWorker : undefined,
    baseURI: typeof document !== 'undefined' ? document.baseURI : '',
    href: typeof location !== 'undefined' ? location.href : '',
  };
}

/** Why this page would not register (null: it would). Pure. */
export function swRefusal(env: SwEnv): Exclude<SwDecision, 'registered' | 'failed'> | null {
  if (!env.production) return 'dev';
  if (env.native) return 'native';
  if (!env.serviceWorker) return 'unsupported';
  if (!env.secureContext) return 'insecure';
  // The arcade's stamped layout (tools/deploy-arcade.mjs) serves index.html outside the stamped folder with a
  // <base> into it: a worker registered under <base> could never control that page, so it plays online only.
  let dirBase: string;
  let dirPage: string;
  try {
    dirBase = new URL('./', env.baseURI).href;
    dirPage = new URL('./', env.href).href;
  } catch {
    return 'moved-base';
  }
  if (dirBase !== dirPage) return 'moved-base';
  return null;
}

/**
 * Register the precache service worker (vite-plugin-pwa generateSW → sw.js beside index.html) so the web
 * build plays offline after its first load. A new version installs in the background and takes over only
 * when every Pixelmeba page has closed (no prompt, no skipWaiting); saves live in IndexedDB, which the
 * service worker never touches. A failure is logged and changes nothing: the game plays online.
 */
export async function registerServiceWorker(env: SwEnv = browserSwEnv()): Promise<SwDecision> {
  const refusal = swRefusal(env);
  if (refusal !== null) return refusal;
  try {
    await env.serviceWorker!.register('./sw.js', { scope: './' });
    return 'registered';
  } catch (e) {
    console.warn('Offline play is unavailable (the service worker did not register):', e);
    return 'failed';
  }
}

/**
 * The arcade host's two messages (ARCH §14): exactly { type: 'pixelmeba:pause' } or { type:
 * 'pixelmeba:resume' } (any origin; any other shape, extra fields included, does nothing).
 */
export function hostMessage(data: unknown): 'pause' | 'resume' | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== 'type') return null;
  const t = (data as { type: unknown }).type;
  return t === 'pixelmeba:pause' ? 'pause' : t === 'pixelmeba:resume' ? 'resume' : null;
}

/**
 * DEMO_MODE's scope as the UI reads it (null in the full game): which species Add Life, New Dish and the Field
 * Guide offer. Read from the same content records the worker validates (the worker's own check, on the
 * prepared world, is what refuses; the UI only leaves out what the demo cannot start).
 */
export function uiDemoScope(): DemoScope | null {
  if (!DEMO_MODE) return null;
  uiScope ??= demoScope(rawScopeSource());
  return uiScope;
}
let uiScope: DemoScope | null = null;

function byId<T extends { readonly id: string }>(glob: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of Object.values(glob)) out[r.id] = r;
  return out;
}

function rawScopeSource(): ScopeSource {
  const manifest = Object.values(import.meta.glob<Manifest>('../../content/manifest.json', { eager: true, import: 'default' }))[0]!;
  const species = byId(import.meta.glob<Species>('../../content/species/*.json', { eager: true, import: 'default' }));
  const recipes = byId(import.meta.glob<RecipeDef>('../../content/recipes/FIRST_DISH_V1.json', { eager: true, import: 'default' }));
  const variants = byId(import.meta.glob<VariantDef>('../../content/variants/*.json', { eager: true, import: 'default' }));
  return { manifest, species, speciesIds: Object.keys(species).sort(), recipes, variants, variantIds: Object.keys(variants).sort() };
}
