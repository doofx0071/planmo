import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

export function resolveUserConfigDir(options?: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
}): string {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;
  const home = options?.home ?? homedir();
  const pathApi = platform === 'win32' ? win32 : posix;

  const configDirOverride = env.PLANMO_CONFIG_DIR;
  if (configDirOverride?.trim()) {
    return pathApi.resolve(options?.cwd ?? process.cwd(), configDirOverride);
  }

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    const appDataDir =
      localAppData && win32.isAbsolute(localAppData)
        ? localAppData
        : win32.join(home, 'AppData', 'Local');
    return win32.join(appDataDir, 'PlanMo');
  }

  if (platform === 'darwin') {
    return pathApi.join(home, 'Library', 'Application Support', 'PlanMo');
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME;
  if (xdgConfigHome && posix.isAbsolute(xdgConfigHome)) {
    return posix.join(xdgConfigHome, 'planmo');
  }
  return posix.join(home, '.config', 'planmo');
}
