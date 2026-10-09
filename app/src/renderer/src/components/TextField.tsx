import type { FieldErrorCode } from '@simulador/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

interface TextFieldProps {
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: FieldErrorCode | undefined;
  hint?: string;
}

/** Campo com rótulo, dica e mensagem de erro ligados por acessibilidade (RNF18). */
export function TextField({
  label,
  type,
  value,
  onChange,
  autoComplete,
  error,
  hint,
}: TextFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {t(`fieldErrors.${error}`)}
        </p>
      )}
    </div>
  );
}
