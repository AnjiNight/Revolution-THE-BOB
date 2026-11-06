import { FREE_QUOTE_DELAY_MINUTES, type Asset, type AssetSearchQuery } from '@simulador/shared';
import { Info } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../assets.css';
import { useAssetPages } from '../useAssetQuery';
import {
  AssetFilters,
  EMPTY_FILTERS,
  hasFilters,
  ShowMore,
  toSearchQuery,
  useSectorName,
  type AssetFilterState,
} from './AssetFields';
import { AssetLogo } from './AssetLogo';
import { QuoteText } from './QuoteText';

/**
 * Tela "Ativos" do usuário (SPECs 006, 010 e 040, §5.3): busca por ticker ou nome e filtros de
 * classe e de setor ou segmento, só nos ativos ativos do catálogo (OPEN-41). Sem texto, os mais
 * negociados primeiro. O ticker abre a ficha do ativo.
 */
export function AssetSearch({
  onSessionExpired,
  onOpenAsset,
}: {
  onSessionExpired: () => void;
  /** SPEC-010: `opener` recebe o foco de volta quando a ficha fecha. */
  onOpenAsset: (assetId: string, opener: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AssetFilterState>(EMPTY_FILTERS);
  const query: AssetSearchQuery = toSearchQuery(filters);
  const pages = useAssetPages(query, window.api.assets.search, onSessionExpired);
  const { data, error, loading } = pages;
  const filtered = hasFilters(filters);

  return (
    <div className="assets-view">
      <header className="page-hero page-hero-compact">
        <h1>{t('assets.title')}</h1>
        <p className="lead">{t('assets.subtitle')}</p>
      </header>

      <section className="profile-panel assets-panel" aria-label={t('assets.title')}>
        <AssetFilters value={filters} onChange={setFilters} />

        <div className="assets-summary">
          <p role="status">
            {loading && t('assets.searching')}
            {!loading && data && t('assets.resultCount', { count: pages.total })}
          </p>
          {filtered && (
            <button type="button" className="link" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('assets.clear')}
            </button>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {t(`authErrors.${error}`)}
          </p>
        )}

        {data && data.assets.length === 0 && (
          <p className="assets-empty">{filtered ? t('assets.empty') : t('assets.emptyCatalog')}</p>
        )}
        {data && pages.assets.length > 0 && (
          <AssetTable assets={pages.assets} busy={loading} onOpenAsset={onOpenAsset} />
        )}
        {data && <ShowMore pages={pages} />}

        <p className="assets-note">
          <Info weight="fill" aria-hidden="true" />
          <span>
            {t('assets.catalogNote')} {t('assets.quote.note', { delay: FREE_QUOTE_DELAY_MINUTES })}
          </span>
        </p>
      </section>
    </div>
  );
}

/** Logo, ticker e nome, classe, setor ou segmento e o último preço (SPEC-009 e 040). */
function AssetTable({
  assets,
  busy,
  onOpenAsset,
}: {
  assets: Asset[];
  busy: boolean;
  onOpenAsset: (assetId: string, opener: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  return (
    // A linha inteira abre a ficha: o botão do ticker cobre a linha (um botão só no teclado).
    <table className="asset-table is-clickable" aria-label={t('assets.listLabel')} aria-busy={busy}>
      <thead>
        <tr>
          <th scope="col">{t('assets.columns.asset')}</th>
          <th scope="col">{t('assets.columns.class')}</th>
          <th scope="col">{t('assets.columns.sector')}</th>
          <th scope="col" className="wide-only">
            {t('assets.columns.price')}
          </th>
        </tr>
      </thead>
      <tbody>
        {assets.map((asset) => (
          <tr key={asset.id}>
            <td>
              <div className="asset-identity">
                <AssetLogo asset={asset} />
                <div className="asset-identity-text">
                  <button
                    type="button"
                    className="link asset-open asset-ticker"
                    aria-label={t('detail.openLabel', { ticker: asset.ticker })}
                    onClick={(event) => onOpenAsset(asset.id, event.currentTarget)}
                  >
                    {asset.ticker}
                  </button>
                  <span className="asset-name">{asset.name}</span>
                  {/* Janela estreita: o preço vai para baixo do nome. */}
                  <span className="narrow-only quote-narrow">
                    <QuoteText quote={asset.quote} />
                  </span>
                </div>
              </div>
            </td>
            <td>
              <span className={`class-badge class-${asset.class}`}>
                {t(`assets.class.${asset.class}`)}
              </span>
            </td>
            <td>{sectorName(asset.class, asset.sector)}</td>
            <td className="wide-only">
              <QuoteText quote={asset.quote} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
