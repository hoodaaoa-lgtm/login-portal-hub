import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ao.hooda.app',
  appName: 'Hooda',
  webDir: 'dist',
  server: {
    // App carrega o site já publicado (mesma abordagem de um PWA embrulhado)
    url: 'https://hoode.lovable.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
