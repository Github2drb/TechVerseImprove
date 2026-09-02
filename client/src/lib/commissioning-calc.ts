// client/src/lib/commissioning-calc.ts
// Shared forecast + rating maths for the Project Commissioning tracker.
// The identical formula is mirrored server-side in server/routes.ts
// (/api/commissioning-performance) so the page and the Skill Matrix always agree.
//
// WORK WEEK: Monday–Saturday (6 days). Sundays are skipped.

export const WORK_WEEK_DAYS = 6;              // Mon–Sat
export const DAYS_PER_WEEK_UNIT = 6;          // "1 week"  = 6 working days
export const DAYS_PER_MONTH_UNIT = 26;        // "1 month" = 26 working days
export const HOURS_PER_DAY = 8;
export const DEFAULT_STATION_DAYS = 1;        // assumed when a pending row has no estimate
export const LATE_PENALTY_PER_DAY = 5;        // each working day late costs 5 points

// Rating component weights (renormalised when a component is unavailable)
export const WEIGHTS = {
  internal: 0.30,
  customer: 0.30,
  stations: 0.25,
  checklist: 0.15,
};

// ── Date helpers ────────────────────────────────────────────────────────────
export function startOfDay(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isWorkingDay(d: Date): boolean {
  return d.getDay() !== 0; // 0 = Sunday
}

/** Add N working days (Mon–Sat) to a date. */
export function addWorkingDays(from: Date, n: number): Date {
  const d = startOfDay(from);
  let remaining = Math.max(0, Math.ceil(n));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

/** Working days from `a` to `b`. Positive if b is after a, negative if before. */
export function workingDaysBetween(a: Date, b: Date): number {
  const start = startOfDay(a);
  const end = startOfDay(b);
  if (start.getTime() === end.getTime()) return 0;
  const forward = end > start;
  const from = forward ? start : end;
  const to = forward ? end : start;
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    if (isWorkingDay(cur)) count++;
  }
  return forward ? count : -count;
}

export function toISODate(d: Date): string {
  const x = startOfDay(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? startOfDay(d) : d;
  if (isNaN(x.getTime())) return "—";
  return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── "Time to Trials" parser ─────────────────────────────────────────────────
// Accepts free text the engineer actually types:
//   "2"  "2 days"  "2d"  "1.5 day"  "3 weeks"  "1 month"  "16 hrs"
//   or an absolute date: "2026-09-14", "14/09/2026", "14-09-2026"
// Returns working days from `today`, or null when nothing usable was entered.
export function parseTrialDays(raw: string | undefined | null, today: Date = new Date()): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // ISO date  YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const target = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(target.getTime())) return Math.max(0, workingDaysBetween(today, target));
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const target = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(target.getTime())) return Math.max(0, workingDaysBetween(today, target));
  }

  // Number + optional unit
  const num = s.match(/(\d+(?:\.\d+)?)/);
  if (!num) return null;
  const value = parseFloat(num[1]);
  if (!isFinite(value) || value < 0) return null;
  const lower = s.toLowerCase();

  if (/\b(hour|hours|hr|hrs)\b/.test(lower) || /\d\s*h\b/.test(lower)) {
    return Math.ceil(value / HOURS_PER_DAY);
  }
  if (/\b(month|months|mon|mo)\b/.test(lower)) return Math.ceil(value * DAYS_PER_MONTH_UNIT);
  if (/\b(week|weeks|wk|wks)\b/.test(lower) || /\d\s*w\b/.test(lower)) {
    return Math.ceil(value * DAYS_PER_WEEK_UNIT);
  }
  // default unit is days ("2", "2 days", "2d")
  return Math.ceil(value);
}

// ── Shapes (structurally compatible with the page's own types) ──────────────
export interface CalcRow {
  status: string;
  trialTime?: string;
  electricalConstraint?: string;
  mechanicalConstraint?: string;
}
export interface CalcPhase {
  items: Array<{ done: boolean }>;
}

export interface ForecastResult {
  totalRows: number;
  pendingRows: number;
  completedRows: number;
  totalPendingDays: number;
  missingEstimates: number;
  engineerCount: number;
  effectiveDays: number;
  forecastDate: Date | null;
  stationProgress: number;      // 0–100
  checklistProgress: number;    // 0–100
  checklistDone: number;
  checklistTotal: number;
  constrainedRows: number;
}

