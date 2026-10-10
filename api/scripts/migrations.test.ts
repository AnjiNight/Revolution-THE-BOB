import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMigrationFolders, migrationsWithoutDown } from './migrations.js';

describe('convenção de migrações reversíveis (CA11)', () => {
  it('toda migração do projeto tem down.sql', () => {
    expect(listMigrationFolders().length).toBeGreaterThan(0);
    expect(migrationsWithoutDown()).toEqual([]);
  });

  it('detecta migração sem down.sql', () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    mkdirSync(join(dir, '001_com_down'));
    writeFileSync(join(dir, '001_com_down', 'migration.sql'), 'SELECT 1;');
    writeFileSync(join(dir, '001_com_down', 'down.sql'), 'SELECT 1;');
    mkdirSync(join(dir, '002_sem_down'));
    writeFileSync(join(dir, '002_sem_down', 'migration.sql'), 'SELECT 1;');
    writeFileSync(join(dir, 'migration_lock.toml'), '');

    expect(listMigrationFolders(dir)).toEqual(['001_com_down', '002_sem_down']);
    expect(migrationsWithoutDown(dir)).toEqual(['002_sem_down']);
  });
});
