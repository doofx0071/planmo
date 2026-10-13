export interface CredentialStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
  remove(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
}

export class SecureStoreError extends Error {
  readonly code = 'SECURE_STORE_UNAVAILABLE';

  constructor() {
    super('Secure credential storage is unavailable.');
    this.name = 'SecureStoreError';
  }
}

export interface ResolveCredentialOptions {
  envName: string;
  env: Readonly<Record<string, string | undefined>>;
  credentialRef: string | null;
  store: CredentialStore;
}

export async function resolveCredential({
  envName,
  env,
  credentialRef,
  store,
}: ResolveCredentialOptions): Promise<string | null> {
  const environmentValue = env[envName];
  if (typeof environmentValue === 'string' && environmentValue.trim().length > 0)
    return environmentValue;
  if (credentialRef === null) return null;
  try {
    const storedValue = await store.get(credentialRef);
    return storedValue !== null && storedValue.trim().length > 0 ? storedValue : null;
  } catch {
    throw new SecureStoreError();
  }
}
