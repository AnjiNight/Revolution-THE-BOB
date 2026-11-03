import { randomUUID } from 'node:crypto';
import {
  ASSET_SEARCH_LIMIT,
  CATALOG_PAGE_LIMIT,
  isSectorOf,
  SECTOR_OPTIONS,
  type AssetHistory,
  type AssetSearchQuery,
  type AssetSearchResult,
  type AssetUpdate,
  type CatalogAsset,
  type CatalogImportStatus,
  type CatalogListResult,
  type CatalogQuery,
  type NewAsset,
  type QuoteCollectionStatus,
  type SectorOption,
} from '@simulador/shared';
import type { AuditAction, AuditEntry, JsonValue } from '../../audit/application/audit.js';
import { searchAssets } from '../domain/asset-search.js';
import {
  isActive,
  isClassificationPending,
  toCatalogAsset,
  toPublicAsset,
  type StoredAsset,
} from '../domain/asset.js';
import { AssetNotFoundError, AssetValidationError, LogoNotFoundError } from '../domain/errors.js';
import type {
  AssetActivityReader,
  AssetChanges,
  AssetHistoryReader,
  AssetLogoReader,
  AssetModification,
  AssetQuoteReader,
  AssetRepository,
  CatalogImportReader,
} from './ports.js';

const PENDING_HISTORY: AssetHistory = { status: 'pending', from: null, to: null };

/** Sem o leitor de cotações (testes antigos): nenhuma coleta, cota cheia, sem token. */
const NO_COLLECTION: QuoteCollectionStatus = {
  lastRunAt: null,
  lastStatus: null,
  intervalMinutes: 30,
  requestsUsed: 0,
  quota: 15_000,
  quotaResetsAt: null,
  quotaExhausted: false,
  tokenConfigured: false,
  quotaCounted: false,
};

/** Sem a importação (testes antigos): nenhuma importação ainda. */
const NO_IMPORT: CatalogImportStatus = {
  lastRunAt: null,
  lastStatus: null,
  created: 0,
  deactivated: 0,
  reactivated: 0,
  b3Behind: false,
};

export interface AssetCatalogServiceDeps {
  assets: AssetRepository;
  /** Situação do histórico de cotações (SPEC-008). Sem ela, todos aparecem como "carregando". */
  history?: AssetHistoryReader;
  /** Última cotação e situação da coleta (SPEC-009). Sem ele, nenhum ativo tem cotação. */
  quotes?: AssetQuoteReader;
  /** SPEC-040: volume do último pregão (ordem da busca sem texto), logos e importação. */
  activity?: AssetActivityReader;
  logos?: AssetLogoReader;
  imports?: CatalogImportReader;
  clock?: () => Date;
  newId?: () => string;
}

/**
 * Catálogo de ativos (SPEC-006 e 040): busca para qualquer pessoa conectada; cadastro, edição,
 * conferência da classificação importada, desativação e reativação pelo colaborador, sempre com
 * registro de auditoria (RNF15).
 */
