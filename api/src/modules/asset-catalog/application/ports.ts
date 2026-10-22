import type { AssetClass, AssetStatusFilter, SectorCode } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type { StoredAsset } from '../domain/asset.js';

export interface AssetFilter {
  status: AssetStatusFilter;
  assetClass?: AssetClass | undefined;
  sector?: SectorCode | undefined;
}

/** Campos que uma alteração pode mudar. A classe não está aqui (RB22). */
export type AssetChanges = Partial<
  Pick<StoredAsset, 'ticker' | 'name' | 'sector' | 'deactivatedAt'>
>;

/** Decisão tomada sobre o ativo atual, com ele travado: o que muda e o registro de auditoria. */
export interface AssetModification {
  changes: AssetChanges;
  updatedAt: Date;
  audit: AuditEntry;
}

export interface AssetRepository {
  /** Ativos que passam nos filtros, em qualquer ordem (a busca ordena). */
  list(filter: AssetFilter): Promise<StoredAsset[]>;
  countActive(): Promise<number>;
  findById(id: string): Promise<StoredAsset | null>;
  /** Grava o ativo e o registro de auditoria juntos. Ticker em uso: TickerInUseError. */
  create(asset: StoredAsset, audit: AuditEntry): Promise<StoredAsset>;
  /**
   * Trava o ativo, chama `decide` com o estado atual e grava a mudança e a auditoria juntas.
   * `decide` devolve `null` quando não há o que mudar (nada é gravado) e pode lançar erro (nada
   * é gravado). Devolve `null` se o ativo não existe. Ticker em uso: TickerInUseError.
   */
  modify(
    id: string,
    decide: (current: StoredAsset) => AssetModification | null,
  ): Promise<StoredAsset | null>;
}
