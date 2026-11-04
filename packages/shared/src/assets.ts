import { z } from 'zod';
import { NAME_MAX, NAME_MIN, validate, type FieldErrors, type ValidationResult } from './auth.js';

/**
 * Rotas do catálogo de ativos (SPECs 006, 010 e 040, §5.2). `:id` vira o id do ativo com
 * `assetPath`.
 */
export const ASSET_PATHS = {
  search: '/api/assets',
  sectors: '/api/assets/sectors',
  /** SPEC-010: ficha do ativo e fechamentos de um período. */
  detail: '/api/assets/:id',
  history: '/api/assets/:id/history',
  logo: '/api/assets/:id/logo',
  catalog: '/api/collaborator/assets',
  asset: '/api/collaborator/assets/:id',
  deactivate: '/api/collaborator/assets/:id/deactivate',
  reactivate: '/api/collaborator/assets/:id/reactivate',
  confirmClassification: '/api/collaborator/assets/:id/confirm-classification',
} as const;

export function assetPath(path: string, id: string): string {
  return path.replace(':id', encodeURIComponent(id));
}

/** Classes de ativo (DA23, RB22): Ação (inclui units) e FII. Lista fechada. */
export const ASSET_CLASSES = ['stock', 'fii'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Setores econômicos da classificação da B3, para ações (SPEC-006 §4). */
export const STOCK_SECTORS = [
  'bens_industriais',
  'comunicacoes',
  'consumo_ciclico',
  'consumo_nao_ciclico',
  'financeiro',
  'materiais_basicos',
  'petroleo_gas_biocombustiveis',
  'saude',
  'tecnologia_informacao',
  'utilidade_publica',
  'outros',
] as const;

/** Segmentos de FIIs mais usados por corretoras e sites de FIIs (não há lista oficial da B3). */
export const FII_SEGMENTS = [
  'lajes_corporativas',
  'logistica',
  'shoppings',
  'recebiveis',
  'fundo_de_fundos',
  'hibrido',
  'residencial',
  'hoteis',
  'renda_urbana',
  'desenvolvimento',
  'outros',
] as const;

export type StockSector = (typeof STOCK_SECTORS)[number];
export type FiiSegment = (typeof FII_SEGMENTS)[number];
/** Setor (ação) ou segmento (FII). O código só tem sentido junto com a classe ("outros" existe nas duas). */
export type SectorCode = StockSector | FiiSegment;

export const SECTORS_BY_CLASS: Readonly<Record<AssetClass, readonly SectorCode[]>> = {
  stock: STOCK_SECTORS,
  fii: FII_SEGMENTS,
};

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === 'string' && (ASSET_CLASSES as readonly string[]).includes(value);
}

export function isSectorOf(assetClass: AssetClass, sector: string): sector is SectorCode {
  return (SECTORS_BY_CLASS[assetClass] as readonly string[]).includes(sector);
}

export function isKnownSector(sector: string): sector is SectorCode {
  return ASSET_CLASSES.some((assetClass) => isSectorOf(assetClass, sector));
}

/** Um item da lista fixa, como `GET /api/assets/sectors` devolve. */
export interface SectorOption {
  class: AssetClass;
  code: SectorCode;
}

export const SECTOR_OPTIONS: readonly SectorOption[] = ASSET_CLASSES.flatMap((assetClass) =>
  SECTORS_BY_CLASS[assetClass].map((code) => ({ class: assetClass, code })),
);

/**
 * Ticker no formato da B3: 4 caracteres começando por letra (B3SA3 tem número no meio) e 1 ou 2
 * números no fim (PETR4, TAEE11). Sem o "F" do mercado fracionário.
 */
export const TICKER_PATTERN = /^[A-Z][A-Z0-9]{3}[0-9]{1,2}$/;
export const TICKER_MAX = 6;

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/** Busca do usuário: 50 resultados por vez; "Mostrar mais" traz os 50 seguintes. */
export const ASSET_SEARCH_LIMIT = 50;
/** Lista do colaborador (SPEC-040): 100 por vez, com o catálogo da bolsa inteira. */
export const CATALOG_PAGE_LIMIT = 100;
export const ASSET_SEARCH_TEXT_MAX = 60;

