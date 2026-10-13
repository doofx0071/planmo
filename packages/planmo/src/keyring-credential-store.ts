import type { EntryOptions } from '@napi-rs/keyring';
import { SecureStoreError, type CredentialStore } from './credential-store.js';

export interface KeyringEntry {
  setPassword(value: string): void;
  getPassword(): string | null;
  deletePassword(): boolean;
}

export type KeyringModuleLoader = () => Promise<{
  Entry: new (service: string, account: string, options: EntryOptions) => KeyringEntry;
}>;

export interface KeyringCredentialStoreOptions {
  loadModule?: KeyringModuleLoader;
}

const loadNativeKeyringModule: KeyringModuleLoader = () => import('@napi-rs/keyring');

export class KeyringCredentialStore implements CredentialStore {
  private readonly loadModule: KeyringModuleLoader;

  constructor({ loadModule = loadNativeKeyringModule }: KeyringCredentialStoreOptions = {}) {
    this.loadModule = loadModule;
  }

  async get(ref: string): Promise<string | null> {
    return this.withEntry(ref, (entry) => {
      const value = entry.getPassword();
      return value !== null && value.trim().length > 0 ? value : null;
    });
  }

  async set(ref: string, value: string): Promise<void> {
    if (value.trim().length === 0) return;
    await this.withEntry(ref, (entry) => entry.setPassword(value));
  }

  async remove(ref: string): Promise<void> {
    await this.withEntry(ref, (entry) => {
      entry.deletePassword();
    });
  }

  async has(ref: string): Promise<boolean> {
    return this.withEntry(ref, (entry) => {
      const value = entry.getPassword();
      return value !== null && value.trim().length > 0;
    });
  }

  private async withEntry<Result>(
    ref: string,
    operation: (entry: KeyringEntry) => Result | Promise<Result>,
  ): Promise<Result> {
    try {
      const { Entry } = await this.loadModule();
      const entry = new Entry('planmo', ref, { linux: { store: 'secret-service' } });
      return await operation(entry);
    } catch {
      throw new SecureStoreError();
    }
  }
}
