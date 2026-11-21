import { randomUUID } from 'node:crypto';
import type { AuditEntry, StoredAuditEntry } from '../application/audit.js';

/** Registro de auditoria em memória, compartilhado pelos repositórios falsos dos outros módulos. */
export class InMemoryAuditTrail {
  readonly entries: StoredAuditEntry[] = [];

  append(entry: AuditEntry): void {
    // Cópia em JSON, como no banco: nada guardado muda depois.
    this.entries.push({
      ...entry,
      id: randomUUID(),
      details: JSON.parse(JSON.stringify(entry.details)) as AuditEntry['details'],
    });
  }

  forEntity(entity: AuditEntry['entity'], entityId: string): StoredAuditEntry[] {
    return this.entries.filter((e) => e.entity === entity && e.entityId === entityId);
  }
}