/**
 * Texto para comparar na busca: minúsculas, sem acentos e com espaços simples. "Açúcar" e
 * "acucar" viram o mesmo texto.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Última cotação do pregão de um ativo (SPEC-009 e 040), do nível gratuito: atraso de até 45
 * minutos. Nunca é "tempo real" (DA16).
 */
export interface AssetQuote {
  /** Decimal em texto (RNF12). */
  price: string;
  /** Variação em relação ao fechamento do pregão anterior, em %, com 2 casas; `null` sem referência. */
  change: string | null;
  /** Horário da coleta (ISO 8601): a lista da brapi não traz o horário de cada preço (SPEC-040). */
  at: string;
  source: 'brapi';
}

/**
 * Atraso máximo das cotações do nível gratuito (DA16), mostrado junto do horário: 30 minutos do
 * plano gratuito da brapi e até 15 minutos em que a lista fica guardada no servidor dela (SPEC-040).
 */
export const FREE_QUOTE_DELAY_MINUTES = 45;

/** Ativo como o usuário vê na busca. */
export interface Asset {
  id: string;
  ticker: string;
  name: string;
  class: AssetClass;
  sector: SectorCode;
  /** SPEC-009: última cotação do pregão; `null` enquanto não houver nenhuma. */
  quote: AssetQuote | null;
  /** SPEC-040: há logo (em `/api/assets/:id/logo`); sem ele, o app mostra as letras do ticker. */
  hasLogo: boolean;
}

/** Quem pôs o ativo no catálogo (SPEC-040): a equipe ou a importação diária da B3. */
export type AssetOrigin = 'team' | 'import';

/** Ativo como o colaborador vê no catálogo: com a situação e as datas. */
export interface CatalogAsset extends Asset {
  active: boolean;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
  /** SPEC-040. */
  origin: AssetOrigin;
  /** Importado e com a classificação sugerida ainda não conferida pela equipe. */
  classificationPending: boolean;
  /** Desativado pelo processador (sem negócio na B3 há 3 meses); volta sozinho se negociar. */
  autoDeactivated: boolean;
}

/** Corpo de `GET /api/assets`. */
export interface AssetSearchResult {
  /** No máximo 50, a partir do `offset` pedido. */
  assets: Asset[];
  /** Há mais resultados depois destes: a tela mostra "Mostrar mais". */
  hasMore: boolean;
  /** Quantos ativos passam na busca e nos filtros, no total. */
  total: number;
}

/** Primeiro ano do histórico de cotações carregado dos arquivos da B3 (SPEC-008, OPEN-05). */
export const HISTORY_START_YEAR = 2016;

/**
 * Situação do histórico de cotações de um ativo (SPEC-008): `pending` enquanto o processador não
 * leu os arquivos da B3; `loaded` com o primeiro e o último pregão guardados; `not_found` quando
 * todos os anos foram lidos e o ticker não apareceu em nenhum.
 */
export interface AssetHistory {
  status: 'pending' | 'loaded' | 'not_found';
  /** AAAA-MM-DD; `null` sem nenhuma cotação. */
  from: string | null;
  to: string | null;
}

/** Ativo na lista do colaborador: com a situação do histórico de cotações. */
export interface CatalogListAsset extends CatalogAsset {
  history: AssetHistory;
  /** SPEC-040: último pregão com negócio nos arquivos da B3 (AAAA-MM-DD), se conhecido. */
  lastTradedOn: string | null;
}

