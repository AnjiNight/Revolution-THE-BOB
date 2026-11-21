import { SESSION } from './trading-session.js';

/**
 * Regra do intervalo (SPEC-009 §4.2, decisão 2): reparte a cota que sobra entre os ativos e as
 * coletas que faltam no ciclo, para ela nunca acabar. Puro: recebe os números, não sabe de banco.
 */
export interface QuotaPlanInput {
  /** Ativos ativos do catálogo: cada coleta gasta uma consulta por ativo. */
  assets: number;
  /** Consultas que ainda podem ser usadas no ciclo, já sem a reserva. */
  available: number;
  /** Coletas de cada dia de pregão que falta no ciclo, a começar por hoje (o total do dia). */
  slotsPerDay: number[];
  /** Coleta da vez, contada a partir de 0 entre as de hoje. */
  slotIndex: number;
  /** Coletas já feitas hoje (para o plano do dia não mudar enquanto o dia anda). */
  doneToday: number;
}

export interface QuotaDecision {
  run: boolean;
  /** Coletas por dia que a cota permite hoje (no máximo todas). */
  perDay: number;
  /** Intervalo aproximado entre as coletas de hoje, em minutos (30 no mínimo). */
  intervalMinutes: number;
}

export function planCollection(input: QuotaPlanInput): QuotaDecision {
  const todaySlots = input.slotsPerDay[0] ?? 0;
  const all = { run: true, perDay: todaySlots, intervalMinutes: SESSION.slotMinutes };
  if (input.assets <= 0 || todaySlots === 0) return { ...all, run: false };

  const capacity = Math.floor(Math.max(0, input.available) / input.assets);
  const remainingSlots =
    todaySlots - input.slotIndex + input.slotsPerDay.slice(1).reduce((sum, n) => sum + n, 0);
  if (capacity >= remainingSlots) return all;

  const days = input.slotsPerDay.length;
  // O plano do dia conta com as coletas de hoje que já foram feitas: fica estável o dia todo.
  const perDay = Math.min(todaySlots, Math.floor((capacity + input.doneToday) / days));
  const last = todaySlots - 1;
  if (perDay < 1) {
    // Nem uma coleta por dia: só a do fechamento, enquanto houver cota.
    return {
      run: capacity >= 1 && input.slotIndex === last,
      perDay: capacity >= 1 ? 1 : 0,
      intervalMinutes: last * SESSION.slotMinutes,
    };
  }
  if (perDay === 1) {
    return {
      run: input.slotIndex === last,
      perDay,
      intervalMinutes: last * SESSION.slotMinutes,
    };
  }
  // `perDay` coletas espaçadas por igual, sempre com a do fechamento.
  const step = last / (perDay - 1);
  const chosen = new Set<number>();
  for (let j = 0; j < perDay; j += 1) chosen.add(last - Math.round(j * step));
  return {
    run: chosen.has(input.slotIndex),
    perDay,
    intervalMinutes: Math.max(
      SESSION.slotMinutes,
      Math.round((step * SESSION.slotMinutes) / 5) * 5,
    ),
  };
}