/** Days of work still outstanding, and the projected completion date. */
export function computeForecast(
  rows: CalcRow[],
  phases: CalcPhase[],
  engineerCount: number,
  today: Date = new Date()
): ForecastResult {
  const base = startOfDay(today);
  const totalRows = rows.length;
  const completedRows = rows.filter(r => r.status === "completed").length;
  const pending = rows.filter(r => r.status !== "completed");

  let totalPendingDays = 0;
  let missingEstimates = 0;
  for (const r of pending) {
    const d = parseTrialDays(r.trialTime, base);
    if (d === null) {
      missingEstimates++;
      totalPendingDays += DEFAULT_STATION_DAYS;
    } else {
      totalPendingDays += d;
    }
  }

  const engineers = Math.max(1, engineerCount || 1);
  const effectiveDays = Math.ceil(totalPendingDays / engineers);
  const forecastDate = totalRows > 0 ? addWorkingDays(base, effectiveDays) : null;

  const checklistTotal = phases.reduce((n, p) => n + p.items.length, 0);
  const checklistDone = phases.reduce((n, p) => n + p.items.filter(i => i.done).length, 0);

  const constrainedRows = rows.filter(
    r => (r.electricalConstraint ?? "").trim() !== "" || (r.mechanicalConstraint ?? "").trim() !== ""
  ).length;

  return {
    totalRows,
    pendingRows: pending.length,
    completedRows,
    totalPendingDays,
    missingEstimates,
    engineerCount: engineers,
    effectiveDays,
    forecastDate,
    stationProgress: totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0,
    checklistProgress: checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0,
    checklistDone,
    checklistTotal,
    constrainedRows,
  };
}

// ── Rating ──────────────────────────────────────────────────────────────────
export interface ScheduleComponent {
  target: string | null;
  varianceDays: number | null;   // + = late, − = early
  score: number | null;          // null when no target date is set
}

export interface RatingResult {
  internal: ScheduleComponent;
  customer: ScheduleComponent;
  stationScore: number;
  checklistScore: number;
  overall: number;
  level: string;
  levelKey: "expert" | "proficient" | "developing" | "learning";
  components: Array<{ key: string; label: string; score: number; weight: number }>;
}

/** On time or early = 100. Each working day late costs LATE_PENALTY_PER_DAY points. */
export function scheduleScore(forecast: Date | null, target: string | null | undefined): ScheduleComponent {
  const t = (target ?? "").trim();
  if (!t || !forecast) return { target: t || null, varianceDays: null, score: null };
  const targetDate = startOfDay(t);
  if (isNaN(targetDate.getTime())) return { target: null, varianceDays: null, score: null };
  const variance = workingDaysBetween(targetDate, forecast); // + = forecast after target = late
  const score = variance <= 0 ? 100 : Math.max(0, 100 - variance * LATE_PENALTY_PER_DAY);
  return { target: t, varianceDays: variance, score };
}

export function levelFor(score: number): { level: string; levelKey: RatingResult["levelKey"] } {
  if (score >= 90) return { level: "Expert", levelKey: "expert" };
  if (score >= 75) return { level: "Proficient", levelKey: "proficient" };
  if (score >= 50) return { level: "Developing", levelKey: "developing" };
  return { level: "Learning", levelKey: "learning" };
}

export function computeRating(
  forecast: ForecastResult,
  internalTarget: string | null | undefined,
  customerTarget: string | null | undefined
): RatingResult {
  const internal = scheduleScore(forecast.forecastDate, internalTarget);
  const customer = scheduleScore(forecast.forecastDate, customerTarget);
  const stationScore = forecast.stationProgress;
  const checklistScore = forecast.checklistProgress;

  const parts: Array<{ key: string; label: string; score: number; weight: number }> = [];
  if (internal.score !== null) parts.push({ key: "internal", label: "Internal Target", score: internal.score, weight: WEIGHTS.internal });
  if (customer.score !== null) parts.push({ key: "customer", label: "Customer Target", score: customer.score, weight: WEIGHTS.customer });
  parts.push({ key: "stations", label: "Station Progress", score: stationScore, weight: WEIGHTS.stations });
  parts.push({ key: "checklist", label: "Checklist", score: checklistScore, weight: WEIGHTS.checklist });

  const totalWeight = parts.reduce((n, p) => n + p.weight, 0);
  const overall = totalWeight > 0
    ? Math.round(parts.reduce((n, p) => n + p.score * p.weight, 0) / totalWeight)
    : 0;
  const { level, levelKey } = levelFor(overall);

  return { internal, customer, stationScore, checklistScore, overall, level, levelKey, components: parts };
}

// ── Engineer name helpers (mirrors the app-wide fuzzy matcher) ──────────────
export function normName(s: string): string {
  return s.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
}
export function namesMatch(a: string, b: string): boolean {
  const na = normName(a); const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (nb.startsWith(na) || na.startsWith(nb)) return true;
  return na.split(/\s+/)[0] === nb.split(/\s+/)[0];
}
export function splitEngineers(field: string | undefined | null): string[] {
  return (field ?? "").split(",").map(n => n.trim()).filter(Boolean);
}
