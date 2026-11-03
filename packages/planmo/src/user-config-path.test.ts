import { describe, expect, it } from 'vitest';
import { resolveUserConfigDir } from './user-config-path.js';

type PathCase = {
  name: string;
  options: Parameters<typeof resolveUserConfigDir>[0];
  expected: string;
};

const pathCases: PathCase[] = [
  {
    name: 'relative PLANMO_CONFIG_DIR overrides platform settings and resolves from injected cwd',
    options: {
      platform: 'linux',
      env: {
        PLANMO_CONFIG_DIR: './agent-config',
        PLANMO_HOME: '/legacy/planmo-home',
        XDG_CONFIG_HOME: '/xdg/config',
        LOCALAPPDATA: 'C:\\Users\\person\\AppData\\Local',
      },
      home: '/home/person',
      cwd: '/workspace/project',
    },
    expected: '/workspace/project/agent-config',
  },
  {
    name: 'uses the Linux platform default when PLANMO_CONFIG_DIR is empty',
    options: {
      platform: 'linux',
      env: { PLANMO_CONFIG_DIR: '' },
      home: '/home/person',
      cwd: '/workspace/project',
    },
    expected: '/home/person/.config/planmo',
  },
  {
    name: 'uses the Linux platform default when PLANMO_CONFIG_DIR contains only whitespace',
    options: {
      platform: 'linux',
      env: { PLANMO_CONFIG_DIR: '   ' },
      home: '/home/person',
      cwd: '/workspace/project',
    },
    expected: '/home/person/.config/planmo',
  },
  {
    name: 'uses Windows LOCALAPPDATA',
    options: {
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\person\\AppData\\Local' },
      home: 'C:\\Users\\person',
      cwd: 'D:\\workspace',
    },
    expected: 'C:\\Users\\person\\AppData\\Local\\PlanMo',
  },
  {
    name: 'falls back to the Windows home when LOCALAPPDATA is relative',
    options: {
      platform: 'win32',
      env: { LOCALAPPDATA: 'relative/appdata' },
      home: 'C:\\Users\\person',
      cwd: 'D:\\workspace',
    },
    expected: 'C:\\Users\\person\\AppData\\Local\\PlanMo',
  },
  {
    name: 'falls back to the Windows home when LOCALAPPDATA is empty',
    options: {
      platform: 'win32',
      env: { LOCALAPPDATA: '' },
      home: 'C:\\Users\\person',
      cwd: 'D:\\workspace',
    },
    expected: 'C:\\Users\\person\\AppData\\Local\\PlanMo',
  },
  {
    name: 'falls back to the Windows home when LOCALAPPDATA is unavailable',
    options: {
      platform: 'win32',
      env: { PLANMO_HOME: 'D:\\legacy\\home' },
      home: 'C:\\Users\\person',
      cwd: 'D:\\workspace',
    },
    expected: 'C:\\Users\\person\\AppData\\Local\\PlanMo',
  },
  {
    name: 'uses the macOS Application Support directory',
    options: {
      platform: 'darwin',
      env: { XDG_CONFIG_HOME: '/ignored/xdg' },
      home: '/Users/person',
      cwd: '/workspace',
    },
    expected: '/Users/person/Library/Application Support/PlanMo',
  },
  {
    name: 'uses an absolute Linux XDG_CONFIG_HOME',
    options: {
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/home/person/.config' },
      home: '/home/person',
      cwd: '/workspace',
    },
    expected: '/home/person/.config/planmo',
  },
  {
    name: 'ignores a relative Linux XDG_CONFIG_HOME and falls back to the home',
    options: {
      platform: 'linux',
      env: { XDG_CONFIG_HOME: 'relative/config' },
      home: '/home/person',
      cwd: '/workspace',
    },
    expected: '/home/person/.config/planmo',
  },
  {
    name: 'uses the Linux home when XDG_CONFIG_HOME is missing',
    options: {
      platform: 'linux',
      env: {},
      home: '/home/person',
      cwd: '/workspace',
    },
    expected: '/home/person/.config/planmo',
  },
];

describe('resolveUserConfigDir()', () => {
  it.each(pathCases)('$name', ({ options, expected }) => {
    expect(resolveUserConfigDir(options)).toBe(expected);
  });
});
