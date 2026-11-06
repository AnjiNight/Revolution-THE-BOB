import type { FieldErrorCode } from '@simulador/shared';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** As `<option>` (e `<optgroup>`) da lista. */
  children: ReactNode;
  error?: FieldErrorCode | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
}

/** Lista de opções com rótulo, dica e erro ligados por acessibilidade, como o TextField (RNF18). */
export function SelectField({
  label,
  value,
  onChange,
  children,
  error,
  hint,
  disabled,
}: SelectFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </select>
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
