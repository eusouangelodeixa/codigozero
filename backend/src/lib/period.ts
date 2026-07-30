/**
 * Report windows (7d / 30d / 12m / custom) + their chart buckets.
 *
 * Centralized because the routes each rolled their own and drifted apart,
 * producing two real reporting bugs:
 *
 * 1. **Total ≠ sum of the plotted days.** The window started at `now − N
 *    days` (a mid-day instant), but the chart only created buckets for the
 *    last N *calendar* days ending today. Every sale in the leading partial
 *    day was counted in the headline revenue and then silently dropped when
 *    bucketing → "Evolução da receita" showed 3271 MT over a chart that only
 *    added up to 2774 (30/07/2026). Windows here are calendar-aligned, so
 *    "30d" means 30 whole days ending today and every transaction inside the
 *    window has a bucket to land in.
 *
 * 2. **Days were cut at the wrong hour.** The server runs in UTC while the
 *    business runs on CAT (Africa/Maputo, UTC+2, no DST), so day boundaries
 *    landed at 02:00 local — a sale at 00:30 in Maputo was drawn on the
 *    previous day, and "hoje" started two hours late. Both the boundaries
 *    and the bucket keys are computed in CAT.
 *
 * Formatting is done by hand (no `toLocale*`) so the labels don't depend on
 * the ICU data that happens to be in the container image.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Africa/Maputo is a fixed UTC+2 — Mozambique has never observed DST. */
const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Civil (CAT) calendar parts of an instant. */
function catParts(d: Date) {
  const t = new Date(d.getTime() + CAT_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth(), day: t.getUTCDate() };
}

/** The instant of 00:00 CAT for a civil date. Overflowing day/month is normalized. */
function catMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - CAT_OFFSET_MS);
}

/** 00:00 CAT of the day `d` falls on. */
export function startOfCatDay(d: Date) {
  const { year, month, day } = catParts(d);
  return catMidnight(year, month, day);
}

/** 23:59:59.999 CAT of the day `d` falls on. */
export function endOfCatDay(d: Date) {
  const { year, month, day } = catParts(d);
  return new Date(catMidnight(year, month, day + 1).getTime() - 1);
}

/** Daily bucket key, e.g. "07/07". */
export function catDayKey(d: Date) {
  const { month, day } = catParts(d);
  return `${pad2(day)}/${pad2(month + 1)}`;
}

/** Monthly bucket key, e.g. "jul/26". */
export function catMonthKey(d: Date) {
  const { year, month } = catParts(d);
  return `${MONTHS_PT[month]}/${pad2(year % 100)}`;
}

export class InvalidPeriodError extends Error {}

export interface ReportWindow {
  period: string;
  startDate: Date;
  endDate: Date;
  /**
   * Window immediately before, for the growth comparison. Same *duration*
   * (not the same calendar days) on purpose: the current window ends "now",
   * so comparing it against 30 finished days would always read negative.
   */
  previousStartDate: Date;
  previousEndDate: Date;
  granularity: 'day' | 'month';
  /** Zero-fill bucket keys, oldest → newest, covering the whole window. */
  buckets: string[];
  /** Which bucket a row's date belongs to. Always one of `buckets` for rows inside the window. */
  bucketOf: (d: Date) => string;
}

/**
 * Resolve `?period=&from=&to=` into a window plus its chart buckets.
 * Throws InvalidPeriodError on a malformed custom range (routes answer 400).
 */
export function resolveWindow(opts: {
  period?: string;
  from?: string;
  to?: string;
  /** Injectable clock — tests only. */
  now?: Date;
}): ReportWindow {
  const now = opts.now ?? new Date();
  const period = opts.period || '30d';

  let startDate: Date;
  let endDate: Date;

  if (period === 'custom') {
    const { from, to } = opts;
    if (!from || !to) throw new InvalidPeriodError('period=custom requer from e to em ISO');
    const s = new Date(from);
    const e = new Date(to);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new InvalidPeriodError('datas inválidas (ISO esperado)');
    }
    // Bare `YYYY-MM-DD` means the whole CAT day, on both ends.
    const isBare = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    startDate = isBare(from) ? startOfCatDay(s) : s;
    endDate = isBare(to) ? endOfCatDay(e) : e;
    if (endDate.getTime() < startDate.getTime()) {
      throw new InvalidPeriodError('intervalo inválido (to anterior a from)');
    }
  } else if (period === 'today') {
    startDate = startOfCatDay(now);
    endDate = now;
  } else if (period === '12m') {
    // 12 month buckets counting the current (partial) month.
    const { year, month } = catParts(now);
    startDate = catMidnight(year, month - 11, 1);
    endDate = now;
  } else {
    // "Nd" = N whole CAT days counting today (7d, 30d, unknown → 30d).
    const nDays = period === '7d' ? 7 : 30;
    startDate = startOfCatDay(new Date(now.getTime() - (nDays - 1) * DAY_MS));
    endDate = now;
  }

  const windowMs = endDate.getTime() - startDate.getTime();
  const spanDays = Math.max(1, Math.ceil(windowMs / DAY_MS));
  const granularity: 'day' | 'month' = period === '12m' || spanDays > 90 ? 'month' : 'day';

  const buckets: string[] = [];
  if (granularity === 'day') {
    const last = startOfCatDay(endDate).getTime();
    for (let t = startOfCatDay(startDate).getTime(); t <= last; t += DAY_MS) {
      buckets.push(catDayKey(new Date(t)));
    }
  } else {
    const first = catParts(startDate);
    const last = catParts(endDate);
    const months = (last.year - first.year) * 12 + (last.month - first.month);
    for (let i = 0; i <= months; i++) {
      buckets.push(catMonthKey(catMidnight(first.year, first.month + i, 1)));
    }
  }

  return {
    period,
    startDate,
    endDate,
    previousStartDate: new Date(startDate.getTime() - windowMs),
    previousEndDate: new Date(startDate),
    granularity,
    buckets,
    bucketOf: granularity === 'day' ? catDayKey : catMonthKey,
  };
}
