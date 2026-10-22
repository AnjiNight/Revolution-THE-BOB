import type {
  AcaoAuditoria,
  EntidadeAuditoria,
  Prisma,
  PrismaClient,
  RegistroAuditoria,
} from '../../../generated/prisma/client.js';
import type {
  AuditAction,
  AuditDetails,
  AuditEntity,
  AuditEntry,
  StoredAuditEntry,
} from '../application/audit.js';

const ACTION_TO_ACAO: Record<AuditAction, AcaoAuditoria> = {
  asset_created: 'ativo_cadastrado',
  asset_updated: 'ativo_editado',
  asset_deactivated: 'ativo_desativado',
  asset_reactivated: 'ativo_reativado',
  calendar_published: 'calendario_publicado',
};
const ACAO_TO_ACTION = Object.fromEntries(
  Object.entries(ACTION_TO_ACAO).map(([action, acao]) => [acao, action]),
) as Record<AcaoAuditoria, AuditAction>;

const ENTITY_TO_ENTIDADE: Record<AuditEntity, EntidadeAuditoria> = {
  asset: 'ativo',
  calendar_year: 'ano_calendario',
};
const ENTIDADE_TO_ENTITY = Object.fromEntries(
  Object.entries(ENTITY_TO_ENTIDADE).map(([entity, entidade]) => [entidade, entity]),
) as Record<EntidadeAuditoria, AuditEntity>;

/**
 * Linha a gravar, dentro da transação de quem fez a alteração: a mudança e o registro dela entram
 * juntos ou nenhum dos dois entra.
 */
export function auditRow(entry: AuditEntry): Prisma.RegistroAuditoriaCreateInput {
  return {
    ocorridoEm: entry.at,
    colaboradorId: entry.collaboratorId,
    acao: ACTION_TO_ACAO[entry.action],
    entidade: ENTITY_TO_ENTIDADE[entry.entity],
    entidadeId: entry.entityId,
    detalhes: entry.details as Prisma.InputJsonObject,
  };
}

function toStored(row: RegistroAuditoria): StoredAuditEntry {
  return {
    id: row.id,
    at: row.ocorridoEm,
    collaboratorId: row.colaboradorId,
    action: ACAO_TO_ACTION[row.acao],
    entity: ENTIDADE_TO_ENTITY[row.entidade],
    entityId: row.entidadeId,
    details: row.detalhes as AuditDetails,
  };
}

/** Leitura do registro (testes e, depois, o painel da equipe na SPEC-011). */
export class PrismaAuditTrail {
  constructor(private readonly prisma: PrismaClient) {}

  /** Registros de um item, do mais antigo para o mais recente. */
  async forEntity(entity: AuditEntity, entityId: string): Promise<StoredAuditEntry[]> {
    const rows = await this.prisma.registroAuditoria.findMany({
      where: { entidade: ENTITY_TO_ENTIDADE[entity], entidadeId: entityId },
      orderBy: { ocorridoEm: 'asc' },
    });
    return rows.map(toStored);
  }

  /** Registros feitos por um colaborador, do mais antigo para o mais recente. */
  async byCollaborator(collaboratorId: string): Promise<StoredAuditEntry[]> {
    const rows = await this.prisma.registroAuditoria.findMany({
      where: { colaboradorId: collaboratorId },
      orderBy: { ocorridoEm: 'asc' },
    });
    return rows.map(toStored);
  }
}