export class AssetCatalogService {
  private readonly clock: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: AssetCatalogServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
  }

  /**
   * Usuário: só ativos ativos (OPEN-41), até 50 resultados, com a última cotação (SPEC-009) e o
   * logo (SPEC-040). Sem texto, os mais negociados primeiro.
   */
  async search(query: AssetSearchQuery): Promise<AssetSearchResult> {
    const [candidates, quotes, logos, volumes] = await Promise.all([
      this.deps.assets.list({
        status: 'active',
        assetClass: query.class,
        sector: query.sector,
      }),
      this.deps.quotes?.latestQuotes(),
      this.deps.logos?.withLogo(),
      this.deps.activity?.lastVolumes(),
    ]);
    const found = searchAssets(candidates, query.q, ASSET_SEARCH_LIMIT, byVolume(volumes));
    return {
      assets: found.assets.map((asset) =>
        toPublicAsset(asset, quotes?.get(asset.id) ?? null, logos?.has(asset.id) ?? false),
      ),
      hasMore: found.hasMore,
    };
  }

  /**
   * Colaborador: até 100 dos que passam nos filtros, inclusive desativados, com a situação do
   * histórico (SPEC-008), da coleta (SPEC-009) e da importação (SPEC-040).
   */
  async catalog(query: CatalogQuery): Promise<CatalogListResult> {
    const [
      candidates,
      activeCount,
      pendingReviewCount,
      history,
      quotes,
      quoteCollection,
      logos,
      volumes,
      catalogImport,
      tradingDays,
    ] = await Promise.all([
      this.deps.assets.list({
        status: query.status,
        assetClass: query.class,
        sector: query.sector,
        pendingReview: query.review === 'pending',
      }),
      this.deps.assets.countActive(),
      this.deps.assets.countPendingReview(),
      this.deps.history?.overview(),
      this.deps.quotes?.latestQuotes(),
      this.deps.quotes?.status(),
      this.deps.logos?.withLogo(),
      this.deps.activity?.lastVolumes(),
      this.deps.imports?.status(),
      this.deps.imports?.lastTradingDays(),
    ]);
    const found = searchAssets(candidates, query.q, CATALOG_PAGE_LIMIT, byVolume(volumes));
    return {
      assets: found.assets.map((asset) => ({
        ...toCatalogAsset(asset, quotes?.get(asset.id) ?? null, logos?.has(asset.id) ?? false),
        history: history?.byAsset.get(asset.id) ?? PENDING_HISTORY,
        lastTradedOn: tradingDays?.get(asset.ticker) ?? null,
      })),
      hasMore: found.hasMore,
      activeCount,
      pendingReviewCount,
      historyYearsWithoutCalendar: history?.yearsWithoutCalendar ?? [],
      quoteCollection: quoteCollection ?? NO_COLLECTION,
      catalogImport: catalogImport ?? NO_IMPORT,
    };
  }

  sectors(): readonly SectorOption[] {
    return SECTOR_OPTIONS;
  }

  /** Logo do ativo (SPEC-040). Sem logo próprio: LogoNotFoundError. */
  async logo(id: string): Promise<{ type: string; content: Uint8Array }> {
    const image = await this.deps.logos?.find(id);
    if (!image) throw new LogoNotFoundError();
    return image;
  }

  /**
   * Cadastro (CA01). Os dados já chegam validados pelas regras compartilhadas. Quem cadastra
   * escolhe a classificação: o ativo já nasce conferido (SPEC-040).
   */
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
      origin: 'team',
      classificationReviewedAt: now,
      autoDeactivated: false,
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
   * travado; mudar o setor também confere a classificação (SPEC-040). Sem mudança de verdade, nada
   * é gravado e não há auditoria.
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
        if (isClassificationPending(current)) changes.classificationReviewedAt = this.clock();
      }
      if (Object.keys(changes).length === 0) return null;
      return this.modification(current, collaboratorId, 'asset_updated', changes);
    });
  }

  /**
   * SPEC-040: o colaborador confere a classificação sugerida sem mudar nada. Já conferida: nada é
   * gravado e não há auditoria.
   */
  async confirmClassification(id: string, collaboratorId: string): Promise<CatalogAsset> {
    return this.change(id, (current) => {
      if (!isClassificationPending(current)) return null;
      const now = this.clock();
      return this.modification(
        current,
        collaboratorId,
        'classification_confirmed',
        { classificationReviewedAt: now },
        now,
      );
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
        { deactivatedAt: now, autoDeactivated: false },
        now,
      );
    });
  }

  async reactivate(id: string, collaboratorId: string): Promise<CatalogAsset> {
    return this.change(id, (current) =>
      isActive(current)
        ? null
        : this.modification(current, collaboratorId, 'asset_reactivated', {
            deactivatedAt: null,
            autoDeactivated: false,
          }),
    );
  }

  private async change(
    id: string,
    decide: Parameters<AssetRepository['modify']>[1],
  ): Promise<CatalogAsset> {
    const changed = await this.deps.assets.modify(id, decide);
    if (!changed) throw new AssetNotFoundError();
    const hasLogo = (await this.deps.logos?.withLogo())?.has(changed.id) ?? false;
    return toCatalogAsset(changed, null, hasLogo);
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

/** Os mais negociados primeiro (volume do último pregão); sem volume, por último. */
function byVolume(
  volumes: Map<string, string> | undefined,
): ((a: StoredAsset, b: StoredAsset) => number) | undefined {
  if (!volumes || volumes.size === 0) return undefined;
  // Só para ordenar: a precisão do número não importa aqui.
  const volumeOf = (asset: StoredAsset) => Number(volumes.get(asset.id) ?? -1);
  return (a, b) => volumeOf(b) - volumeOf(a);
}

/** Só os campos que mudaram, em JSON. Situação (ativo ou não) em vez da data de desativação. */
function snapshot(asset: StoredAsset, changes: AssetChanges): { [key: string]: JsonValue } {
  const fields: { [key: string]: JsonValue } = {};
  if ('ticker' in changes) fields.ticker = asset.ticker;
  if ('name' in changes) fields.name = asset.name;
  if ('sector' in changes) fields.sector = asset.sector;
  if ('deactivatedAt' in changes) fields.active = isActive(asset);
  if ('classificationReviewedAt' in changes) {
    fields.classificationPending = isClassificationPending(asset);
    fields.sector = asset.sector;
  }
  return fields;
}
