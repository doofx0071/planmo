// Synthetic application shell (fixture content only).
import { healthRoute } from './routes/health.js';

export interface AppOptions {
  version: string;
}

export function createApp(options: AppOptions = { version: '0.4.0' }) {
  return {
    routes: [healthRoute(options)],
    listen(port: number, onReady: () => void) {
      onReady();
      return { port };
    },
  };
}
