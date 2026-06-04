// ProjectStatusDashboard.tsx
// Place at: client/src/components/ProjectStatusDashboard.tsx
//
// Requires SheetJS. If not already installed, run:
//   npm install xlsx
// Then import in analytics.tsx:
//   import { ProjectStatusDashboard } from "@/components/ProjectStatusDashboard";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";

// ── Config ────────────────────────────────────────────────────────────────────
// Uses GitHub Contents API — always returns fresh content, bypasses CDN cache.
// raw.githubusercontent.com caches for 5+ min and ignores cache-bust params.
const GITHUB_API_URL =
  "https://api.github.com/repos/Github2drb/TechVerseImprove/contents/Project%20Status_May_Sept_2026.xlsx";

// ── Symbol map (as they appear in the Excel file) ─────────────────────────────
const SYM_COMPLETED   = "\u00fc"; // ü
const SYM_NOT_STARTED = "\u00fb"; // û
const SYM_IN_PROGRESS = "y";
const SYM_NA          = "\u2260"; // ≠

type StatusSym = "ü" | "û" | "y" | "≠" | "";

const STATUS_META: Record<string, { label: string; badge: string; bg: string; text: string; weight: number }> = {
  [SYM_COMPLETED]:   { label:"Completed",        badge:"✓", bg:"bg-green-100 dark:bg-green-950",   text:"text-green-700 dark:text-green-400",  weight:1   },
  [SYM_NOT_STARTED]: { label:"Not Started",       badge:"✗", bg:"bg-red-50 dark:bg-red-950/60",     text:"text-red-400 dark:text-red-500",      weight:0   },
  [SYM_IN_PROGRESS]: { label:"In Progress",       badge:"◑", bg:"bg-blue-100 dark:bg-blue-950",     text:"text-blue-700 dark:text-blue-300",    weight:0.5 },
  [SYM_NA]:          { label:"Not Applicable",    badge:"–", bg:"bg-gray-100 dark:bg-gray-800",     text:"text-gray-400 dark:text-gray-500",    weight:-1  },
  "":                { label:"—",                 badge:"·", bg:"bg-muted/30",                       text:"text-muted-foreground/30",            weight:0   },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectRow {
  no:       number;
  name:     string;
  engineer: string;
  statuses: string[]; // one per phase column
}

interface SheetData {
  phases:   string[];
  projects: ProjectRow[];
}

// ── Parse raw sheet rows into structured data ──────────────────────────────────
function parseSheet(rows: any[][]): SheetData {
  // Row index 1 = headers (0-indexed)
  const headerRow: any[] = rows[1] ?? [];
  // Phase columns start at index 3 (after #, Project, Engineer)
  const phases: string[] = [];
  for (let c = 3; c < headerRow.length; c++) {
    if (headerRow[c]) phases.push(String(headerRow[c]).trim());
  }

  const projects: ProjectRow[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[1]) continue; // skip empty rows
    const statuses: string[] = [];
    for (let c = 3; c < 3 + phases.length; c++) {
      statuses.push(row[c] ? String(row[c]).trim() : "");
    }
    projects.push({
      no:       typeof row[0] === "number" ? row[0] : r - 1,
      name:     String(row[1] ?? "").trim(),
      engineer: String(row[2] ?? "—").trim(),
      statuses,
    });
  }
  return { phases, projects };
}

