/**
 * Janela de atendimento do Suporte — horário COMERCIAL BRASILEIRO.
 *
 * Atenção ao fuso: o resto da plataforma raciocina em CAT (Moçambique, UTC+2 —
 * ver `lib/period.ts`), mas o atendimento segue o horário de Brasília, que é
 * UTC-3 e não tem horário de verão desde 2019. Por isso o offset é fixo aqui em
 * vez de reaproveitar o helper de CAT.
 *
 * Como no resto do backend, o cálculo é feito deslocando o instante e lendo os
 * campos `getUTC*` — nada de `toLocaleString` com timezone, que depende do ICU
 * estar presente no container.
 */

/** America/Sao_Paulo = UTC-3 o ano inteiro (sem DST desde 2019). */
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

export type SupportWindow = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  rearmHours: number;
};

export const DEFAULT_SUPPORT_WINDOW: SupportWindow = {
  enabled: true,
  startHour: 8,
  endHour: 18,
  rearmHours: 4,
};

/** Lê a configuração da janela a partir da linha (parcial) de SystemConfig. */
export function windowFromConfig(cfg: {
  supportHoursEnabled?: boolean | null;
  supportStartHour?: number | null;
  supportEndHour?: number | null;
  supportRearmHours?: number | null;
} | null | undefined): SupportWindow {
  const clampHour = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : fallback;
  };
  return {
    enabled: cfg?.supportHoursEnabled !== false,
    startHour: clampHour(cfg?.supportStartHour, DEFAULT_SUPPORT_WINDOW.startHour),
    endHour: clampHour(cfg?.supportEndHour, DEFAULT_SUPPORT_WINDOW.endHour),
    rearmHours: (() => {
      const n = Number(cfg?.supportRearmHours);
      return Number.isFinite(n) && n >= 1 && n <= 72 ? Math.floor(n) : DEFAULT_SUPPORT_WINDOW.rearmHours;
    })(),
  };
}

/** Partes civis (Brasília) de um instante. */
function brtParts(d: Date) {
  const shifted = new Date(d.getTime() + BRT_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(), // 0=domingo … 6=sábado
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** Instante UTC correspondente a uma hora civil de Brasília. */
function brtInstant(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour, 0, 0, 0) - BRT_OFFSET_MS);
}

/** Segunda a sexta, dentro de [startHour, endHour). */
export function isWithinSupportHours(now: Date, win: SupportWindow): boolean {
  if (!win.enabled) return true; // janela desligada = atendimento sempre aberto
  const { weekday, hour } = brtParts(now);
  const isWeekday = weekday >= 1 && weekday <= 5;
  return isWeekday && hour >= win.startHour && hour < win.endHour;
}

/**
 * Próximo instante em que o suporte reabre. Se já estiver aberto, devolve
 * `now`. Procura no máximo 8 dias à frente (cobre fim-de-semana + folga).
 */
export function nextSupportOpening(now: Date, win: SupportWindow): Date {
  if (!win.enabled || isWithinSupportHours(now, win)) return now;

  const p = brtParts(now);
  for (let addDays = 0; addDays <= 8; addDays++) {
    const candidateDay = brtInstant(p.year, p.month, p.day + addDays, win.startHour);
    const cp = brtParts(candidateDay);
    const isWeekday = cp.weekday >= 1 && cp.weekday <= 5;
    if (isWeekday && candidateDay.getTime() > now.getTime()) return candidateDay;
  }
  return now;
}

const DAY_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "Seg a Sex, 08h–18h (horário de Brasília)" */
export function describeSupportWindow(win: SupportWindow): string {
  const pad = (h: number) => String(h).padStart(2, '0');
  return `Seg a Sex, ${pad(win.startHour)}h–${pad(win.endHour)}h (horário de Brasília)`;
}

/** "segunda às 08h" — para dizer ao aluno quando voltamos. */
export function describeNextOpening(now: Date, win: SupportWindow): string {
  const at = nextSupportOpening(now, win);
  if (at.getTime() <= now.getTime()) return 'agora';
  const p = brtParts(at);
  const nowP = brtParts(now);
  const sameDay = p.year === nowP.year && p.month === nowP.month && p.day === nowP.day;
  const pad = (h: number) => String(h).padStart(2, '0');
  return sameDay
    ? `hoje às ${pad(p.hour)}h`
    : `${DAY_LABELS[p.weekday]} às ${pad(p.hour)}h`;
}
