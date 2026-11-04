/** "52.710000" → "52.71": o mesmo número do `NUMERIC` do PostgreSQL, sem zeros sobrando. */
export function normalize(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

export function decimal(value: string | null): string | null {
  return value === null ? null : normalize(value);
}
