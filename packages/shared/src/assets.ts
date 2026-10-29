import { z } from 'zod';
import { NAME_MAX, NAME_MIN, validate, type FieldErrors, type ValidationResult } from './auth.js';

/** Rotas do catálogo de ativos (SPEC-006, §5.2). `:id` vira o id do ativo com `assetPath`. */
export const ASSET_PATHS = {
  search: '/api/assets',
  sectors: '/api/assets/sectors',
  catalog: '/api/collaborator/assets',
  asset: '/api/collaborator/assets/:id',
  deactivate: '/api/collaborator/assets/:id/deactivate',
  reactivate: '/api/collaborator/assets/:id/reactivate',
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

/** Busca do usuário: no máximo 50 resultados (o catálogo curado cabe inteiro). */
export const ASSET_SEARCH_LIMIT = 50;
export const ASSET_SEARCH_TEXT_MAX = 60;
/** A coleta gratuita de cotações comporta uns 40 a 50 ativos (DA16): acima disso, a tela avisa. */
export const FREE_COLLECTION_CAPACITY = 50;

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

/** Ativo como o usuário vê na busca. */
export interface Asset {
  id: string;
  ticker: string;
  name: string;
  class: AssetClass;
  sector: SectorCode;
}

/** Ativo como o colaborador vê no catálogo: com a situação e as datas. */
export interface CatalogAsset extends Asset {
  active: boolean;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

/** Corpo de `GET /api/assets`. */
export interface AssetSearchResult {
  assets: Asset[];
  /** Há mais resultados além dos 50 devolvidos: a pessoa precisa refinar a busca. */
  hasMore: boolean;
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
}

/** Corpo de `GET /api/collaborator/assets`. */
export interface CatalogListResult {
  assets: CatalogListAsset[];
  /** Ativos ativos no catálogo inteiro, sem filtro (aviso acima de 50, DA16). */
  activeCount: number;
  /**
   * Anos da janela do histórico (desde 2016) sem calendário de pregão publicado: as cotações deles
   * só são carregadas depois da publicação (SPEC-008 §4).
   */
  historyYearsWithoutCalendar: number[];
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
}

export interface CatalogQuery extends AssetSearchQuery {
  status: AssetStatusFilter;
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
});

/** Valida a query string da busca. Setor de outra classe que a filtrada dá `wrong_class`. */
export function validateCatalogQuery(input: unknown): ValidationResult<CatalogQuery> {
  const checked = validate(searchQuerySchema, input);
  if (!checked.success) return checked;
  const { q, class: assetClass, sector, status } = checked.data;
  const mismatch = sectorClassError(assetClass, sector);
  if (mismatch.sector) return { success: false, fields: mismatch };
  return {
    success: true,
    data: {
      q,
      ...(assetClass ? { class: assetClass } : {}),
      ...(sector ? { sector: sector as SectorCode } : {}),
      status: status ?? 'all',
    },
  };
}
