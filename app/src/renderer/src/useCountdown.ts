import { useEffect, useState } from 'react';

/**
 * Contagem regressiva em segundos, para liberar "Reenviar código" (SPEC-004, SPEC-039).
 * Devolve quanto falta e a função que recomeça a contagem.
 */
export function useCountdown(initialSeconds = 0): [number, (seconds: number) => void] {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return [seconds, setSeconds];
}
