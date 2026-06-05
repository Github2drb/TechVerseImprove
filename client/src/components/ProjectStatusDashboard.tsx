// client/src/components/ProjectStatusDashboard.tsx
// Requires: npm install xlsx
// Import in analytics.tsx: import { ProjectStatusDashboard } from "@/components/ProjectStatusDashboard";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Save, RefreshCw, Lock, Unlock, X } from "lucide-react";

// ── Data source — proxied through backend (avoids CORS + uses GITHUB_TOKEN) ──
const EXCEL_API = "/api/project-status-excel";

// ── All status symbols ────────────────────────────────────────────────────────
const SYM_COMPLETED   = "\u00fc"; // ü  Completed
const SYM_NOT_STARTED = "\u00fb"; // û  Not Started
const SYM_IN_PROGRESS = "y";      //    In Progress
const SYM_NA          = "\u2260"; // ≠  Not Applicable
const SYM_PS          = "PS";     //    Partially Started
const SYM_PC          = "PC";     //    Partially Completed
const SYM_WCA         = "WCA";    //    Waiting for Customer Approval

interface StatusMeta { label: string; badge: string; bg: string; text: string; weight: number; border: string; }

const STATUS_META: Record<string, StatusMeta> = {
  [SYM_COMPLETED]:   { label:"Completed",                     badge:"✓",   bg:"bg-green-600",             text:"text-white",                             border:"border-green-700",  weight:1    },
  [SYM_IN_PROGRESS]: { label:"In Progress",                   badge:"◑",   bg:"bg-blue-600",              text:"text-white",                             border:"border-blue-700",   weight:0.5  },
  [SYM_PS]:          { label:"Partially Started",             badge:"¼",   bg:"bg-orange-500",            text:"text-white",                             border:"border-orange-600", weight:0.25 },
  [SYM_PC]:          { label:"Partially Completed",           badge:"¾",   bg:"bg-teal-500",              text:"text-white",                             border:"border-teal-600",   weight:0.75 },
  [SYM_WCA]:         { label:"Waiting for Customer Approval", badge:"⏳",  bg:"bg-purple-600",            text:"text-white",                             border:"border-purple-700", weight:0.8  },
  [SYM_NOT_STARTED]: { label:"Not Started",                   badge:"✗",   bg:"bg-red-600",               text:"text-white",                             border:"border-red-700",    weight:0    },
  [SYM_NA]:          { label:"Not Applicable",                badge:"–",   bg:"bg-gray-600 dark:bg-gray-700", text:"text-white",                         border:"border-gray-500",   weight:-1   },
  "":                { label:"—",                             badge:"·",   bg:"bg-muted/20",              text:"text-muted-foreground/30",               border:"border-transparent",weight:0    },
};

