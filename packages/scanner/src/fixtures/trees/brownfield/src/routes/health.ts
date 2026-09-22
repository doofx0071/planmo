import { formatBytes } from '../lib/format.js';

export function healthRoute(options: { version: string }) {
  return {
    path: '/health',
    handler: () => ({ ok: true, version: options.version }),
  };
}

export function versionRoute() {
  const payload = formatBytes(1024);
  return {
    path: '/api/version',
    handler: () => ({ payload }),
  };
}
