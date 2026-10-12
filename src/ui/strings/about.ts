/**
 * About (UX §2 "version, content hash"; G2 comprehension m25): the app version and, from the content
 * manifest this build ships, the content hash and every rule version, so a tester's report can name the
 * exact build. Old dishes keep the versions they recorded; these are the build's own.
 */
import manifest from '@content/manifest.json';
import { APP_VERSION } from '@persist/appVersion';

export interface AboutLine {
  readonly term: string;
  readonly value: string;
}

export function aboutLines(m: typeof manifest = manifest, app: string = APP_VERSION): readonly AboutLine[] {
  return [
    { term: 'App version', value: app },
    { term: 'Content hash', value: m.contentHash },
    { term: 'Content version', value: String(m.contentVersion) },
    { term: 'Simulation rules', value: String(m.simulationVersion) },
    { term: 'Evolution rules', value: String(m.evolutionRulesVersion) },
    { term: 'Ability registry', value: String(m.moduleRegistryVersion) },
    { term: 'Trait mapping', value: String(m.phenotypeMappingVersion) },
    { term: 'Build phase', value: String(m.buildPhase) },
  ];
}

/**
 * P4.12 (PLAY_STORE_CHECKLIST §A "Accessibility statement in About"; PRIVACY_POLICY.md): the two statements
 * About shows under its description (the description itself is the About route's body in App.tsx; where saves
 * live is said here, once). Each names only what the build has (UX §9; Settings).
 */
export const ABOUT_TEXT = {
  accessibility:
    'Accessibility: every control works with a keyboard; the dish has a screen-reader summary and a selected-cell description; Reduced motion, Quiet audio, Simplified overlay colours and text up to 200 % are in Settings.',
  privacy: 'Privacy: Pixelmeba collects no data. Saves stay on this device (your phone\'s own backup may copy them). Files leave it only when you choose Share or Export.',
} as const;
