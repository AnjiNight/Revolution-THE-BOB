import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url);

/** Pastas de migração (ignora arquivos como migration_lock.toml). */
export function listMigrationFolders(dir: URL | string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dirPath(dir), name)).isDirectory())
    .sort();
}

/** Migrações sem o down.sql exigido pela convenção da SPEC-001. */
export function migrationsWithoutDown(dir: URL | string = MIGRATIONS_DIR): string[] {
  return listMigrationFolders(dir).filter(
    (name) => !existsSync(join(dirPath(dir), name, 'down.sql')),
  );
}

export function dirPath(dir: URL | string): string {
  return typeof dir === 'string' ? dir : decodeURIComponent(dir.pathname);
}
