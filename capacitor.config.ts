import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration (ARCHITECTURE §12, BUILD_DIRECTIVE P1.11).
 * The Android shell loads the static web build from dist/ over the local https scheme.
 * No cleartext, no mixed content, no remote server URL: the app is fully offline.
 */
const config: CapacitorConfig = {
  appId: 'com.lucidwinds.pixelmeba',
  appName: 'Pixelmeba',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
