/**
 * ISA-101 HMI Standards — Article Page
 * File: client/src/pages/ISA101Page.tsx
 *
 * Add to your router in App.tsx:
 *   import ISA101Page from "@/pages/ISA101Page";
 *   <Route path="/knowledge/isa-101-hmi-standards" component={ISA101Page} />
 *
 * Add nav link wherever your sidebar/menu lives:
 *   { label: "ISA-101 HMI Standards", href: "/knowledge/isa-101-hmi-standards" }
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ChevronRight,
  Layers,
  Palette,
  Layout,
  Bell,
  BookOpen,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Link } from "wouter";

// ─── Color Palette Data ───────────────────────────────────────────────────────
const colorScheme = [
  {
    name: "Red",
    hex: "#CC2200",
    textColor: "#fff",
    meaning: "Critical alarm / emergency / fire / safety trip",
    example: "PAHH, TAHH, ESD trip",
    isCritical: true,
  },
  {
    name: "Yellow",
    hex: "#FFCC00",
    textColor: "#333",
    meaning: "High / low alarm — non-critical process deviation",
    example: "PAH, TAL, LAL",
    isCritical: false,
  },
  {
    name: "White",
    hex: "#FFFFFF",
    textColor: "#222",
    meaning: "Normal operating value / in-service",
    example: "PV readout, normal state",
    isCritical: false,
  },
  {
    name: "Gray",
    hex: "#707070",
    textColor: "#fff",
    meaning: "Inactive / standby / not in service",
    example: "Standby pump, offline valve",
    isCritical: false,
  },
  {
    name: "Green",
    hex: "#009900",
    textColor: "#fff",
    meaning: "Open / running / confirmed normal state",
    example: "Running motor, open valve + ZSO confirmed",
    isCritical: false,
  },
  {
    name: "Cyan",
    hex: "#00AACC",
    textColor: "#fff",
    meaning: "Override / manual / bypass active",
    example: "Manual mode, bypassed interlock",
    isCritical: false,
  },
  {
    name: "Orange",
    hex: "#FF7700",
    textColor: "#fff",
    meaning: "Maintenance / out of service",
    example: "Tag in maintenance mode",
    isCritical: false,
  },
  {
    name: "Magenta",
    hex: "#CC00CC",
    textColor: "#fff",
    meaning: "Simulation / training mode",
    example: "Simulated PV in DCS trainer",
    isCritical: false,
  },
];

// ─── Screen Hierarchy Data ────────────────────────────────────────────────────
const hierarchy = [
  {
    level: "L1",
    name: "Area Overview",
    description: "Plant-wide health at a glance",
    content: ["KPI summary tiles", "Alarm count banner", "Unit status tiles", "No live PV values"],
    user: "Shift supervisor",
    color: "bg-blue-900 border-blue-500",
    badge: "bg-blue-500",
    navigation: "Click unit tile → L2",
  },
  {
    level: "L2",
    name: "Process Unit",
    description: "Main working view — simplified PFD",
    content: ["Major process tags + live PVs", "Equipment symbols", "Alarm state color coding", "Flow rates, temperatures, levels"],
    user: "Console operator",
    color: "bg-teal-900 border-teal-500",
    badge: "bg-teal-500",
    navigation: "Click equipment → L3",
  },
  {
    level: "L3",
    name: "Equipment Module",
    description: "Loop and device detail — near P&ID",
    content: ["Control loop setpoints", "Interlock / permissive status", "Instrument details", "Mini trends per tag"],
    user: "Console / field operator",
    color: "bg-amber-900 border-amber-500",
    badge: "bg-amber-500",
    navigation: "Click tag → L4 faceplate",
  },
  {
    level: "L4",
    name: "Faceplate / Popup",
    description: "Single instrument control overlay",
    content: ["PV / SP / Output values", "Mode selection (CAS/AUTO/MAN/OOS)", "Alarm limits (HH/H/L/LL)", "Command buttons (discrete)"],
    user: "Any operator",
    color: "bg-red-900 border-red-500",
    badge: "bg-red-500",
    navigation: "Esc to dismiss — never replaces parent",
  },
];

// ─── Alarm State Data ─────────────────────────────────────────────────────────
const alarmStates = [
  {
    state: "NORMAL",
    color: "#009900",
    bg: "#0a1a0a",
    blink: false,
    audible: false,
    description: "Process within all limits. Tag shown in white or gray. No operator action needed.",
    ackRequired: false,
  },
  {
    state: "UNACKNOWLEDGED",
    color: "#CC2200",
    bg: "#1a0000",
    blink: true,
    audible: true,
    description: "Alarm condition tripped. Tag cell blinks at 0.5–1 Hz. Audible alert active. Operator must acknowledge.",
    ackRequired: true,
  },
  {
    state: "ACKNOWLEDGED",
    color: "#FFCC00",
    bg: "#1a1400",
    blink: false,
    audible: false,
    description: "Operator has acknowledged. Blink stops, audible silences. Condition still abnormal — steady alarm color remains.",
    ackRequired: false,
  },
  {
    state: "RTN-UNACKNOWLEDGED",
    color: "#00AACC",
    bg: "#001a22",
    blink: true,
    audible: false,
    description: "Process returned to normal but alarm was never acknowledged. Cyan blink. Operator must close the alarm loop.",
    ackRequired: true,
  },
];

// ─── Faceplate Rules ──────────────────────────────────────────────────────────
const faceplateRules = [
  { zone: "Top-left", rule: "Tag ID — monospace, fixed size, never moves" },
  { zone: "Top-right", rule: "Alarm status badge — always this position" },
  { zone: "Primary zone", rule: "PV displayed largest — read at a glance" },
  { zone: "Secondary zone", rule: "SP and Output — smaller but prominent" },
  { zone: "Bar zone", rule: "PV vs SP deviation — visible without arithmetic" },
  { zone: "Limits zone", rule: "HH / H / L / LL always visible on faceplate" },
  { zone: "Mode zone", rule: "CAS → AUTO → MAN → OOS — fixed order always" },
  { zone: "SP entry", rule: "Only enabled in AUTO or MAN — disabled in CAS" },
  { zone: "Discrete cmd", rule: "Confirm dialog required before any command" },
  { zone: "Dismiss", rule: "Esc to close — never replaced by navigation" },
];

// ─── Interactive Faceplate Demo ───────────────────────────────────────────────
function FaceplateDemo() {
  const [mode, setMode] = useState<"CAS" | "AUTO" | "MAN" | "OOS">("CAS");
  const [sp, setSp] = useState(1700);
  const pv = 1842;
  const output = 72;
  const modes = ["CAS", "AUTO", "MAN", "OOS"] as const;

  const modeColors: Record<string, string> = {
    CAS: "border-green-500 bg-green-950 text-green-400",
    AUTO: "border-green-500 bg-green-950 text-green-400",
    MAN: "border-cyan-500 bg-cyan-950 text-cyan-400",
    OOS: "border-orange-500 bg-orange-950 text-orange-400",
  };
  const inactiveMode = "border-zinc-700 bg-zinc-900 text-zinc-500";
  const pvAlarm = pv > 1800;

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-4 font-mono text-sm max-w-sm">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-zinc-700 pb-2 mb-3">
        <span className={`font-bold text-base ${pvAlarm ? "text-yellow-400" : "text-white"}`}>
          FIC-2040
        </span>
        {pvAlarm ? (
          <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
            ALM-HI
          </span>
        ) : (
          <span className="bg-green-700 text-green-100 text-xs px-2 py-0.5 rounded">
            NORMAL
          </span>
        )}
      </div>
      <div className="text-zinc-500 text-xs mb-3">KEROSENE DRAW FLOW</div>

      {/* PV / SP / OUT */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "PV", value: pv, unit: "BPH", color: pvAlarm ? "#FFCC00" : "#FFFFFF" },
          { label: "SP", value: sp, unit: "BPH", color: "#FFFFFF" },
          { label: "OUT", value: output, unit: "%", color: "#00AACC" },
        ].map((item) => (
          <div key={item.label} className="bg-zinc-800 rounded p-2 text-center">
            <div className="text-zinc-500 text-xs">{item.label}</div>
            <div className="text-lg font-bold" style={{ color: item.color }}>
              {item.value}
            </div>
            <div className="text-zinc-600 text-xs">{item.unit}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-zinc-950 rounded p-2 mb-3 flex gap-3 items-end h-20">
        {[
          { label: "PV", pct: Math.round((pv / 2000) * 100), color: pvAlarm ? "#FFCC00" : "#fff" },
          { label: "SP", pct: Math.round((sp / 2000) * 100), color: "#fff" },
          { label: "OUT", pct: output, color: "#00AACC" },
        ].map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-5 rounded-sm transition-all duration-300"
              style={{ height: `${b.pct}%`, background: b.color, opacity: 0.85 }}
            />
            <span className="text-zinc-600 text-xs mt-1">{b.label}</span>
          </div>
        ))}
        <div className="flex flex-col justify-between text-zinc-700 text-xs h-full text-right">
          <span>2000</span><span>1500</span><span>1000</span><span>500</span><span>0</span>
        </div>
      </div>

      {/* Alarm limits */}
      <div className="bg-zinc-800 rounded p-2 mb-3 text-xs flex justify-between">
        <span className="text-red-400">HH:2000</span>
        <span className="text-yellow-400">H:1800 ◀</span>
        <span className="text-yellow-400">L:800</span>
        <span className="text-red-400">LL:400</span>
      </div>

      {/* Mode selector */}
      <div className="text-zinc-500 text-xs mb-1">MODE</div>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`border rounded text-xs py-1 transition-colors ${
              mode === m ? modeColors[m] : inactiveMode
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* SP slider — only in AUTO or MAN */}
      <div className="text-zinc-500 text-xs mb-1">
        SET POINT {mode === "CAS" || mode === "OOS" ? "(locked in " + mode + ")" : "ADJUST"}
      </div>
      <div className="px-1">
        <Slider
          min={400}
          max={2000}
          step={10}
          value={[sp]}
          onValueChange={([v]) => setSp(v)}
          disabled={mode === "CAS" || mode === "OOS"}
          className={mode === "CAS" || mode === "OOS" ? "opacity-30" : ""}
        />
      </div>
      <div className="text-right text-zinc-400 text-xs mt-1">SP: {sp} BPH</div>
    </div>
  );
}

// ─── Alarm Lifecycle Demo ─────────────────────────────────────────────────────
function AlarmDemo() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = alarmStates[activeIdx];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {alarmStates.map((s, i) => (
          <button
            key={s.state}
            onClick={() => setActiveIdx(i)}
            className={`rounded-lg border p-3 text-left transition-all ${
              i === activeIdx ? "ring-2 ring-white/30 scale-105" : "opacity-60 hover:opacity-90"
            }`}
            style={{
              background: s.bg,
              borderColor: s.color,
            }}
          >
            <div
              className="text-xs font-bold font-mono mb-1"
              style={{ color: s.color }}
            >
              {s.state}
            </div>
            {s.blink && (
              <div className="text-xs text-zinc-400">
                {s.audible ? "🔊 blink + audible" : "◉ blink only"}
              </div>
            )}
            {!s.blink && (
              <div className="text-xs text-zinc-500">steady / silent</div>
            )}
          </button>
        ))}
      </div>

      {/* Detail card */}
      <div
        className="rounded-lg border p-4 transition-all"
        style={{ background: active.bg, borderColor: active.color }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-5 h-5 rounded font-mono text-xs flex items-center justify-center font-bold ${active.blink ? "animate-pulse" : ""}`}
            style={{ background: active.color, color: active.bg }}
          >
            ●
          </div>
          <span className="font-mono font-bold" style={{ color: active.color }}>
            {active.state}
          </span>
          {active.ackRequired && (
            <span className="text-xs bg-white/10 text-white px-2 py-0.5 rounded">
              ACK REQUIRED
            </span>
          )}
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{active.description}</p>
        <div className="mt-3 flex gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded ${active.blink ? "bg-white/10 text-white" : "bg-zinc-800 text-zinc-500"}`}>
            {active.blink ? "BLINK: 0.5–1 Hz" : "BLINK: none"}
          </span>
          <span className={`px-2 py-0.5 rounded ${active.audible ? "bg-white/10 text-white" : "bg-zinc-800 text-zinc-500"}`}>
            {active.audible ? "AUDIBLE: active" : "AUDIBLE: silent"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ISA101Page() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* Back nav */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/knowledge">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Knowledge Base
            </button>
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">ISA-101 HMI Standards</span>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Hero */}
          <div className="mb-10">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">ISA-101</Badge>
              <Badge variant="outline">HMI Design</Badge>
              <Badge variant="outline">Process Control</Badge>
              <Badge variant="outline">Alarm Management</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-4">
              ISA-101 HMI Standards
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
              ANSI/ISA-101.01 is the definitive standard for human-machine interface design in
              process industries. It covers color schemes, screen hierarchies, faceplate layouts,
              and alarm presentation — providing a framework that reduces operator error and
              improves abnormal situation management.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>Applies to: Oil & Gas · Petrochemical · Power · Water · Pharmaceutical</span>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="hierarchy" className="space-y-6">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
              <TabsTrigger value="hierarchy" className="flex items-center gap-1">
                <Layers className="w-3 h-3" /> Screen Hierarchy
              </TabsTrigger>
              <TabsTrigger value="colors" className="flex items-center gap-1">
                <Palette className="w-3 h-3" /> Color Scheme
              </TabsTrigger>
              <TabsTrigger value="faceplate" className="flex items-center gap-1">
                <Layout className="w-3 h-3" /> Faceplates
              </TabsTrigger>
              <TabsTrigger value="alarms" className="flex items-center gap-1">
                <Bell className="w-3 h-3" /> Alarm Lifecycle
              </TabsTrigger>
            </TabsList>

            {/* ── TAB 1: Screen Hierarchy ── */}
            <TabsContent value="hierarchy" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">Four-level display hierarchy</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  ISA-101 §5.4 — Every display belongs to one of four levels. Navigation always
                  drills down through objects; no more than 3 clicks from anywhere to any tag.
                </p>
              </div>
              <div className="space-y-3">
                {hierarchy.map((h, i) => (
                  <div
                    key={h.level}
                    className={`rounded-xl border-l-4 p-5 bg-card ${h.color.split(" ")[1]} border`}
                    style={{ marginLeft: `${i * 16}px` }}
                  >
                    <div className="flex flex-wrap items-start gap-3 mb-3">
                      <span
                        className={`${h.badge} text-white text-xs font-bold px-2 py-1 rounded font-mono`}
                      >
                        {h.level}
                      </span>
                      <div>
                        <div className="font-semibold">{h.name}</div>
                        <div className="text-muted-foreground text-sm">{h.description}</div>
                      </div>
                      <div className="ml-auto text-xs text-muted-foreground border border-border rounded px-2 py-1">
                        {h.user}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-sm mb-3">
                      {h.content.map((c) => (
                        <div key={c} className="flex items-start gap-1 text-muted-foreground">
                          <span className="text-xs mt-0.5">◦</span> {c}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2 font-mono">
                      Navigation: {h.navigation}
                    </div>
                  </div>
                ))}
              </div>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Navigation rules (ISA-101 §5.4)</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <div>◦ Drill-down via clicking process objects — never text menus</div>
                  <div>◦ Breadcrumb bar at top for upward navigation always</div>
                  <div>◦ Max 3 clicks from any screen to any tag</div>
                  <div>◦ Faceplate popups dismissed with Esc key only</div>
                  <div>◦ Back button never replaces the breadcrumb trail</div>
                  <div>◦ Each level uses consistent screen layout across the plant</div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB 2: Color Scheme ── */}
            <TabsContent value="colors" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">ISA-101 color assignments</h2>
                <p className="text-muted-foreground text-sm mb-2">
                  Color communicates state — never decoration. The background is always gray
                  (#404040 range) to preserve the emotional weight of alarm colors and reduce eye
                  fatigue over a 12-hour shift.
                </p>
              </div>

              {/* Gray bg principle callout */}
              <div className="rounded-lg p-4 font-mono text-sm" style={{ background: "#2a2a2a", border: "1px solid #555" }}>
                <div style={{ color: "#C8C8C8" }} className="font-semibold mb-1">
                  Background: Gray (#404040) — the ISA-101 gray-background philosophy
                </div>
                <div style={{ color: "#888" }} className="text-xs">
                  Process equipment rendered in muted, desaturated tones. Color reserved exclusively
                  for status. Never use red for logos, headers, or any non-alarm purpose.
                </div>
              </div>

              {/* Color grid */}
              <div className="space-y-2">
                {colorScheme.map((c) => (
                  <TooltipProvider key={c.name}>
                    <div className="rounded-lg border border-border p-4 flex flex-wrap items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-md flex-shrink-0 border border-white/10"
                        style={{ background: c.hex }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{c.hex}</span>
                          {c.isCritical && (
                            <Badge variant="destructive" className="text-xs">critical</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{c.meaning}</div>
                      </div>
                      <div className="text-xs text-muted-foreground border border-border rounded px-2 py-1 font-mono">
                        {c.example}
                      </div>
                    </div>
                  </TooltipProvider>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Critical ISA-101 color rules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 font-bold">1.</span>
                    Never use RED for any purpose other than alarms or emergencies — no decorative red.
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-500 font-bold">2.</span>
                    Limit YELLOW to abnormal process conditions only — never for headers or highlights.
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-foreground font-bold">3.</span>
                    Color must never be the ONLY indicator — always pair with shape, label, or position (accessibility + colorblind compliance).
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-foreground font-bold">4.</span>
                    Process equipment in normal state: muted, desaturated gray-toned fills only.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB 3: Faceplates ── */}
            <TabsContent value="faceplate" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">Faceplate design — ISA-101 §6.4</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Every faceplate follows a fixed zone layout. An operator trained on one loop's
                  faceplate can read any other loop's faceplate without relearning — because the
                  zones are always in the same position.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 items-start">
                {/* Live demo */}
                <div>
                  <div className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">
                    Interactive demo — PID controller faceplate
                  </div>
                  <FaceplateDemo />
                  <p className="text-xs text-muted-foreground mt-2">
                    Switch modes to see SP lock in CAS/OOS. Adjust SP slider in AUTO/MAN.
                  </p>
                </div>

                {/* Rules table */}
                <div>
                  <div className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">
                    ISA-101 faceplate zone rules
                  </div>
                  <div className="space-y-2">
                    {faceplateRules.map((r) => (
                      <div
                        key={r.zone}
                        className="rounded-lg border border-border p-3 flex gap-3"
                      >
                        <div className="text-xs font-mono text-muted-foreground w-28 flex-shrink-0 pt-0.5">
                          {r.zone}
                        </div>
                        <div className="text-sm">{r.rule}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">On/Off valve faceplate rules</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <div>◦ Confirmed limit switch states (ZSO / ZSC) always shown</div>
                  <div>◦ Permissive list visible — all conditions listed</div>
                  <div>◦ OPEN / CLOSE command buttons require confirm dialog</div>
                  <div>◦ Interlock bypass state highlighted in cyan</div>
                  <div>◦ Intermediate position shown if not fully open or closed</div>
                  <div>◦ Command inhibit reason displayed when blocked</div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB 4: Alarm Lifecycle ── */}
            <TabsContent value="alarms" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">Alarm lifecycle — ISA-18.2 / ISA-101</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  ISA-101 references ISA-18.2 for the alarm state machine, then specifies
                  exactly how each state is displayed — blink rate, color, audible behavior,
                  and acknowledgement requirements.
                </p>
              </div>

              <AlarmDemo />

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Blink rules (ISA-101 §7)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div>◦ Only UNACKNOWLEDGED alarms blink — ACK alarms are steady color</div>
                    <div>◦ Priority 1–2: 1 Hz fast blink</div>
                    <div>◦ Priority 3: 0.5 Hz slow blink</div>
                    <div>◦ Blink only the alarm cell — never the process object, pipe, or vessel</div>
                    <div>◦ RTN-unacknowledged: cyan blink (process cleared, operator has not closed)</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Alarm management principles</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div>◦ Alarm flood: display must remain comprehensible — gray bg enforces this</div>
                    <div>◦ Shelved alarms shown distinctly (orange border) — not hidden</div>
                    <div>◦ Suppressed-by-design alarms tracked separately from shelved</div>
                    <div>◦ Target: &lt; 1 alarm per 10 minutes during normal operation</div>
                    <div>◦ Standing alarms (days-long) flagged as rationalization candidates</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* Reference footer */}
          <div className="mt-12 border-t border-border pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <BookOpen className="w-4 h-4" />
              <span className="font-medium">Standards references</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <span>◦ ANSI/ISA-101.01-2015 — Human Machine Interfaces for Process Automation Systems</span>
              <span>◦ ANSI/ISA-18.2-2016 — Management of Alarm Systems</span>
              <span>◦ EEMUA 191 — Alarm Systems: A Guide to Design, Management and Procurement</span>
              <span>◦ ISA-5.1 — Instrumentation Symbols and Identification</span>
              <span>◦ ASM Consortium Guidelines — Effective Operator Display Design</span>
              <span>◦ IEC 62682 — Management of Alarm Systems (international equivalent of ISA-18.2)</span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
