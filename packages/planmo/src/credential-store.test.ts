import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { resolveCredential, SecureStoreError, type CredentialStore } from './credential-store.js';
import { KeyringCredentialStore } from './keyring-credential-store.js';

describe('credential storage', () => {
  it('prefers a non-empty injected environment value over the keyring', async () => {
    const secret = ' synthetic-env-secret ';
    const reads: string[] = [];
    const store: CredentialStore = {
      async get(ref) {
        reads.push(ref);
        return 'stored-secret';
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: { PLANMO_AI_API_KEY: secret },
      credentialRef: 'opaque-credential-ref',
      store,
    });

    expect(result).toBe(secret);
    expect(reads).toEqual([]);
  });

  it('uses the referenced keyring credential when the environment value is empty', async () => {
    const refs: string[] = [];
    const store: CredentialStore = {
      async get(ref) {
        refs.push(ref);
        return 'synthetic-keyring-secret';
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: { PLANMO_AI_API_KEY: '' },
      credentialRef: 'opaque-profile-credential-ref',
      store,
    });

    expect(result).toBe('synthetic-keyring-secret');
    expect(refs).toEqual(['opaque-profile-credential-ref']);
  });

  it('treats a whitespace-only environment value as missing and falls back to the keyring', async () => {
    const refs: string[] = [];
    const store: CredentialStore = {
      async get(ref) {
        refs.push(ref);
        return 'synthetic-keyring-secret';
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: { PLANMO_AI_API_KEY: ' \t\n ' },
      credentialRef: 'opaque-profile-credential-ref',
      store,
    });

    expect(result).toBe('synthetic-keyring-secret');
    expect(refs).toEqual(['opaque-profile-credential-ref']);
  });

  it.each(['', ' \t\n '])(
    'treats a %j value returned by the credential store as missing',
    async (value) => {
      const store: CredentialStore = {
        async get() {
          return value;
        },
        async set() {},
        async remove() {},
        async has() {
          return false;
        },
      };

      const result = await resolveCredential({
        envName: 'PLANMO_AI_API_KEY',
        env: {},
        credentialRef: 'opaque-profile-credential-ref',
        store,
      });

      expect(result).toBeNull();
    },
  );

  it('returns missing when the referenced keyring item is absent', async () => {
    const refs: string[] = [];
    const store: CredentialStore = {
      async get(ref) {
        refs.push(ref);
        return null;
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: {},
      credentialRef: 'opaque-profile-credential-ref',
      store,
    });

    expect(result).toBeNull();
    expect(refs).toEqual(['opaque-profile-credential-ref']);
  });

  it('returns missing without querying a keyring when no credential reference exists', async () => {
    const refs: string[] = [];
    const store: CredentialStore = {
      async get(ref) {
        refs.push(ref);
        return null;
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: { PLANMO_AI_API_KEY: '' },
      credentialRef: null,
      store,
    });

    expect(result).toBeNull();
    expect(refs).toEqual([]);
  });

  it('redacts failures from the injected credential store', async () => {
    const secret = 'synthetic-error-secret';
    const store: CredentialStore = {
      async get() {
        throw new Error(`keyring is locked while handling ${secret}`);
      },
      async set() {},
      async remove() {},
      async has() {
        return false;
      },
    };
    let failure: unknown;

    try {
      await resolveCredential({
        envName: 'PLANMO_AI_API_KEY',
        env: {},
        credentialRef: 'opaque-profile-credential-ref',
        store,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof SecureStoreError).toBe(true);
    expect(
      failure instanceof Error && failure.message === 'Secure credential storage is unavailable.',
    ).toBe(true);
    expect(inspect(failure).includes(secret)).toBe(false);
  });

  it('round-trips credentials through the PlanMo keyring account', async () => {
    const values = new Map<string, string>();
    const constructions: Array<{ service: string; account: string; options: unknown }> = [];
    class FakeEntry {
      readonly key: string;

      constructor(service: string, account: string, options: unknown) {
        constructions.push({ service, account, options });
        this.key = `${service}\0${account}`;
      }

      setPassword(value: string) {
        values.set(this.key, value);
      }

      getPassword() {
        return values.get(this.key) ?? null;
      }

      deletePassword() {
        return values.delete(this.key);
      }
    }

    const secret = ' synthetic-keyring-secret ';
    const credentialRef = 'opaque-profile-credential-ref';
    const store = new KeyringCredentialStore({
      loadModule: async () => ({ Entry: FakeEntry }),
    });

    expect(await store.get(credentialRef)).toBeNull();
    expect(await store.has(credentialRef)).toBe(false);
    await store.set(credentialRef, secret);
    expect(await store.get(credentialRef)).toBe(secret);
    expect(await store.has(credentialRef)).toBe(true);
    await store.remove(credentialRef);
    expect(await store.get(credentialRef)).toBeNull();
    expect(await store.has(credentialRef)).toBe(false);
    expect(constructions.length).toBeGreaterThan(0);
    expect(constructions.every(({ service }) => service === 'planmo')).toBe(true);
    expect(constructions.every(({ account }) => account === credentialRef)).toBe(true);
    expect(
      constructions.every(
        ({ options }) =>
          JSON.stringify(options) === JSON.stringify({ linux: { store: 'secret-service' } }),
      ),
    ).toBe(true);
  });

  it.each(['', ' \t\n '])('treats a %j keyring password as missing', async (value) => {
    class FakeEntry {
      constructor(_service: string, _account: string, _options: unknown) {}

      setPassword(_value: string) {}

      getPassword() {
        return value;
      }

      deletePassword() {
        return false;
      }
    }

    const credentialRef = 'opaque-profile-credential-ref';
    const store = new KeyringCredentialStore({
      loadModule: async () => ({ Entry: FakeEntry }),
    });

    const result = await resolveCredential({
      envName: 'PLANMO_AI_API_KEY',
      env: {},
      credentialRef,
      store,
    });

    expect(result).toBeNull();
    expect(await store.get(credentialRef)).toBeNull();
    expect(await store.has(credentialRef)).toBe(false);
  });

  it.each(['', '   '])(
    'does not load or write to the keyring for an empty credential (%j)',
    async (value) => {
      let loadCount = 0;
      let writeCount = 0;
      class FakeEntry {
        constructor(_service: string, _account: string, _options: unknown) {}

        setPassword(_value: string) {
          writeCount += 1;
        }

        getPassword() {
          return null;
        }

        deletePassword() {
          return false;
        }
      }

      const store = new KeyringCredentialStore({
        loadModule: async () => {
          loadCount += 1;
          return { Entry: FakeEntry };
        },
      });

      await store.set('opaque-profile-credential-ref', value);

      expect(loadCount).toBe(0);
      expect(writeCount).toBe(0);
    },
  );

  it('sanitizes missing-package and locked-keyring failures without logging secrets', async () => {
    const secret = 'synthetic-keyring-error-secret';
    const lockedError = new Error(`locked keyring backend received ${secret}`);
    class LockedEntry {
      constructor(_service: string, _account: string, _options: unknown) {}

      setPassword(_value: string) {
        throw lockedError;
      }

      getPassword(): string | null {
        throw lockedError;
      }

      deletePassword(): boolean {
        throw lockedError;
      }
    }

    const missingPackageStore = new KeyringCredentialStore({
      loadModule: async () => {
        throw new Error(`optional keyring package is missing: ${secret}`);
      },
    });
    const lockedStore = new KeyringCredentialStore({
      loadModule: async () => ({ Entry: LockedEntry }),
    });
    const logs: string[] = [];
    const consoleMethods = ['debug', 'info', 'log', 'warn', 'error'] as const;
    const spies = consoleMethods.map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((argument) => inspect(argument)).join(' '));
      }),
    );

    try {
      for (const operation of [
        () => missingPackageStore.get('opaque-profile-credential-ref'),
        () => lockedStore.set('opaque-profile-credential-ref', secret),
      ]) {
        let failure: unknown;
        try {
          await operation();
        } catch (error) {
          failure = error;
        }

        expect(failure instanceof SecureStoreError).toBe(true);
        expect(
          failure instanceof Error &&
            failure.message === 'Secure credential storage is unavailable.',
        ).toBe(true);
        expect(inspect(failure).includes(secret)).toBe(false);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    expect(logs.some((line) => line.includes(secret))).toBe(false);
  });
});
