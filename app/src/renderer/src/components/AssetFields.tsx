import {
  ASSET_CLASSES,
  ASSET_SEARCH_TEXT_MAX,
  SECTORS_BY_CLASS,
  type AssetClass,
  type FieldErrorCode,
  type SectorCode,
} from '@simulador/shared';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from './SelectField';

/** Nome traduzido de um setor (ações) ou segmento (FIIs): o servidor só conhece o código. */
export function useSectorName() {
  const { t } = useTranslation();
  return (assetClass: AssetClass, sector: SectorCode) =>
    t(`assets.sectors.${assetClass}.${sector}`);
}

/**
 * Escolha da classe em botões de opção (Ação ou FII), com "Todas" nos filtros. Teclado: setas
 * dentro do grupo, como todo grupo de rádio.
 */
export function ClassChoice({
  legend,
  value,
  onChange,
  withAll = false,
  disabled = false,
  error,
  hint,
}: {
  legend: string;
  value: AssetClass | '';
  onChange: (value: AssetClass | '') => void;
  withAll?: boolean;
  disabled?: boolean;
  error?: FieldErrorCode | undefined;
  hint?: string | undefined;
}) {
  const { t } = useTranslation();
  const name = useId();
  const options: Array<AssetClass | ''> = withAll ? ['', ...ASSET_CLASSES] : [...ASSET_CLASSES];
  const describedBy = [hint ? `${name}-hint` : '', error ? `${name}-error` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <fieldset
      className="class-choice"
      disabled={disabled}
      aria-describedby={describedBy || undefined}
    >
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option || 'all'}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option ? t(`assets.classPlural.${option}`) : t('assets.allClasses')}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${name}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="field-error">
          {t(`fieldErrors.${error}`)}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Setor ou segmento. Com a classe escolhida, só os dela; sem classe (filtros em "Todas"), os dois
 * grupos — e escolher um item escolhe também a classe dele. O valor da lista é "classe:código",
 * porque "outros" existe nas duas classes.
 */
export function SectorSelect({
  label,
  assetClass,
  sector,
  onChange,
  emptyLabel,
  error,
  disabled,
}: {
  label: string;
  assetClass: AssetClass | '';
  sector: SectorCode | '';
  onChange: (assetClass: AssetClass, sector: SectorCode | '') => void;
  /** Texto da opção vazia ("Todos" nos filtros, "Escolha…" no cadastro). */
  emptyLabel: string;
  error?: FieldErrorCode | undefined;
  disabled?: boolean | undefined;
}) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  const option = (cls: AssetClass, code: SectorCode) => (
    <option key={`${cls}:${code}`} value={`${cls}:${code}`}>
      {sectorName(cls, code)}
    </option>
  );

  return (
    <SelectField
      label={label}
      value={assetClass && sector ? `${assetClass}:${sector}` : ''}
      error={error}
      disabled={disabled}
      onChange={(value) => {
        const [cls, code] = value.split(':') as [AssetClass | '', SectorCode | undefined];
        if (cls) onChange(cls, code ?? '');
        else if (assetClass) onChange(assetClass, '');
      }}
    >
      <option value="">{emptyLabel}</option>
      {assetClass
        ? SECTORS_BY_CLASS[assetClass].map((code) => option(assetClass, code))
        : ASSET_CLASSES.map((cls) => (
            <optgroup key={cls} label={t(`assets.classPlural.${cls}`)}>
              {SECTORS_BY_CLASS[cls].map((code) => option(cls, code))}
            </optgroup>
          ))}
    </SelectField>
  );
}

export interface AssetFilterState {
  q: string;
  assetClass: AssetClass | '';
  sector: SectorCode | '';
}

export const EMPTY_FILTERS: AssetFilterState = { q: '', assetClass: '', sector: '' };

export function hasFilters(filters: AssetFilterState): boolean {
  return filters.q.trim() !== '' || filters.assetClass !== '' || filters.sector !== '';
}

/** Filtros → query da API (vazios ficam de fora). */
export function toSearchQuery(filters: AssetFilterState) {
  return {
    q: filters.q.trim(),
    ...(filters.assetClass ? { class: filters.assetClass } : {}),
    ...(filters.sector ? { sector: filters.sector } : {}),
  };
}

/** Campo de busca, classe e setor ou segmento, iguais nas telas do usuário e do colaborador. */
export function AssetFilters({
  value,
  onChange,
  children,
}: {
  value: AssetFilterState;
  onChange: (next: AssetFilterState) => void;
  /** Filtros extras da tela (a situação, na do colaborador). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const searchId = useId();

  return (
    <div className="asset-filters" role="search">
      <div className="field asset-search-field">
        <label htmlFor={searchId}>{t('assets.searchLabel')}</label>
        <div className="search-input">
          <MagnifyingGlass aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={value.q}
            maxLength={ASSET_SEARCH_TEXT_MAX}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${searchId}-hint`}
            onChange={(event) => onChange({ ...value, q: event.target.value })}
          />
        </div>
        <p id={`${searchId}-hint`} className="field-hint">
          {t('assets.searchHint')}
        </p>
      </div>
      <ClassChoice
        legend={t('assets.classFilter')}
        value={value.assetClass}
        withAll
        onChange={(assetClass) =>
          onChange({
            ...value,
            assetClass,
            // O setor escolhido só continua se for da classe nova.
            sector:
              assetClass && value.sector && SECTORS_BY_CLASS[assetClass].includes(value.sector)
                ? value.sector
                : '',
          })
        }
      />
      <div className="asset-filter-selects">
        <SectorSelect
          label={t('assets.sectorFilter')}
          assetClass={value.assetClass}
          sector={value.sector}
          emptyLabel={t('assets.allSectors')}
          onChange={(assetClass, sector) => onChange({ ...value, assetClass, sector })}
        />
        {children}
      </div>
    </div>
  );
}
