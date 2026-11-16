import type {
  AllocationClass,
  AllocationSector,
  PortfolioAllocation as AllocationData,
} from '@simulador/shared';
import { CaretDown, Warning } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../format';

/** % com 2 casas, sem sinal: "38,79%". */
export function formatShare(percent: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(percent) / 100);
}

/**
 * Distribuição da carteira (SPEC-021 §4.2): a barra das classes (Ações, FIIs e Caixa) e, em cada
 * classe, os setores ou segmentos, que abrem os ativos. Cada barra tem o texto ao lado: a barra é
 * só desenho (o leitor de tela lê o texto).
 */
export function PortfolioAllocation({ allocation }: { allocation: AllocationData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  if (allocation.classes.length === 0) return null;
  const invested = allocation.classes.filter((item) => item.sectors);

  return (
    <section className="profile-panel allocation-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('portfolios.allocation.title')}</h2>
      <div className="allocation-bar" aria-hidden="true">
        {allocation.classes.map((item) => (
          <span
            key={item.kind}
            className={`allocation-segment is-${item.kind}`}
            style={{ width: `${item.percent}%` }}
          />
        ))}
      </div>
      <ul className="allocation-classes">
        {allocation.classes.map((item) => (
          <li key={item.kind}>
            <span className={`allocation-swatch is-${item.kind}`} aria-hidden="true" />
            <strong>{t(`portfolios.allocation.classes.${item.kind}`)}</strong>
            <span>{formatShare(item.percent, language)}</span>
            <span className="allocation-muted">{formatMoney(item.value, language)}</span>
          </li>
        ))}
      </ul>

      {allocation.negativeCash && (
        <p className="assets-note is-warning">
          <Warning weight="fill" aria-hidden="true" />
          <span>
            {t('portfolios.allocation.negativeCash', {
              amount: formatMoney(allocation.negativeCash, language),
            })}
          </span>
        </p>
      )}
      {allocation.atCost.length > 0 && (
        <p className="assets-note is-warning">
          <Warning weight="fill" aria-hidden="true" />
          <span>
            {t('portfolios.allocation.atCost', {
              tickers: new Intl.ListFormat(language, { type: 'conjunction' }).format(
                allocation.atCost,
              ),
              count: allocation.atCost.length,
            })}
          </span>
        </p>
      )}
      {invested.length === 0 && <p className="assets-empty">{t('portfolios.allocation.empty')}</p>}

      {invested.length > 0 && (
        <div className="allocation-groups">
          {invested.map((item) => (
            <ClassSectors key={item.kind} item={item} />
          ))}
        </div>
      )}
      <p className="field-hint">{t('portfolios.allocation.note')}</p>
    </section>
  );
}

function ClassSectors({ item }: { item: AllocationClass }) {
  const { t } = useTranslation();
  const headingId = useId();
  const assetClass = item.kind === 'fii' ? 'fii' : 'stock';
  return (
    <div className="allocation-group">
      <h3 id={headingId}>{t(`portfolios.allocation.byClass.${assetClass}`)}</h3>
      <ul className="allocation-sectors" aria-labelledby={headingId}>
        {(item.sectors ?? []).map((sector) => (
          <SectorRow key={sector.sector} sector={sector} assetClass={assetClass} />
        ))}
      </ul>
    </div>
  );
}

/** Um setor: o botão abre os ativos dele (`aria-expanded`). */
function SectorRow({
  sector,
  assetClass,
}: {
  sector: AllocationSector;
  assetClass: 'stock' | 'fii';
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const listId = useId();
  const [open, setOpen] = useState(false);
  return (
    <li className="allocation-sector">
      <button
        type="button"
        className="allocation-sector-button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="allocation-sector-head">
          <span className="allocation-sector-name">
            {t(`assets.sectors.${assetClass}.${sector.sector}`)}
          </span>
          <span className="allocation-sector-value">{formatMoney(sector.value, language)}</span>
          <CaretDown className="allocation-caret" aria-hidden="true" />
        </span>
        <span className="allocation-sector-bar" aria-hidden="true">
          <span style={{ width: `${sector.percentOfClass}%` }} />
        </span>
        <span className="allocation-muted">
          {t(`portfolios.allocation.shares.${assetClass}`, {
            ofClass: formatShare(sector.percentOfClass, language),
            ofTotal: formatShare(sector.percent, language),
          })}
        </span>
      </button>
      {open && (
        <ul id={listId} className="allocation-assets">
          {sector.assets.map((asset) => (
            <li key={asset.assetId}>
              <span className="allocation-ticker">{asset.ticker}</span>
              <span>{formatMoney(asset.value, language)}</span>
              <span className="allocation-muted">
                {t('portfolios.allocation.assetShare', {
                  share: formatShare(asset.percent, language),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