/** Situação da coleta das cotações do pregão (SPEC-009 §5.3), na tela do colaborador. */
export interface QuoteCollectionStatus {
  /** Última coleta feita (ISO 8601) e como terminou; `null` antes da primeira. */
  lastRunAt: string | null;
  lastStatus: 'sucesso' | 'parcial' | 'falha' | 'cota_esgotada' | null;
  /** De quanto em quanto tempo o processador está buscando, pela regra da cota (30 no mínimo). */
  intervalMinutes: number;
  /** Consultas já usadas e o tamanho da cota no ciclo atual do plano da brapi. */
  requestsUsed: number;
  quota: number;
  /** Quando a cota renova (ISO 8601), se a brapi informou. */
  quotaResetsAt: string | null;
  quotaExhausted: boolean;
  /** Há token da brapi no servidor (SPEC-040: opcional; a lista responde igual sem ele). */
  tokenConfigured: boolean;
  /**
   * A brapi descontou da cota as consultas da última coleta. A lista não desconta (SPEC-040): com
   * `false`, a tela diz que a coleta não gasta a cota.
   */
  quotaCounted: boolean;
}

/** Situação da importação diária do catálogo (SPEC-040 §5.3), na tela do colaborador. */
export interface CatalogImportStatus {
  /** Última importação (ISO 8601) e como terminou; `null` antes da primeira. */
  lastRunAt: string | null;
  lastStatus: 'sucesso' | 'parcial' | 'falha' | null;
  created: number;
  deactivated: number;
  reactivated: number;
  /** Os arquivos da B3 estavam atrasados: ninguém foi desativado nessa importação. */
  b3Behind: boolean;
}

/** Corpo de `GET /api/collaborator/assets`. */
export interface CatalogListResult {
  /** No máximo 100 (SPEC-040), a partir do `offset` pedido. */
  assets: CatalogListAsset[];
  /** Há mais ativos depois destes: a tela mostra "Mostrar mais". */
  hasMore: boolean;
  /** Quantos ativos passam na busca e nos filtros, no total. */
  total: number;
  /** Ativos ativos no catálogo inteiro, sem filtro. */
  activeCount: number;
  /** Importados com a classificação ainda a revisar, no catálogo inteiro. */
  pendingReviewCount: number;
  /**
   * Anos da janela do histórico (desde 2016) sem calendário de pregão publicado: as cotações deles
   * só são carregadas depois da publicação (SPEC-008 §4).
   */
  historyYearsWithoutCalendar: number[];
  /** SPEC-009: situação da coleta das cotações do pregão. */
  quoteCollection: QuoteCollectionStatus;
  /** SPEC-040: situação da importação diária do catálogo. */
  catalogImport: CatalogImportStatus;
}

/** Erros das rotas do catálogo. */
export type CatalogErrorCode = 'ticker_in_use' | 'asset_not_found';

export const ASSET_STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export type AssetStatusFilter = (typeof ASSET_STATUS_FILTERS)[number];

const tickerField = z
  .string({ error: 'required' })
  .max(32, { error: 'invalid_ticker' })
  .transform(normalizeTicker)
  .pipe(
    z.string().min(1, { error: 'required' }).regex(TICKER_PATTERN, { error: 'invalid_ticker' }),
  );

const assetNameField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .min(NAME_MIN, { error: 'too_short' })
  .max(NAME_MAX, { error: 'too_long' });

const assetClassField = z.enum(ASSET_CLASSES, { error: 'invalid_option' });

const sectorField = z
  .string({ error: 'required' })
  .min(1, { error: 'required' })
  .refine(isKnownSector, { error: 'invalid_option' });

/** `POST /api/collaborator/assets`. */
export const newAssetSchema = z.object({
  ticker: tickerField,
  name: assetNameField,
  class: assetClassField,
  sector: sectorField,
});

/** `PATCH /api/collaborator/assets/:id`: só o que muda. A classe não muda (RB22). */
export const assetUpdateSchema = z.object({
  ticker: tickerField.optional(),
  name: assetNameField.optional(),
  sector: sectorField.optional(),
});

export type NewAssetInput = z.input<typeof newAssetSchema>;
export type NewAsset = z.infer<typeof newAssetSchema> & { sector: SectorCode };
export type AssetUpdateInput = z.input<typeof assetUpdateSchema>;
export type AssetUpdate = Omit<z.infer<typeof assetUpdateSchema>, 'sector'> & {
  sector?: SectorCode;
};