const ALL_STATUSES = [SYM_COMPLETED, SYM_IN_PROGRESS, SYM_PS, SYM_PC, SYM_WCA, SYM_NOT_STARTED, SYM_NA];

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectRow { id: string; name: string; engineer: string; statuses: string[]; }
interface SheetData  { phases: string[]; projects: ProjectRow[]; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcPct(statuses: string[]): number {
  let done = 0, total = 0;
  for (const s of statuses) {
    if (s === SYM_NA || s === "") continue;
    total++;
    const m = STATUS_META[s];
    if (m) done += Math.max(0, m.weight);
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function parseSheet(rows: any[][]): SheetData {
  const headerRow: any[] = rows[1] ?? [];
  const phases: string[] = [];
  for (let c = 3; c < headerRow.length; c++) {
    if (headerRow[c]) phases.push(String(headerRow[c]).trim());
  }
  const projects: ProjectRow[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[1]) continue;
    const statuses: string[] = [];
    for (let c = 3; c < 3 + phases.length; c++) {
      statuses.push(row[c] ? String(row[c]).trim() : "");
    }
    projects.push({
      id:       `proj-${r}`,
      name:     String(row[1] ?? "").trim(),
      engineer: String(row[2] ?? "—").trim(),
      statuses,
    });
  }
  return { phases, projects };
}

function isAdmin(): boolean { return sessionStorage.getItem("drb_admin") === "1"; }
function adminHeader(): string {
  try {
    const name = sessionStorage.getItem("drb_admin_name") ?? "admin";
    return btoa(JSON.stringify({ username: name.toLowerCase(), role: "admin" }));
  } catch { return ""; }
}

// ── StatusCell ────────────────────────────────────────────────────────────────
function StatusCell({ sym, onClick, adminMode }: { sym: string; onClick?: () => void; adminMode: boolean }) {
  const m = STATUS_META[sym] ?? STATUS_META[""];
  return (
    <button
      onClick={adminMode ? onClick : undefined}
      title={m.label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold border transition-all
        ${m.bg} ${m.text} ${m.border}
        ${adminMode ? "cursor-pointer hover:scale-110 hover:shadow-md active:scale-95" : "cursor-default"}`}
    >
      {m.badge}
    </button>
  );
}

// ── CompletionBar ─────────────────────────────────────────────────────────────
function CompletionBar({ pct }: { pct: number }) {
  const color = pct>=90?"bg-green-500":pct>=60?"bg-blue-500":pct>=30?"bg-amber-500":"bg-red-400";
  const textColor = pct>=90?"text-green-400":pct>=60?"text-blue-400":pct>=30?"text-amber-400":"text-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width:`${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums min-w-[34px] text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

// ── StatusPicker popup ────────────────────────────────────────────────────────
function StatusPicker({
  top, left, current, onSelect, onClose,
}: {
  top: number; left: number; current: string;
  onSelect: (sym: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-background border rounded-xl shadow-2xl p-3 w-52"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Set Status</p>
        <button onClick={onClose}><X className="h-3.5 w-3.5 text-muted-foreground"/></button>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {ALL_STATUSES.map(sym => {
          const m = STATUS_META[sym];
          return (
            <button key={sym} onClick={() => { onSelect(sym); onClose(); }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-all
                hover:opacity-90 active:scale-95
                ${current === sym ? "ring-2 ring-primary ring-offset-1" : ""}
                ${m.bg} ${m.text}`}>
              <span className="text-sm font-bold w-5 text-center">{m.badge}</span>
              <span>{m.label}</span>
              {current === sym && <span className="ml-auto text-[10px] opacity-70">current</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ProjectStatusDashboard() {
  const [data,        setData]        = useState<SheetData | null>(null);
  const [overrides,   setOverrides]   = useState<Record<string, string[]>>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [saveStatus,  setSaveStatus]  = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [picker, setPicker] = useState<{ projId: string; ci: number; top: number; left: number } | null>(null);
  const [adminMode, setAdminMode] = useState(isAdmin());

  // ── Fetch Excel via backend proxy (GITHUB_TOKEN, no CORS issues) ────────────
  const fetchExcel = async (): Promise<SheetData | null> => {
    const res = await fetch(EXCEL_API, { cache: "no-store" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Backend HTTP ${res.status}`);
    }
    const meta   = await res.json();
    const b64    = (meta.content as string).replace(/\n/g, "");
    const binary = atob(b64);
    const buf    = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    const wb   = XLSX.read(buf, { type: "array" });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
    return parseSheet(rows);
  };

  // ── Fetch saved overrides from backend ────────────────────────────────────
  const fetchSaved = async (): Promise<{ overrides: Record<string, string[]>; phases?: string[]; projects?: any[] } | null> => {
    try {
      const r = await fetch("/api/project-status-data");
      if (!r.ok) return null;
      const j = await r.json();
      return j.exists ? j : null;
    } catch { return null; }
  };

  // ── Load: Excel + saved overrides ─────────────────────────────────────────
  const loadData = async (forceExcel = false) => {
    setLoading(true); setError(null);
    try {
      const [excelData, saved] = await Promise.all([fetchExcel(), fetchSaved()]);
      if (!excelData) throw new Error("Failed to parse Excel");
      setData(excelData);

      // Apply saved overrides on top of Excel
      if (saved?.overrides && !forceExcel) {
        setOverrides(saved.overrides);
      } else {
        setOverrides({});
      }
      setLastRefresh(new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" }));
    } catch (e: any) {
      setError("Could not load data: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on every mount
  useEffect(() => { loadData(); }, []);

  // Sync admin mode from sessionStorage (in case user logs in/out on analytics page)
  useEffect(() => {
    const check = () => setAdminMode(isAdmin());
    window.addEventListener("storage", check);
    const interval = setInterval(check, 2000);
    return () => { window.removeEventListener("storage", check); clearInterval(interval); };
  }, []);

  // ── Get effective status (override > excel) ───────────────────────────────
  const getStatus = (projId: string, ci: number, excelStatus: string): string => {
    return overrides[projId]?.[ci] ?? excelStatus;
  };

  // ── Cell click: open picker ───────────────────────────────────────────────
  const openPicker = (projId: string, ci: number, e: React.MouseEvent) => {
    if (!adminMode) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const POPUP_H = 320, POPUP_W = 210;
    let top  = rect.top - POPUP_H - 6; if (top < 8) top = rect.bottom + 6;
    let left = rect.left;
    if (left + POPUP_W > window.innerWidth - 8) left = window.innerWidth - POPUP_W - 8;
    if (left < 8) left = 8;
    setPicker({ projId, ci, top, left });
  };

  const applyStatus = (sym: string) => {
    if (!picker) return;
    const { projId, ci } = picker;
    setOverrides(prev => {
      const proj = data?.projects.find(p => p.id === projId);
      const base = prev[projId] ?? (proj ? [...proj.statuses] : []);
      const updated = [...base];
      updated[ci] = sym;
      return { ...prev, [projId]: updated };
    });
  };

  // ── Save overrides to GitHub ──────────────────────────────────────────────
  const saveData = async () => {
    if (!data) return;
    setSaveStatus("saving");
    try {
      const payload = {
        overrides,
        phases:   data.phases,
        projects: data.projects.map(p => ({ id: p.id, name: p.name, engineer: p.engineer })),
        lastUpdated: new Date().toISOString(),
      };
      const r = await fetch("/api/project-status-data", {
        method:  "POST",
        headers: { "Content-Type":"application/json", "x-admin-auth": adminHeader() },
        body:    JSON.stringify(payload),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message ?? "Save failed"); }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e: any) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      alert("Save failed: " + e.message);
    }
  };

  // ── Refresh (re-fetch Excel + apply saved overrides) ─────────────────────
  const refresh = () => loadData(false);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
          <p className="text-muted-foreground text-sm mt-1">May – Sept 2026 · Controls Engineering</p>
        </div>
      </div>
      <div className="flex items-center gap-3 py-12 justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        <span className="text-muted-foreground text-sm">Loading from GitHub…</span>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
      <div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm flex items-center justify-between">
        <span>⚠ {error}</span>
        <button onClick={refresh} className="text-xs underline ml-4">Retry</button>
      </div>
    </div>
  );

  const { phases, projects } = data;
  const totals    = projects.map(p => calcPct(p.statuses.map((s, ci) => getStatus(p.id, ci, s))));
  const fullDone  = projects.filter((_, i) => totals[i] === 100).length;
  const inProg    = projects.filter((_, i) => totals[i] > 0 && totals[i] < 100).length;
  const avgPct    = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const hasUnsaved = Object.keys(overrides).length > 0;

  const saveBtnLabel = saveStatus==="saving"?"Saving…":saveStatus==="saved"?"Saved ✓":saveStatus==="error"?"Error!":"Save";
  const saveBtnColor = saveStatus==="saved"?"bg-green-600 hover:bg-green-700 text-white":saveStatus==="error"?"bg-red-600 hover:bg-red-700 text-white":"";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
          <p className="text-muted-foreground text-sm mt-1">
            May – Sept 2026 · Controls Engineering
            {lastRefresh && <span className="ml-2 opacity-60">· Refreshed {lastRefresh}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Admin badge */}
          {adminMode
            ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground">
                <Unlock className="h-3 w-3"/> Admin Mode
              </span>
            : <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border text-muted-foreground">
                <Lock className="h-3 w-3"/> View only · log in via Daily Report to edit
              </span>
          }

          {/* Save — admin only */}
          {adminMode && (
            <button onClick={saveData} disabled={saveStatus==="saving"}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                ${saveBtnColor || "hover:bg-muted border-input"} ${hasUnsaved && saveStatus==="idle" ? "border-amber-400 text-amber-600 dark:text-amber-400" : ""}`}>
              <Save className="h-3.5 w-3.5"/>{saveBtnLabel}
              {hasUnsaved && saveStatus==="idle" && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>}
            </button>
          )}

          {/* Refresh */}
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors border-input">
            <RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:"Total Projects",   value:projects.length, color:"text-foreground",                          sub:"All tracked" },
          { label:"Completed",        value:fullDone,         color:"text-green-600 dark:text-green-400",       sub:"100% done" },
          { label:"In Progress",      value:inProg,           color:"text-blue-600 dark:text-blue-400",         sub:"Partially done" },
          { label:"Overall Progress", value:`${avgPct}%`,     color:"text-amber-600 dark:text-amber-400",       sub:"Average completion" },
        ].map(c => (
          <div key={c.label} className="border rounded-xl p-4 bg-card">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground font-medium">Legend:</span>
        {ALL_STATUSES.filter(s => s !== "").map(sym => {
          const m = STATUS_META[sym];
          return (
            <span key={sym} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${m.bg} ${m.text} ${m.border}`}>
              <span className="font-bold">{m.badge}</span>{m.label}
            </span>
          );
        })}
        {adminMode && (
          <span className="text-xs text-muted-foreground italic ml-2">· Click any cell to change status</span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full border-collapse text-xs" style={{ minWidth:`${300 + phases.length * 72}px` }}>
          <thead>
            <tr className="border-b bg-muted">
              <th className="sticky left-0 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground w-10">#</th>
              <th className="sticky left-10 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground min-w-[240px]">Project</th>
              <th className="border-r px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">Engineer</th>
              {phases.map(p => (
                <th key={p} className="border-r px-2 py-3 text-center font-semibold text-muted-foreground min-w-[68px]">
                  <span className="block leading-tight whitespace-nowrap"
                    style={{ writingMode:"vertical-lr", transform:"rotate(180deg)", height:"88px" }}>
                    {p}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[130px]">Completion</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((proj, idx) => {
              const pct   = totals[idx];
              const rowBg = pct === 100 ? "bg-green-50/60 dark:bg-green-950/20" : idx % 2 !== 0 ? "bg-muted/20" : "";
              return (
                <tr key={proj.id} className={`border-b hover:bg-muted/40 transition-colors ${rowBg}`}>
                  <td className="sticky left-0 z-10 bg-background border-r px-3 py-3 text-muted-foreground font-mono">{idx + 1}</td>
                  <td className="sticky left-10 z-10 bg-background border-r px-3 py-3 font-medium text-foreground max-w-[240px]">
                    <span className="line-clamp-2 leading-snug">{proj.name}</span>
                  </td>
                  <td className="border-r px-3 py-3 whitespace-nowrap text-muted-foreground">{proj.engineer}</td>
                  {proj.statuses.map((excelSym, ci) => {
                    const sym = getStatus(proj.id, ci, excelSym);
                    const isOverridden = overrides[proj.id]?.[ci] !== undefined;
                    return (
                      <td key={ci}
                        className={`border-r text-center align-middle py-2 px-1
                          ${adminMode ? "cursor-pointer" : ""}
                          ${isOverridden ? "ring-inset ring-1 ring-amber-400/60" : ""}`}
                        onClick={e => openPicker(proj.id, ci, e)}
                        title={adminMode ? `Click to change: ${STATUS_META[sym]?.label ?? sym}` : STATUS_META[sym]?.label}>
                        <StatusCell sym={sym} adminMode={adminMode} />
                      </td>
                    );
                  })}
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
                const vals = projects.map(proj => getStatus(proj.id, ci, proj.statuses[ci] ?? ""));
                const applicable = vals.filter(s => s !== SYM_NA && s !== "");
                const done = applicable.reduce((sum, s) => {
                  const m = STATUS_META[s]; return sum + (m ? Math.max(0, m.weight) : 0);
                }, 0);
                const pct = applicable.length === 0 ? 0 : Math.round((done / applicable.length) * 100);
                const bar = pct>=90?"bg-green-500":pct>=60?"bg-blue-500":pct>=30?"bg-amber-500":"bg-red-400";
                const txt = pct>=90?"text-green-400":pct>=60?"text-blue-400":pct>=30?"text-amber-400":"text-red-400";
                return (
                  <td key={p} className="border-r px-2 py-2 text-center">
                    <span className={`text-[10px] font-bold ${txt}`}>{pct}%</span>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${bar}`} style={{ width:`${pct}%` }} />
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
        Source: Excel (GitHub) · Overrides saved to GitHub · {projects.length} projects · {phases.length} phases
      </p>

      {/* ── Status picker popup ── */}
      {picker && data && (
        <StatusPicker
          top={picker.top}
          left={picker.left}
          current={getStatus(
            picker.projId, picker.ci,
            data.projects.find(p => p.id === picker.projId)?.statuses[picker.ci] ?? ""
          )}
          onSelect={applyStatus}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
