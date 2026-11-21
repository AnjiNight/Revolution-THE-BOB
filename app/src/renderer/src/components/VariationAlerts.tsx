import { FREE_QUOTE_DELAY_MINUTES } from '@simulador/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isThreshold,
  readVariationSettings,
  saveVariationSettings,
  VARIATION_THRESHOLDS,
  type VariationSettings,
} from '../variation';
import { SelectField } from './SelectField';

/**
 * SPEC-033: a seção Avisos de variação de Meu perfil, só para a conta de usuário. A escolha vale na
 * hora, sem botão de salvar, e fica neste computador para cada conta; a próxima conferência já usa
 * o que foi escolhido.
 */
export function VariationAlerts({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const checkboxId = useId();
  const hintId = useId();
  const [settings, setSettings] = useState(() => readVariationSettings(userId));

  const change = (next: VariationSettings) => {
    setSettings(next);
    saveVariationSettings(userId, next);
  };
  const percent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });

  return (
    <section className="profile-panel" aria-labelledby="alerts-title">
      <h2 id="alerts-title">{t('alerts.settings.title')}</h2>
      <div className="alerts-settings">
        <div className="checkbox">
          <input
            id={checkboxId}
            type="checkbox"
            checked={settings.enabled}
            aria-describedby={hintId}
            onChange={(event) => change({ ...settings, enabled: event.target.checked })}
          />
          <label htmlFor={checkboxId}>{t('alerts.settings.enabled')}</label>
        </div>
        <SelectField
          label={t('alerts.settings.threshold')}
          value={String(settings.threshold)}
          disabled={!settings.enabled}
          onChange={(value) => {
            const threshold = Number(value);
            if (isThreshold(threshold)) change({ ...settings, threshold });
          }}
        >
          {VARIATION_THRESHOLDS.map((threshold) => (
            <option key={threshold} value={threshold}>
              {t(`alerts.settings.levels.${threshold}`, {
                percent: percent.format(threshold / 100),
              })}
            </option>
          ))}
        </SelectField>
      </div>
      <p id={hintId} className="field-hint">
        {t('alerts.settings.hint', { delay: FREE_QUOTE_DELAY_MINUTES })}
      </p>
    </section>
  );
}
