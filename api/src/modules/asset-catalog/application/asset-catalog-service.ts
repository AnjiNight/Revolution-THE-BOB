import { randomUUID } from 'node:crypto';
import {
  ASSET_SEARCH_LIMIT,
  isSectorOf,
  SECTOR_OPTIONS,
  type AssetHistory,
  type AssetSearchQuery,
  type AssetSearchResult,
  type AssetUpdate,
  type CatalogAsset,
  type CatalogListResult,
  type CatalogQuery,
  type NewAsset,
  type SectorOption,
} from '@simulador/shared';
import type { AuditAction, AuditEntry, JsonValue } from '../../audit/application/audit.js';
import { searchAssets } from '../domain/asset-search.js';
import { isActive, toCatalogAsset, toPublicAsset, type StoredAsset } from '../domain/asset.js';
import { AssetNotFoundError, AssetValidationError } from '../domain/errors.js';
import type {
  AssetChanges,
  AssetHistoryReader,
  AssetModification,
  AssetRepository,
} from './ports.js';

const PENDING_HISTORY: AssetHistory = { status: 'pending', from: null, to: null };

export interface AssetCatalogServiceDeps {
  assets: AssetRepository;
  /** Situação do histórico de cotações (SPEC-008). Sem ela, todos aparecem como "carregando". */
  history?: AssetHistoryReader;
  clock?: () => Date;
  newId?: () => string;
}

/**
 * Catálogo de ativos (SPEC-006): busca para qualquer pessoa conectada; cadastro, edição,
 * desativação e reativação pelo colaborador, sempre com registro de auditoria (RNF15).
 */
export class AssetCatalogService {
  private readonly clock: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: AssetCatalogServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
  }

  /** Usuário: só ativos ativos (OPEN-41), até 50 resultados. */
  async search(query: AssetSearchQuery): Promise<AssetSearchResult> {
    const candidates = await this.deps.assets.list({
      status: 'active',
      assetClass: query.class,
      sector: query.sector,
    });
    const found = searchAssets(candidates, query.q, ASSET_SEARCH_LIMIT);
    return { assets: found.assets.map(toPublicAsset), hasMore: found.hasMore };
  }

  /**
   * Colaborador: todos os que passam nos filtros, inclusive desativados, com a situação do
   * histórico de cotações (SPEC-008), e o total de ativos.
   */
  async catalog(query: CatalogQuery): Promise<CatalogListResult> {
    const [candidates, activeCount, history] = await Promise.all([
      this.deps.assets.list({
        status: query.status,
        assetClass: query.class,
        sector: query.sector,
      }),
      this.deps.assets.countActive(),
      this.deps.history?.overview(),
    ]);
    return {
      assets: searchAssets(candidates, query.q).assets.map((asset) => ({
        ...toCatalogAsset(asset),
        history: history?.byAsset.get(asset.id) ?? PENDING_HISTORY,
      })),
      activeCount,
      historyYearsWithoutCalendar: history?.yearsWithoutCalendar ?? [],
    };
  }

  sectors(): readonly SectorOption[] {
    return SECTOR_OPTIONS;
  }

  /** Cadastro (CA01). Os dados já chegam validados pelas regras compartilhadas. */
  async create(input: NewAsset, collaboratorId: string): Promise<CatalogAsset> {
    const now = this.clock();
    const asset: StoredAsset = {
      id: this.newId(),
      ticker: input.ticker,
      name: input.name,
      assetClass: input.class,
      sector: input.sector,
      createdAt: now,
      updatedAt: now,
      deactivatedAt: null,
    };
    const created = await this.deps.assets.create(asset, {
      at: now,
      collaboratorId,
      action: 'asset_created',
      entity: 'asset',
      entityId: asset.id,
      details: {
        after: {
          ticker: asset.ticker,
          name: asset.name,
          class: asset.assetClass,
          sector: asset.sector,
        },
      },
    });
    return toCatalogAsset(created);
  }

  /**
   * Edição (CA03): ticker, nome e setor. O setor precisa ser da classe do ativo, conferida com ele
   * travado. Sem mudança de verdade, nada é gravado e não há auditoria.
   */
  async update(id: string, input: AssetUpdate, collaboratorId: string): Promise<CatalogAsset> {
    return this.change(id, (current) => {
      if (input.sector !== undefined && !isSectorOf(current.assetClass, input.sector)) {
        throw new AssetValidationError({ sector: 'wrong_class' });
      }
      const changes: AssetChanges = {};
      if (input.ticker !== undefined && input.ticker !== current.ticker) {
        changes.ticker = input.ticker;
      }
      if (input.name !== undefined && input.name !== current.name) changes.name = input.name;
      if (input.sector !== undefined && input.sector !== current.sector) {
        changes.sector = input.sector;
      }
      if (Object.keys(changes).length === 0) return null;
      return this.modification(current, collaboratorId, 'asset_updated', changes);
    });
  }

  /** Some da busca e não pode ser comprado; quem tem continua vendo e pode vender (§4). */
  async deactivate(id: string, collaboratorId: string): Promise<CatalogAsset> {
    return this.change(id, (current) => {
      if (!isActive(current)) return null;
      const now = this.clock();
      return this.modification(
        current,
        collaboratorId,
        'asset_deactivated',
        { deactivatedAt: now },
        now,
      );
    });
  }

  async reactivate(id: string, collaboratorId: string): Promise<CatalogAsset> {
    return this.change(id, (current) =>
      isActive(current)
        ? null
        : this.modification(current, collaboratorId, 'asset_reactivated', { deactivatedAt: null }),
    );
  }

  private async change(
    id: string,
    decide: Parameters<AssetRepository['modify']>[1],
  ): Promise<CatalogAsset> {
    const changed = await this.deps.assets.modify(id, decide);
    if (!changed) throw new AssetNotFoundError();
    return toCatalogAsset(changed);
  }

  private modification(
    current: StoredAsset,
    collaboratorId: string,
    action: AuditAction,
    changes: AssetChanges,
    now = this.clock(),
  ): AssetModification {
    const audit: AuditEntry = {
      at: now,
      collaboratorId,
      action,
      entity: 'asset',
      entityId: current.id,
      details: {
        before: snapshot(current, changes),
        after: snapshot({ ...current, ...changes }, changes),
      },
    };
    return { changes, updatedAt: now, audit };
  }
}

/** Só os campos que mudaram, em JSON. Situação (ativo ou não) em vez da data de desativação. */
function snapshot(asset: StoredAsset, changes: AssetChanges): { [key: string]: JsonValue } {
  const fields: { [key: string]: JsonValue } = {};
  if ('ticker' in changes) fields.ticker = asset.ticker;
  if ('name' in changes) fields.name = asset.name;
  if ('sector' in changes) fields.sector = asset.sector;
  if ('deactivatedAt' in changes) fields.active = isActive(asset);
  return fields;
}