/** Setor de outra classe: conhecido, mas não serve para esta classe. */
function sectorClassError(assetClass: unknown, sector: unknown): FieldErrors {
  if (!isAssetClass(assetClass) || typeof sector !== 'string' || !isKnownSector(sector)) return {};
  return isSectorOf(assetClass, sector) ? {} : { sector: 'wrong_class' };
}

/**
 * Valida o cadastro (CA02): o problema de cada campo e, se a classe e o setor forem conhecidos, se o
 * setor é da classe escolhida.
 */
export function validateNewAsset(input: unknown): ValidationResult<NewAsset> {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const checked = validate(newAssetSchema, input);
  const mismatch = sectorClassError(raw.class, raw.sector);
  if (!checked.success) return { success: false, fields: { ...mismatch, ...checked.fields } };
  if (mismatch.sector) return { success: false, fields: mismatch };
  return { success: true, data: checked.data as NewAsset };
}

/**
 * Valida a edição. `assetClass` é a classe atual do ativo (o setor precisa ser dela); quem manda
 * `class` recebe `immutable` (RB22). Pelo menos um campo precisa vir.
 */
export function validateAssetUpdate(
  input: unknown,
  assetClass?: AssetClass,
): ValidationResult<AssetUpdate> {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  if ('class' in raw) return { success: false, fields: { class: 'immutable' } };
  const checked = validate(assetUpdateSchema, input);
  if (!checked.success) return checked;
  const { data } = checked;
  if (data.ticker === undefined && data.name === undefined && data.sector === undefined) {
    return { success: false, fields: { _: 'required' } };
  }
  const mismatch = assetClass ? sectorClassError(assetClass, data.sector) : {};
  if (mismatch.sector) return { success: false, fields: mismatch };
  return { success: true, data: data as AssetUpdate };
}

/** Busca e filtros, iguais para o usuário e para o colaborador (que também filtra a situação). */
export interface AssetSearchQuery {
  q: string;
  class?: AssetClass;
  sector?: SectorCode;
  /** "Mostrar mais" (mudança de 03/11/2026): quantos resultados pular; sem ele, do primeiro. */
  offset?: number;
}

/** Maior `offset` aceito: muito acima do catálogo da bolsa inteira (uns 700 ativos). */
export const ASSET_SEARCH_OFFSET_MAX = 10_000;

export interface CatalogQuery extends AssetSearchQuery {
  status: AssetStatusFilter;
  /** SPEC-040: só os importados com a classificação ainda a revisar. */
  review?: 'pending';
}

const searchQuerySchema = z.object({
  q: z
    .string({ error: 'invalid_option' })
    .max(ASSET_SEARCH_TEXT_MAX, { error: 'too_long' })
    .optional()
    .transform((value) => value?.trim() ?? ''),
  class: assetClassField.optional(),
  sector: sectorField.optional(),
  status: z.enum(ASSET_STATUS_FILTERS, { error: 'invalid_option' }).optional(),
  review: z.literal('pending', { error: 'invalid_option' }).optional(),
  // Chega da query string como texto: só um número inteiro, sem sinal.
  offset: z
    .string({ error: 'invalid_option' })
    .regex(/^\d{1,5}$/, { error: 'invalid_option' })
    .transform(Number)
    .pipe(z.number().max(ASSET_SEARCH_OFFSET_MAX, { error: 'invalid_option' }))
    .optional(),
});

/** Valida a query string da busca. Setor de outra classe que a filtrada dá `wrong_class`. */
export function validateCatalogQuery(input: unknown): ValidationResult<CatalogQuery> {
  const checked = validate(searchQuerySchema, input);
  if (!checked.success) return checked;
  const { q, class: assetClass, sector, status, review, offset } = checked.data;
  const mismatch = sectorClassError(assetClass, sector);
  if (mismatch.sector) return { success: false, fields: mismatch };
  return {
    success: true,
    data: {
      q,
      ...(assetClass ? { class: assetClass } : {}),
      ...(sector ? { sector: sector as SectorCode } : {}),
      status: status ?? 'all',
      ...(review ? { review } : {}),
      ...(offset ? { offset } : {}),
    },
  };
}
