import type {
  Asset,
  AssetClass,
  AssetOrigin,
  AssetQuote,
  CatalogAsset,
  SectorCode,
} from '@simulador/shared';

/** Ativo do catálogo como fica guardado (SPEC-006 e 040, §6). */
export interface StoredAsset {
  id: string;
  ticker: string;
  name: string;
  /** Nunca muda depois do cadastro (RB22). */
  assetClass: AssetClass;
  sector: SectorCode;
  createdAt: Date;
  updatedAt: Date;
  /** `null`: o ativo está ativo. */
  deactivatedAt: Date | null;
  /** SPEC-040: cadastrado pela equipe ou pela importação diária. */
  origin: AssetOrigin;
  /** Quando a equipe conferiu a classificação; `null` no importado ainda a revisar. */
  classificationReviewedAt: Date | null;
  /** O processador desativou (sem negócio na B3 há 3 meses). */
  autoDeactivated: boolean;
}

export function isActive(asset: StoredAsset): boolean {
  return asset.deactivatedAt === null;
}

export function isClassificationPending(asset: StoredAsset): boolean {
  return asset.classificationReviewedAt === null;
}

/** O que o usuário vê na busca, com a última cotação do pregão (SPEC-009), se houver. */
export function toPublicAsset(
  asset: StoredAsset,
  quote: AssetQuote | null = null,
  hasLogo = false,
): Asset {
  return {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    class: asset.assetClass,
    sector: asset.sector,
    quote,
    hasLogo,
  };
}

/** O que o colaborador vê no catálogo. */
export function toCatalogAsset(
  asset: StoredAsset,
  quote: AssetQuote | null = null,
  hasLogo = false,
): CatalogAsset {
  return {
    ...toPublicAsset(asset, quote, hasLogo),
    active: isActive(asset),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deactivatedAt: asset.deactivatedAt?.toISOString() ?? null,
    origin: asset.origin,
    classificationPending: isClassificationPending(asset),
    autoDeactivated: asset.autoDeactivated,
  };
}
