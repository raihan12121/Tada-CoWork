import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omayk.cowork',
  appName: 'Tada CoWork',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'https'
  }
};

export default config;
