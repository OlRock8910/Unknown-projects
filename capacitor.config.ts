import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reelbox.app',
  appName: 'ReelBox',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0b0b0fff',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
