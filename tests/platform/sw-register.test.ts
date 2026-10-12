/**
 * P4.11 (ARCH §14): the precache service worker registers only where it can serve the page offline — a
 * production web build, in a secure context, with service workers available, outside the native app, and with
 * no <base> moving the page's directory (the arcade's stamped layout, tools/deploy-arcade.mjs). Every branch
 * with fakes; the registration is './sw.js' with scope './'; a failed registration is reported, never thrown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserSwEnv, DEMO_MODE, registerServiceWorker, swRefusal, type SwEnv } from '../../src/platform/web';
import { setNativePlatformForTests } from '../../src/platform/capacitor';

function env(over: Partial<SwEnv> = {}, register = vi.fn(() => Promise.resolve({}))): { env: SwEnv; register: typeof register } {
  return {
    register,
    env: {
      production: true,
      native: false,
      secureContext: true,
      serviceWorker: { register },
      baseURI: 'https://arcade.example/arcade/pixelmeba/index.html',
      href: 'https://arcade.example/arcade/pixelmeba/index.html',
      ...over,
    },
  };
}

afterEach(() => setNativePlatformForTests(null));

describe('registerServiceWorker', () => {
  it("registers './sw.js' with scope './' in a production web build served from a subpath", async () => {
    const e = env();
    expect(await registerServiceWorker(e.env)).toBe('registered');
    expect(e.register).toHaveBeenCalledTimes(1);
    expect(e.register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('a page URL with a query or a hash is the same directory', async () => {
    const e = env({ href: 'https://arcade.example/arcade/pixelmeba/?x=1#y', baseURI: 'https://arcade.example/arcade/pixelmeba/?x=1#y' });
    expect(await registerServiceWorker(e.env)).toBe('registered');
  });

  for (const [why, over, decision] of [
    ['a dev or test build', { production: false }, 'dev'],
    ['the native app (Capacitor serves the bundle)', { native: true }, 'native'],
    ['no service worker support', { serviceWorker: undefined }, 'unsupported'],
    ['an insecure origin', { secureContext: false }, 'insecure'],
    [
      "the arcade's stamped layout (<base> into a stamped folder)",
      { href: 'https://arcade.example/satellites/pixelmeba/', baseURI: 'https://arcade.example/satellites/pixelmeba/20261012-1200/' },
      'moved-base',
    ],
    ['an unreadable base', { baseURI: 'not a url', href: 'also not' }, 'moved-base'],
  ] as const) {
    it(`never registers for ${why}`, async () => {
      const e = env(over);
      expect(swRefusal(e.env)).toBe(decision);
      expect(await registerServiceWorker(e.env)).toBe(decision);
      expect(e.register).not.toHaveBeenCalled();
    });
  }

  it('a <base> that keeps the same directory still registers', async () => {
    const e = env({ baseURI: 'https://arcade.example/arcade/pixelmeba/', href: 'https://arcade.example/arcade/pixelmeba/index.html' });
    expect(await registerServiceWorker(e.env)).toBe('registered');
  });

  it('a failed registration is reported and logged, never thrown (the game plays online)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const e = env({}, vi.fn(() => Promise.reject(new Error('blocked'))));
    expect(await registerServiceWorker(e.env)).toBe('failed');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('the browser environment: tests are not a production build, and the native flag follows isNativePlatform()', () => {
    expect(browserSwEnv().production).toBe(false);
    setNativePlatformForTests(true);
    expect(browserSwEnv().native).toBe(true);
    setNativePlatformForTests(false);
    expect(browserSwEnv().native).toBe(false);
    // DEMO_MODE is a build flag, off unless VITE_DEMO_MODE=1 (npm run build:demo).
    expect(DEMO_MODE).toBe(false);
  });
});