// ── Completion % per project ──────────────────────────────────────────────────
function calcPct(statuses: string[]): number {
  let done = 0, total = 0;
  for (const s of statuses) {
    if (s === SYM_NA || s === "") continue;
    total++;
    const m = STATUS_META[s];
    if (m) done += m.weight;
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusCell({ sym }: { sym: string }) {
  const m = STATUS_META[sym] ?? STATUS_META[""];
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded text-sm font-bold ${m.bg} ${m.text}`}
      title={m.label}
    >
      {m.badge}
    </span>
  );
}

function CompletionBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-green-500" :
    pct >= 60 ? "bg-blue-500"  :
    pct >= 30 ? "bg-amber-500" : "bg-red-400";
  const textColor =
    pct >= 90 ? "text-green-600 dark:text-green-400" :
    pct >= 60 ? "text-blue-600 dark:text-blue-400"   :
    pct >= 30 ? "text-amber-600 dark:text-amber-400"  : "text-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums min-w-[34px] text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProjectStatusDashboard() {
  const [data,    setData]    = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use GitHub Contents API — always returns fresh file, no CDN caching.
      // raw.githubusercontent.com caches for 5+ min even with cache-bust params.
      const apiRes = await fetch(GITHUB_API_URL, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });
      if (!apiRes.ok) throw new Error(`GitHub API HTTP ${apiRes.status}`);
      const meta = await apiRes.json();

      // Decode base64 → binary Uint8Array for SheetJS
      const b64    = (meta.content as string).replace(/\n/g, "");
      const binary = atob(b64);
      const buf    = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

      // Parse with SheetJS
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      setData(parseSheet(rows));
      setLastRefresh(
        new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch (e: any) {
      setError("Could not load Excel file: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on every page mount
  useEffect(() => { loadData(); }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
          <p className="text-muted-foreground text-sm mt-1">May – Sept 2026 · Controls Engineering</p>
        </div>
      </div>
      <div className="flex items-center gap-3 py-12 justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        <span className="text-muted-foreground text-sm">Loading Excel data from GitHub…</span>
      </div>
    </div>
  );

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
      <div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm flex items-center justify-between">
        <span>⚠ {error}</span>
        <button onClick={loadData} className="text-xs underline ml-4">Retry</button>
      </div>
    </div>
  );

  const { phases, projects } = data;
  const totals    = projects.map(p => calcPct(p.statuses));
  const fullDone  = projects.filter((_, i) => totals[i] === 100).length;
  const inProg    = projects.filter((_, i) => totals[i] > 0 && totals[i] < 100).length;
  const avgPct    = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
          <p className="text-muted-foreground text-sm mt-1">
            May – Sept 2026 · Controls Engineering
            {lastRefresh && <span className="ml-2 text-xs">· Updated {lastRefresh}</span>}
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
        >
          ↻ Refresh from Excel
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:"Total Projects",   value:projects.length, color:"text-foreground",                        sub:"All tracked" },
          { label:"Completed",        value:fullDone,         color:"text-green-600 dark:text-green-400",     sub:"100% done" },
          { label:"In Progress",      value:inProg,           color:"text-blue-600 dark:text-blue-400",       sub:"Partially done" },
          { label:"Overall Progress", value:`${avgPct}%`,     color:"text-amber-600 dark:text-amber-400",     sub:"Average completion" },
        ].map(c => (
          <div key={c.label} className="border rounded-xl p-4 bg-card">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-3 items-center text-xs font-medium">
        <span className="text-muted-foreground">Legend:</span>
        {[SYM_COMPLETED, SYM_IN_PROGRESS, SYM_NOT_STARTED, SYM_NA].map(sym => {
          const m = STATUS_META[sym];
          return (
            <span key={sym} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${m.bg} ${m.text}`}>
              <span className="font-bold">{m.badge}</span>{m.label}
            </span>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div className="border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full border-collapse text-xs" style={{ minWidth: `${300 + phases.length * 72}px` }}>
          <thead>
            <tr className="border-b bg-muted">
              <th className="sticky left-0 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground w-10">#</th>
              <th className="sticky left-10 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground min-w-[240px]">Project</th>
              <th className="border-r px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">Engineer</th>
              {phases.map(p => (
                <th key={p} className="border-r px-2 py-3 text-center font-semibold text-muted-foreground min-w-[68px]">
                  <span
                    className="block leading-tight whitespace-nowrap"
                    style={{ writingMode:"vertical-lr", transform:"rotate(180deg)", height:"88px" }}
                  >
                    {p}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[130px]">Completion</th>
            </tr>
          </thead>

          <tbody>
            {projects.map((proj, idx) => {
              const pct    = totals[idx];
              const rowBg  = pct === 100
                ? "bg-green-50/60 dark:bg-green-950/20"
                : idx % 2 !== 0 ? "bg-muted/20" : "";
              return (
                <tr key={proj.no} className={`border-b hover:bg-muted/40 transition-colors ${rowBg}`}>
                  <td className="sticky left-0 z-10 bg-background border-r px-3 py-3 text-muted-foreground font-mono">{proj.no}</td>
                  <td className="sticky left-10 z-10 bg-background border-r px-3 py-3 font-medium text-foreground max-w-[240px]">
                    <span className="line-clamp-2 leading-snug">{proj.name}</span>
                  </td>
                  <td className="border-r px-3 py-3 whitespace-nowrap text-muted-foreground">{proj.engineer}</td>
                  {proj.statuses.map((sym, ci) => (
                    <td key={ci} className="border-r px-2 py-2 text-center align-middle">
                      <StatusCell sym={sym} />
                    </td>
                  ))}
                  <td className="px-3 py-3"><CompletionBar pct={pct} /></td>
                </tr>
              );
            })}
          </tbody>

          {/* ── Phase completion footer ── */}
          <tfoot>
            <tr className="border-t-2 bg-muted/60">
              <td className="sticky left-0 z-10 bg-muted border-r px-2 py-2" />
              <td className="sticky left-10 z-10 bg-muted border-r px-3 py-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wide">
                Phase %
              </td>
              <td className="border-r px-3 py-2" />
              {phases.map((p, ci) => {
                const applicable = projects.filter(proj => proj.statuses[ci] !== SYM_NA && proj.statuses[ci] !== "");
                const done       = applicable.reduce((s, proj) => {
                  const m = STATUS_META[proj.statuses[ci]];
                  return s + (m ? Math.max(0, m.weight) : 0);
                }, 0);
                const pct = applicable.length === 0 ? 0 : Math.round((done / applicable.length) * 100);
                const barColor = pct>=90?"bg-green-500":pct>=60?"bg-blue-500":pct>=30?"bg-amber-500":"bg-red-400";
                const txtColor = pct>=90?"text-green-600 dark:text-green-400":pct>=60?"text-blue-600 dark:text-blue-400":pct>=30?"text-amber-600":"text-red-500";
                return (
                  <td key={p} className="border-r px-2 py-2 text-center">
                    <span className={`text-[10px] font-bold ${txtColor}`}>{pct}%</span>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width:`${pct}%` }} />
                    </div>
                  </td>
                );
              })}
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Source: Project Status_May_Sept_2026.xlsx (GitHub) · {projects.length} projects · {phases.length} phases
      </p>
    </div>
  );
}
