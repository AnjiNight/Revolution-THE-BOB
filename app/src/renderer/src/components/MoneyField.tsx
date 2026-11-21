import type { FieldErrorCode } from '@simulador/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { amountFromDigits, formatAmountInput } from '../format';

interface MoneyFieldProps {
  label: string;
  /** Decimal da API ("1234.56"), ou vazio. */
  value: string;
  onChange: (amount: string) => void;
  error?: FieldErrorCode | undefined;
  /** Mensagem pronta no lugar da de `fieldErrors` (saldo disponível). */
  errorText?: string | undefined;
  hint?: string;
  autoFocus?: boolean;
}

/**
 * Valor em reais como nos apps de banco e de corretora (SPEC-013): "R$" fixo na frente e os dígitos
 * enchendo o valor a partir dos centavos, já com o ponto do milhar e a vírgula ("1.234,56" em
 * português, "1,234.56" em inglês). Teclado numérico; quem usa o campo recebe sempre o decimal da
 * API.
 */
export function MoneyField({
  label,
  value,
  onChange,
  error,
  errorText,
  hint,
  autoFocus,
}: MoneyFieldProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const message = errorText ?? (error ? t(`fieldErrors.${error}`) : undefined);
  const describedBy = [hint ? `${id}-hint` : '', message ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  const shown = formatAmountInput(value, i18n.language);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <span className="money-prefix" aria-hidden="true">
          R$
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          placeholder={formatAmountInput('0.00', i18n.language)}
          autoFocus={autoFocus}
          onChange={(event) => onChange(amountFromDigits(event.target.value))}
          // O cursor fica sempre no fim: o valor cresce e encolhe pela direita, como no banco.
          onFocus={(event) => {
            const input = event.currentTarget;
            requestAnimationFrame(() =>
              input.setSelectionRange(input.value.length, input.value.length),
            );
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${id}-error`} className="field-error">
          {message}
        </p>
      )}
    </div>
  );
}
