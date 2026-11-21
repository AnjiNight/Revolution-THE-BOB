import { chmod, readFile, rm, writeFile } from 'node:fs/promises';

/** Onde o app guarda o token de renovação (RNF08). */
export interface SecretStore {
  /** false quando o segredo vive só na memória (sem cofre do sistema operacional). */
  readonly persistent: boolean;
  load(): Promise<string | null>;
  save(secret: string): Promise<void>;
  clear(): Promise<void>;
}

/** Interface mínima do `safeStorage` do Electron, injetada para permitir testes. */
export interface OsEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class MemorySecretStore implements SecretStore {
  readonly persistent = false;
  private secret: string | null = null;

  async load(): Promise<string | null> {
    return this.secret;
  }
  async save(secret: string): Promise<void> {
    this.secret = secret;
  }
  async clear(): Promise<void> {
    this.secret = null;
  }
}

/**
 * Grava o segredo criptografado pelo cofre do SO. Se o cofre não estiver disponível
 * (alguns Linux sem keyring), nada vai para o disco: a sessão vale só com o app aberto.
 */
export class EncryptedFileSecretStore implements SecretStore {
  private readonly memory = new MemorySecretStore();

  constructor(
    private readonly file: string,
    private readonly encryption: OsEncryption,
  ) {}

  get persistent(): boolean {
    return this.encryption.isEncryptionAvailable();
  }

  async load(): Promise<string | null> {
    if (!this.persistent) return this.memory.load();
    try {
      return this.encryption.decryptString(await readFile(this.file));
    } catch {
      return null;
    }
  }

  async save(secret: string): Promise<void> {
    if (!this.persistent) return this.memory.save(secret);
    await writeFile(this.file, this.encryption.encryptString(secret), { mode: 0o600 });
    await chmod(this.file, 0o600).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await this.memory.clear();
    await rm(this.file, { force: true });
  }
}
