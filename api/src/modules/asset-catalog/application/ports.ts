import type {
  AssetClass,
  AssetHistory,
  AssetQuote,
  AssetStatusFilter,
  CatalogImportStatus,
  IsoDate,
  PricePoint,
  QuoteCollectionStatus,
  SectorCode,
} from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type { PriceEventInput } from '../../financial-calculation/price-adjustment.js';
import type { StoredAsset } from '../domain/asset.js';

export interface AssetFilter {
  status: AssetStatusFilter;
  assetClass?: AssetClass | undefined;
  sector?: SectorCode | undefined;
  /** SPEC-040: só os importados com a classificação ainda a revisar. */
  pendingReview?: boolean | undefined;
}

/** Campos que uma alteração pode mudar. A classe e a origem não estão aqui (RB22). */
export type AssetChanges = Partial<
  Pick<
    StoredAsset,
    'ticker' | 'name' | 'sector' | 'deactivatedAt' | 'classificationReviewedAt' | 'autoDeactivated'
  >
>;

/** Decisão tomada sobre o ativo atual, com ele travado: o que muda e o registro de auditoria. */
export interface AssetModification {
  changes: AssetChanges;
  updatedAt: Date;
  audit: AuditEntry;
}

/**
 * Situação do histórico de cotações (SPEC-008), que o módulo Dados de Mercado fornece. O catálogo
 * só mostra; não sabe de cotações.
 */
export interface AssetHistoryReader {
  overview(): Promise<{ byAsset: Map<string, AssetHistory>; yearsWithoutCalendar: number[] }>;
  /** SPEC-010: a situação de um ativo só, para a ficha. */
  forAsset(assetId: string): Promise<AssetHistory>;
}

/**
 * Última cotação do pregão de cada ativo e situação da coleta (SPEC-009), também do módulo Dados
 * de Mercado.
 */
export interface AssetQuoteReader {
  latestQuotes(): Promise<Map<string, AssetQuote>>;
  /** SPEC-010: a última de um ativo só, para a ficha. */
  latestQuote(assetId: string): Promise<AssetQuote | null>;
  status(): Promise<QuoteCollectionStatus>;
}

/** Um pregão guardado da B3 (SPEC-010), em decimal como texto (RNF12). */
export interface StoredSession {
  date: IsoDate;
  open: string;
  high: string;
  low: string;
  close: string;
  trades: number | null;
  volume: string | null;
}

/** SPEC-010: os pregões guardados da B3 de um ativo, que o módulo Dados de Mercado fornece. */
export interface AssetPriceReader {
  /** Os últimos `count` pregões, do mais novo para o mais antigo. */
  sessions(assetId: string, count: number): Promise<StoredSession[]>;
  /** Fechamentos desde `from` (Tudo: desde o primeiro), em ordem de data. */
  closes(assetId: string, from: IsoDate | null): Promise<PricePoint[]>;
}

/** SPEC-042: eventos corporativos de um ativo (B3), que o módulo Dados de Mercado fornece. */
export interface AssetEventReader {
  /** Desdobramentos, grupamentos e bonificações, em ordem de data com. */
  forAsset(assetId: string): Promise<PriceEventInput[]>;
}

/** Volume financeiro do último pregão de cada ativo (SPEC-040: a busca sem texto ordena por ele). */
export interface AssetActivityReader {
  lastVolumes(): Promise<Map<string, string>>;
}

/** Logos dos ativos (SPEC-040), guardados pelo módulo Dados de Mercado. */
export interface AssetLogoReader {
  withLogo(): Promise<Set<string>>;
  find(assetId: string): Promise<{ type: string; content: Uint8Array } | null>;
}

/** Importação diária do catálogo (SPEC-040): situação e o último negócio de cada ticker na B3. */
export interface CatalogImportReader {
  status(): Promise<CatalogImportStatus>;
  lastTradingDays(): Promise<Map<string, string>>;
}

export interface AssetRepository {
  /** Ativos que passam nos filtros, em qualquer ordem (a busca ordena). */
  list(filter: AssetFilter): Promise<StoredAsset[]>;
  countActive(): Promise<number>;
  /** Importados com a classificação ainda a revisar, no catálogo inteiro. */
  countPendingReview(): Promise<number>;
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
