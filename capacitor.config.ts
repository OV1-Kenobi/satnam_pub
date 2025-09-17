import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor configuration for Satnam PWA wrapper
// - PWA build output lives in dist (Vite)
// - Android native project lives under mobile/android per repo structure preference
// - App identifiers selected per user request
const config: CapacitorConfig = {
  appId: 'app.satnam.pub',
  appName: 'Satnam',
  webDir: 'dist',
  android: {
    path: 'mobile/android',
    resolveServiceWorkerRequests: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;

