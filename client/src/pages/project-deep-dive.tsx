import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Upload,
  Image as ImageIcon,
  Cpu,
  ShieldCheck,
  FileText,
  Factory,
  BellRing,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors server/routes.ts EquipmentDoc / StationDoc)
// The server merges the whole request body on save, so the extra `alarms`
// array is persisted to equipment-docs.json without any backend change.
// ---------------------------------------------------------------------------

interface StationImage {
  url: string;
  caption?: string;
  uploadedAt: string;
}

interface StationDoc {
  id: string;
  name: string;
  status: string;
  electricalParts: string;
  process: string;
  inputs: string;
  outputs: string;
  images: StationImage[];
}

// ---- Alarm checklist enums ------------------------------------------------

const ALARM_STATUS_VALUES = [
  "not_created",
  "created_not_tested",
  "testing_in_progress",
  "verified",
] as const;
type AlarmStatus = (typeof ALARM_STATUS_VALUES)[number];

const ALARM_CATEGORY_VALUES = ["low", "mid", "critical"] as const;
type AlarmCategory = (typeof ALARM_CATEGORY_VALUES)[number];

const ALARM_GROUP_VALUES = [
  "pneumatic",
  "servo",
  "stepper",
  "electropneumatic",
  "generic",
] as const;
type AlarmGroup = (typeof ALARM_GROUP_VALUES)[number];

const ALARM_STATUS_LABEL: Record<AlarmStatus, string> = {
  not_created: "Not Created",
  created_not_tested: "Created, Not Tested",
  testing_in_progress: "Testing in Progress",
  verified: "Alarm Verified",
};

// Two SEPARATE palettes so a glance at a row tells you both severity and progress:
//   Category → sky blue / orange / red
//   Status   → grey / yellow / violet / green
// No hue is shared between the two sets.
// `ui` = Tailwind classes for the on-screen cell, `fill`/`font` = ARGB for Excel.
interface ColorSpec {
  ui: string;
  fill: string;
  font: string;
}

const ALARM_CATEGORY_STYLE: Record<AlarmCategory, ColorSpec> = {
  low: { ui: "bg-sky-500 text-white", fill: "FF0EA5E9", font: "FFFFFFFF" },
  mid: { ui: "bg-orange-500 text-white", fill: "FFF97316", font: "FFFFFFFF" },
  critical: { ui: "bg-red-600 text-white", fill: "FFDC2626", font: "FFFFFFFF" },
};

const ALARM_STATUS_STYLE: Record<AlarmStatus, ColorSpec> = {
  not_created: { ui: "bg-gray-500 text-white", fill: "FF6B7280", font: "FFFFFFFF" },
  created_not_tested: { ui: "bg-yellow-400 text-gray-900", fill: "FFFACC15", font: "FF111827" },
  testing_in_progress: { ui: "bg-violet-600 text-white", fill: "FF7C3AED", font: "FFFFFFFF" },
  verified: { ui: "bg-green-600 text-white", fill: "FF16A34A", font: "FFFFFFFF" },
};

const ALARM_CATEGORY_LABEL: Record<AlarmCategory, string> = {
  low: "Low",
  mid: "Mid",
  critical: "Critical",
};

// Row-level highlight for critical alarms (on screen + Excel)
const CRITICAL_OPEN_ROW = "bg-red-50 dark:bg-red-950/40";
const CRITICAL_DONE_ROW = "bg-green-50 dark:bg-green-950/40";
const XL_CRITICAL_OPEN_ROW = "FFFEE2E2";
const XL_CRITICAL_DONE_ROW = "FFDCFCE7";

const ALARM_GROUP_LABEL: Record<AlarmGroup, string> = {
  pneumatic: "Pneumatic",
  servo: "Servo",
  stepper: "Stepper",
  electropneumatic: "Electropneumatic",
  generic: "Generic",
};

interface AlarmItem {
  id: string;
  name: string;
  description: string;
  category: AlarmCategory;
  group: AlarmGroup;
  status: AlarmStatus;
  verifiedBy: string;
  verifiedAt?: string;
}

interface EquipmentDoc {
  projectName: string;
  synopsis: string;
  plcArchitecture: string;
  safetyLayout: string;
  hasMultipleStations: boolean;
  stations: StationDoc[];
  alarms: AlarmItem[];
  updatedAt: string;
  updatedBy?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "design_stage", label: "Design Stage" },
  { value: "electrical_design", label: "Electrical Design" },
  { value: "procurement_stage", label: "Procurement Stage" },
  { value: "waiting_for_materials", label: "Waiting for Materials" },
  { value: "mechanical_assembly", label: "Mechanical Assembly" },
  { value: "electrical_assembly", label: "Electrical Assembly" },
  { value: "installation_pending", label: "Installation Pending" },
  { value: "installation_in_progress", label: "Installation in Progress" },
  { value: "plc_power_up", label: "PLC Power Up" },
  { value: "io_check", label: "IO Check" },
  { value: "trials_stage", label: "Trials Stage" },
  { value: "fat", label: "F.A.T" },
  { value: "sat", label: "S.A.T" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "blocked", label: "Blocked" },
  { value: "dispatch_stage", label: "Dispatch Stage" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  blocked: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
};

function blankDoc(projectName: string): EquipmentDoc {
  return {
    projectName,
    synopsis: "",
    plcArchitecture: "",
    safetyLayout: "",
    hasMultipleStations: false,
    stations: [],
    alarms: [],
    updatedAt: new Date().toISOString(),
  };
}

// Older saved docs (and the server's blank doc) have no `alarms` field —
// normalise so the UI can always rely on arrays being present.
function normalizeDoc(raw: any, projectName: string): EquipmentDoc {
  const base = blankDoc(projectName);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    stations: Array.isArray(raw.stations) ? raw.stations : [],
    alarms: Array.isArray(raw.alarms) ? raw.alarms : [],
  };
}

function newStation(index: number): StationDoc {
  return {
    id: `station-${Date.now()}-${index}`,
    name: `Station ${index + 1}`,
    status: "not_started",
    electricalParts: "",
    process: "",
    inputs: "",
    outputs: "",
    images: [],
  };
}

function newAlarm(): AlarmItem {
  return {
    id: `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    description: "",
    category: "mid",
    group: "generic",
    status: "not_created",
    verifiedBy: "",
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix — backend expects raw base64
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Alarm checklist → Excel (ExcelJS — already in package.json, used by blog.tsx).
// Plain SheetJS (`xlsx`) cannot write cell colours, so ExcelJS is used here.
// Loaded on demand so it doesn't bloat the page bundle.
// ---------------------------------------------------------------------------

function alarmCounts(alarms: AlarmItem[]) {
  const byStatus: Record<AlarmStatus, number> = {
    not_created: 0,
    created_not_tested: 0,
    testing_in_progress: 0,
    verified: 0,
  };
  for (const a of alarms) if (byStatus[a.status] !== undefined) byStatus[a.status] += 1;
  const critical = alarms.filter((a) => a.category === "critical");
  const criticalVerified = critical.filter((a) => a.status === "verified").length;
  return {
    byStatus,
    total: alarms.length,
    criticalTotal: critical.length,
    criticalVerified,
    criticalOpen: critical.length - criticalVerified,
  };
}

async function exportAlarmsToExcel(projectName: string, alarms: AlarmItem[]): Promise<void> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DRB TechVerse";
  wb.created = new Date();

  const ws = wb.addWorksheet("Alarm Checklist", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const HEADERS = [
    "Sr No",
    "Alarm Name",
    "Description",
    "Category",
    "Group",
    "Current Status",
    "Verified By",
    "Verified On",
  ];
  const WIDTHS = [7, 22, 48, 12, 18, 22, 20, 14];
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const lastCol = HEADERS.length;

  const solid = (argb: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const thin = { style: "thin", color: { argb: "FFBFBFBF" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // ── Title block ──
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `Alarm Checklist — ${projectName}`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = solid("FF1F3864");
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString()}`;
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  // ── Summary block ──
  const c = alarmCounts(alarms);
  const summary: [string, string | number, string | null, string | null][] = [
    ["Total alarms", c.total, null, null],
    [ALARM_STATUS_LABEL.not_created, c.byStatus.not_created, ALARM_STATUS_STYLE.not_created.fill, ALARM_STATUS_STYLE.not_created.font],
    [ALARM_STATUS_LABEL.created_not_tested, c.byStatus.created_not_tested, ALARM_STATUS_STYLE.created_not_tested.fill, ALARM_STATUS_STYLE.created_not_tested.font],
    [ALARM_STATUS_LABEL.testing_in_progress, c.byStatus.testing_in_progress, ALARM_STATUS_STYLE.testing_in_progress.fill, ALARM_STATUS_STYLE.testing_in_progress.font],
    [ALARM_STATUS_LABEL.verified, c.byStatus.verified, ALARM_STATUS_STYLE.verified.fill, ALARM_STATUS_STYLE.verified.font],
    [
      "Critical verified",
      `${c.criticalVerified} / ${c.criticalTotal}`,
      c.criticalOpen > 0 ? ALARM_CATEGORY_STYLE.critical.fill : ALARM_STATUS_STYLE.verified.fill,
      "FFFFFFFF",
    ],
  ];
  let r = 4;
  ws.getCell(r, 2).value = "Summary";
  ws.getCell(r, 2).font = { bold: true, size: 11 };
  r += 1;
  for (const [label, value, fill, font] of summary) {
    const lc = ws.getCell(r, 2);
    const vc = ws.getCell(r, 3);
    lc.value = label;
    vc.value = value;
    lc.border = border;
    vc.border = border;
    vc.alignment = { horizontal: "left" };
    vc.font = { bold: true };
    if (fill) {
      lc.fill = solid(fill);
      lc.font = { bold: true, color: { argb: font ?? "FF000000" } };
    }
    r += 1;
  }
  if (c.criticalOpen > 0) {
    ws.getCell(r, 2).value = `⚠ ${c.criticalOpen} critical alarm(s) NOT verified — highlighted in red below`;
    ws.getCell(r, 2).font = { bold: true, color: { argb: "FFDC2626" } };
    r += 1;
  }
  r += 1;

  // ── Table header (matches the blue header of the on-screen table) ──
  const headerRowNo = r;
  const hr = ws.getRow(headerRowNo);
  HEADERS.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid("FF4472C4");
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  hr.height = 22;

  // ── Rows ──
  alarms.forEach((a, i) => {
    const row = ws.getRow(headerRowNo + 1 + i);
    const isCritical = a.category === "critical";
    const verified = a.status === "verified";
    const band = isCritical
      ? verified
        ? XL_CRITICAL_DONE_ROW
        : XL_CRITICAL_OPEN_ROW
      : i % 2 === 0
      ? "FFCFD5EA"
      : "FFE9EBF5";

    const values = [
      i + 1,
      a.name || "",
      a.description || "",
      ALARM_CATEGORY_LABEL[a.category] ?? a.category,
      ALARM_GROUP_LABEL[a.group] ?? a.group,
      ALARM_STATUS_LABEL[a.status] ?? a.status,
      a.verifiedBy || "",
      a.status === "verified" && a.verifiedAt ? new Date(a.verifiedAt).toLocaleDateString() : "",
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.border = border;
      cell.fill = solid(band);
      cell.alignment = {
        vertical: "top",
        wrapText: true,
        horizontal: ci === 0 ? "center" : "left",
      };
    });

    const cat = ALARM_CATEGORY_STYLE[a.category];
    if (cat) {
      const cc = row.getCell(4);
      cc.fill = solid(cat.fill);
      cc.font = { bold: true, color: { argb: cat.font } };
      cc.alignment = { vertical: "top", horizontal: "center" };
    }
    const st = ALARM_STATUS_STYLE[a.status];
    if (st) {
      const sc = row.getCell(6);
      sc.fill = solid(st.fill);
      sc.font = { bold: true, color: { argb: st.font } };
      sc.alignment = { vertical: "top", horizontal: "center", wrapText: true };
    }
    if (isCritical && !verified) {
      row.getCell(2).font = { bold: true, color: { argb: "FFB91C1C" } };
    }
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowNo }];
  if (alarms.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNo, column: 1 },
      to: { row: headerRowNo + alarms.length, column: lastCol },
    };
  }

  // ── Legend sheet ──
  const lg = wb.addWorksheet("Legend");
  lg.getColumn(1).width = 26;
  lg.getColumn(2).width = 60;
  lg.addRow(["Colour legend"]).font = { bold: true, size: 12 };
  lg.addRow([]);
  lg.addRow(["Alarm Category", ""]).font = { bold: true };
  (Object.keys(ALARM_CATEGORY_STYLE) as AlarmCategory[]).forEach((k) => {
    const row = lg.addRow([ALARM_CATEGORY_LABEL[k], ""]);
    row.getCell(1).fill = solid(ALARM_CATEGORY_STYLE[k].fill);
    row.getCell(1).font = { bold: true, color: { argb: ALARM_CATEGORY_STYLE[k].font } };
  });
  lg.addRow([]);
  lg.addRow(["Current Status", ""]).font = { bold: true };
  (Object.keys(ALARM_STATUS_STYLE) as AlarmStatus[]).forEach((k) => {
    const row = lg.addRow([ALARM_STATUS_LABEL[k], ""]);
    row.getCell(1).fill = solid(ALARM_STATUS_STYLE[k].fill);
    row.getCell(1).font = { bold: true, color: { argb: ALARM_STATUS_STYLE[k].font } };
  });
  lg.addRow([]);
  lg.addRow(["Row highlight", ""]).font = { bold: true };
  const open = lg.addRow(["Critical — not verified", "Whole row light red: needs attention"]);
  open.getCell(1).fill = solid(XL_CRITICAL_OPEN_ROW);
  const done = lg.addRow(["Critical — verified", "Whole row light green: closed"]);
  done.getCell(1).fill = solid(XL_CRITICAL_DONE_ROW);

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeProject = projectName.replace(/[^a-zA-Z0-9\-_]+/g, "_").slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `Alarm_Checklist_${safeProject}_${date}.xlsx`;
  document.body.appendChild(link); // needed for Firefox / Android Chrome
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Top-level station card (NEVER define components inside other components —
// see 04_BUG_PATTERNS.md BUG-02)
// ---------------------------------------------------------------------------

function StationCard({
  station,
  index,
  onChange,
  onDelete,
  onUploadImage,
  uploading,
}: {
  station: StationDoc;
  index: number;
  onChange: (id: string, patch: Partial<StationDoc>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  uploading: boolean;
}) {
  return (
    <Card data-testid={`card-station-${index}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex-1 flex items-center gap-3">
          <Factory className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={station.name}
            onChange={(e) => onChange(station.id, { name: e.target.value })}
            className="font-semibold max-w-xs"
            data-testid={`input-station-name-${index}`}
          />
          <Badge className={`${STATUS_COLOR[station.status] ?? STATUS_COLOR.not_started} text-xs`}>
            {STATUS_LABEL[station.status] ?? station.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={station.status}
            onValueChange={(v) => onChange(station.id, { status: v })}
          >
            <SelectTrigger className="w-44" data-testid={`select-station-status-${index}`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(station.id)}
            data-testid={`button-delete-station-${index}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Electrical &amp; Electronic Parts
            </label>
            <Textarea
              rows={4}
              placeholder="PLC I/O modules, VFDs, sensors, contactors, safety relays, HMI, network switches..."
              value={station.electricalParts}
              onChange={(e) => onChange(station.id, { electricalParts: e.target.value })}
              data-testid={`textarea-electrical-parts-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Process</label>
            <Textarea
              rows={4}
              placeholder="What happens at this station, sequence of operations..."
              value={station.process}
              onChange={(e) => onChange(station.id, { process: e.target.value })}
              data-testid={`textarea-process-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Inputs</label>
            <Textarea
              rows={3}
              placeholder="Sensors, switches, signals coming into this station..."
              value={station.inputs}
              onChange={(e) => onChange(station.id, { inputs: e.target.value })}
              data-testid={`textarea-inputs-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Outputs</label>
            <Textarea
              rows={3}
              placeholder="Actuators, drives, alarms, signals this station produces..."
              value={station.outputs}
              onChange={(e) => onChange(station.id, { outputs: e.target.value })}
              data-testid={`textarea-outputs-${index}`}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <ImageIcon className="h-4 w-4" /> Station Images
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(station.id, file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border hover:bg-accent">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload Image"}
              </span>
            </label>
          </div>
          {station.images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {station.images.map((img, i) => (
                <a
                  key={img.url + i}
                  href={img.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border rounded-md overflow-hidden aspect-video bg-muted"
                >
                  <img src={img.url} alt={img.caption || station.name} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alarm checklist — top-level components (see BUG-02)
// ---------------------------------------------------------------------------

function AlarmRow({
  alarm,
  index,
  onChange,
  onDelete,
}: {
  alarm: AlarmItem;
  index: number;
  onChange: (id: string, patch: Partial<AlarmItem>) => void;
  onDelete: (id: string) => void;
}) {
  const isCritical = alarm.category === "critical";
  const verified = alarm.status === "verified";
  const band = isCritical
    ? verified
      ? CRITICAL_DONE_ROW
      : CRITICAL_OPEN_ROW
    : index % 2 === 0
    ? "bg-[#CFD5EA] dark:bg-slate-800"
    : "bg-[#E9EBF5] dark:bg-slate-900";
  const cat = ALARM_CATEGORY_STYLE[alarm.category] ?? ALARM_CATEGORY_STYLE.mid;
  const st = ALARM_STATUS_STYLE[alarm.status] ?? ALARM_STATUS_STYLE.not_created;
  const cellBase = "border border-white dark:border-slate-700 p-1.5 align-top";

  return (
    <tr
      className={`${band} ${isCritical && !verified ? "shadow-[inset_4px_0_0_0_#dc2626]" : ""}`}
      data-testid={`row-alarm-${index}`}
    >
      <td className={cellBase}>
        <div className="flex items-center gap-1">
          {isCritical &&
            (verified ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Critical, verified" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Critical, not verified" />
            ))}
          <Input
            value={alarm.name}
            placeholder="e.g. AL_101"
            onChange={(e) => onChange(alarm.id, { name: e.target.value })}
            className="h-9 bg-background"
            data-testid={`input-alarm-name-${index}`}
          />
        </div>
      </td>
      <td className={cellBase}>
        <Textarea
          rows={1}
          value={alarm.description}
          placeholder="What triggers this alarm / operator action"
          onChange={(e) => onChange(alarm.id, { description: e.target.value })}
          className="min-h-9 py-2 bg-background resize-y"
          data-testid={`textarea-alarm-description-${index}`}
        />
      </td>
      <td className={`${cellBase} ${cat.ui}`}>
        <Select
          value={alarm.category}
          onValueChange={(v) => onChange(alarm.id, { category: v as AlarmCategory })}
        >
          <SelectTrigger
            className={`h-9 border-white/40 bg-transparent font-semibold ${cat.ui}`}
            data-testid={`select-alarm-category-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALARM_CATEGORY_VALUES.map((c) => (
              <SelectItem key={c} value={c}>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ALARM_CATEGORY_STYLE[c].ui}`}>
                  {ALARM_CATEGORY_LABEL[c]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className={cellBase}>
        <Select
          value={alarm.group}
          onValueChange={(v) => onChange(alarm.id, { group: v as AlarmGroup })}
        >
          <SelectTrigger className="h-9 bg-background" data-testid={`select-alarm-group-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALARM_GROUP_VALUES.map((g) => (
              <SelectItem key={g} value={g}>
                {ALARM_GROUP_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className={`${cellBase} ${st.ui}`}>
        <Select
          value={alarm.status}
          onValueChange={(v) => {
            const status = v as AlarmStatus;
            onChange(alarm.id, {
              status,
              verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
            });
          }}
        >
          <SelectTrigger
            className={`h-9 border-white/40 bg-transparent font-semibold ${st.ui}`}
            data-testid={`select-alarm-status-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALARM_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ALARM_STATUS_STYLE[s].ui}`}>
                  {ALARM_STATUS_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className={cellBase}>
        <Input
          value={alarm.verifiedBy}
          placeholder="Engineer name"
          onChange={(e) => onChange(alarm.id, { verifiedBy: e.target.value })}
          className="h-9 bg-background"
          data-testid={`input-alarm-verified-by-${index}`}
        />
        {verified && alarm.verifiedAt && (
          <p className="mt-1 px-1 text-[10px] text-muted-foreground">
            ✓ {new Date(alarm.verifiedAt).toLocaleDateString()}
          </p>
        )}
      </td>
      <td className={`${cellBase} text-center`}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => onDelete(alarm.id)}
          data-testid={`button-delete-alarm-${index}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}

function AlarmLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-muted-foreground">Category:</span>
        {ALARM_CATEGORY_VALUES.map((c) => (
          <span key={c} className={`rounded px-2 py-0.5 font-semibold ${ALARM_CATEGORY_STYLE[c].ui}`}>
            {ALARM_CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-muted-foreground">Status:</span>
        {ALARM_STATUS_VALUES.map((s) => (
          <span key={s} className={`rounded px-2 py-0.5 font-semibold ${ALARM_STATUS_STYLE[s].ui}`}>
            {ALARM_STATUS_LABEL[s]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-muted-foreground">Critical rows:</span>
        <span className={`rounded border border-red-300 px-2 py-0.5 ${CRITICAL_OPEN_ROW}`}>Not verified</span>
        <span className={`rounded border border-green-300 px-2 py-0.5 ${CRITICAL_DONE_ROW}`}>Verified</span>
      </div>
    </div>
  );
}

function AlarmChecklist({
  projectName,
  alarms,
  onChange,
  onAdd,
  onDelete,
}: {
  projectName: string;
  alarms: AlarmItem[];
  onChange: (id: string, patch: Partial<AlarmItem>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  const counts = useMemo(() => alarmCounts(alarms), [alarms]);
  const pct = counts.total ? Math.round((counts.byStatus.verified / counts.total) * 100) : 0;
  const critPct = counts.criticalTotal
    ? Math.round((counts.criticalVerified / counts.criticalTotal) * 100)
    : 0;

  const visible = alarms.filter(
    (a) =>
      (groupFilter === "all" || a.group === groupFilter) &&
      (statusFilter === "all" || a.status === statusFilter) &&
      (categoryFilter === "all" || a.category === categoryFilter)
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportAlarmsToExcel(projectName, alarms);
      toast({ title: "Alarm checklist exported" });
    } catch (e: any) {
      toast({ title: e?.message || "Excel export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card data-testid="card-alarm-checklist">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" /> Alarm Checklist
          {alarms.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({alarms.length})</span>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={alarms.length === 0 || exporting}
            data-testid="button-export-alarms"
          >
            <Download className="h-4 w-4 mr-1" />
            {exporting ? "Exporting..." : "Export to Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={onAdd} data-testid="button-add-alarm">
            <Plus className="h-4 w-4 mr-1" /> Add Alarm
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {alarms.length > 0 && (
          <>
            {counts.criticalTotal > 0 && (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${
                  counts.criticalOpen > 0
                    ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    : "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                }`}
                data-testid="banner-critical-alarms"
              >
                <div className="flex items-center gap-2 font-semibold">
                  {counts.criticalOpen > 0 ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  {counts.criticalOpen > 0
                    ? `${counts.criticalOpen} of ${counts.criticalTotal} critical alarm${counts.criticalTotal !== 1 ? "s" : ""} not yet verified`
                    : `All ${counts.criticalTotal} critical alarm${counts.criticalTotal !== 1 ? "s" : ""} verified`}
                </div>
                <div className="flex min-w-[180px] flex-1 items-center gap-2 sm:max-w-xs">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/70 dark:bg-black/30">
                    <div
                      className={`h-full transition-all ${counts.criticalOpen > 0 ? "bg-red-600" : "bg-green-600"}`}
                      style={{ width: `${critPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">{critPct}%</span>
                </div>
                {counts.criticalOpen > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 bg-white dark:bg-transparent"
                    onClick={() => {
                      setCategoryFilter("critical");
                      setStatusFilter("all");
                      setGroupFilter("all");
                    }}
                    data-testid="button-show-critical"
                  >
                    Show critical only
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALARM_STATUS_VALUES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                  className={`rounded-md px-3 py-2 text-left transition ${ALARM_STATUS_STYLE[s].ui} ${
                    statusFilter === s ? "ring-2 ring-offset-2 ring-primary" : "opacity-95 hover:opacity-100"
                  }`}
                  data-testid={`tile-alarm-status-${s}`}
                >
                  <p className="text-xl font-bold leading-tight">{counts.byStatus[s]}</p>
                  <p className="text-[11px] leading-tight">{ALARM_STATUS_LABEL[s]}</p>
                </button>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Overall verification progress</span>
                <span>
                  {counts.byStatus.verified}/{counts.total} · {pct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-9" data-testid="select-alarm-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {ALARM_CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {ALARM_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="w-44 h-9" data-testid="select-alarm-group-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {ALARM_GROUP_VALUES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {ALARM_GROUP_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-52 h-9" data-testid="select-alarm-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ALARM_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ALARM_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(categoryFilter !== "all" || groupFilter !== "all" || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategoryFilter("all");
                    setGroupFilter("all");
                    setStatusFilter("all");
                  }}
                  data-testid="button-clear-alarm-filters"
                >
                  Clear filters
                </Button>
              )}
            </div>

            <AlarmLegend />
          </>
        )}

        {alarms.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No alarms yet. Click "Add Alarm" to start the checklist.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#4472C4] text-white">
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[16%]">Alarm Name</th>
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[26%]">Description</th>
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[11%]">Category</th>
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[14%]">Group</th>
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[17%]">Current Status</th>
                  <th className="border border-white px-2 py-2 text-left font-semibold w-[13%]">Verified By</th>
                  <th className="border border-white px-2 py-2 w-[3%]" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      No alarms match the current filters.
                    </td>
                  </tr>
                ) : (
                  visible.map((alarm, i) => (
                    <AlarmRow
                      key={alarm.id}
                      alarm={alarm}
                      index={i}
                      onChange={onChange}
                      onDelete={onDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProjectDeepDive() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [doc, setDoc] = useState<EquipmentDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploadingStationId, setUploadingStationId] = useState<string | null>(null);

  const { data: projectNames = [], isLoading: loadingProjects } = useQuery<string[]>({
    queryKey: ["/api/project-names"],
    queryFn: async () => {
      const r = await fetch("/api/project-names");
      if (!r.ok) throw new Error("Failed to load project list");
      return r.json();
    },
  });

  const { data: fetchedDoc, isLoading: loadingDoc } = useQuery<EquipmentDoc>({
    queryKey: ["/api/equipment-docs", selectedProject],
    queryFn: async () => {
      const r = await fetch(`/api/equipment-docs/${encodeURIComponent(selectedProject)}`);
      if (!r.ok) throw new Error("Failed to load equipment doc");
      return r.json();
    },
    enabled: !!selectedProject,
    staleTime: 0,
  });

  useEffect(() => {
    if (fetchedDoc) {
      setDoc(normalizeDoc(fetchedDoc, selectedProject));
      setDirty(false);
    } else if (!selectedProject) {
      setDoc(null);
    }
  }, [fetchedDoc, selectedProject]);

  const saveMutation = useMutation({
    mutationFn: async (payload: EquipmentDoc) => {
      // apiRequest returns a raw Response — parse it so state gets the saved doc
      const res = await apiRequest(
        "POST",
        `/api/equipment-docs/${encodeURIComponent(payload.projectName)}`,
        payload,
        true
      );
      return res.json();
    },
    onSuccess: (saved: any, payload) => {
      setDoc(normalizeDoc(saved, payload.projectName));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-docs", payload.projectName] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Save failed", variant: "destructive" }),
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (vars: { stationId: string; file: File }) => {
      const base64 = await fileToBase64(vars.file);
      const res = await apiRequest(
        "POST",
        `/api/equipment-docs/${encodeURIComponent(selectedProject)}/image`,
        { stationId: vars.stationId, filename: vars.file.name, base64 },
        true
      );
      return res.json();
    },
    onSuccess: (result: any, vars) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const updated: EquipmentDoc = {
          ...prev,
          stations: prev.stations.map((s) =>
            s.id === vars.stationId
              ? { ...s, images: [...s.images, { url: result.url, uploadedAt: result.uploadedAt }] }
              : s
          ),
        };
        // persist immediately so the uploaded image isn't lost if the user navigates away
        queueMicrotask(() => saveMutation.mutate(updated));
        return updated;
      });
      setUploadingStationId(null);
    },
    onError: (e: any) => {
      setUploadingStationId(null);
      toast({ title: e?.message || "Image upload failed", variant: "destructive" });
    },
  });

  function handleSelectProject(name: string) {
    setSelectedProject(name);
    setDoc(name ? blankDoc(name) : null);
    setDirty(false);
  }

  function updateDoc(patch: Partial<EquipmentDoc>) {
    setDoc((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  function updateStation(id: string, patch: Partial<StationDoc>) {
    setDoc((prev) =>
      prev
        ? { ...prev, stations: prev.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
        : prev
    );
    setDirty(true);
  }

  function addStation() {
    setDoc((prev) => {
      if (!prev) return prev;
      const station = newStation(prev.stations.length);
      return { ...prev, hasMultipleStations: true, stations: [...prev.stations, station] };
    });
    setDirty(true);
  }

  function deleteStation(id: string) {
    setDoc((prev) =>
      prev ? { ...prev, stations: prev.stations.filter((s) => s.id !== id) } : prev
    );
    setDirty(true);
  }

  function handleUploadImage(stationId: string, file: File) {
    setUploadingStationId(stationId);
    uploadImageMutation.mutate({ stationId, file });
  }

  function updateAlarm(id: string, patch: Partial<AlarmItem>) {
    setDoc((prev) =>
      prev
        ? { ...prev, alarms: prev.alarms.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
        : prev
    );
    setDirty(true);
  }

  function addAlarm() {
    setDoc((prev) => (prev ? { ...prev, alarms: [...prev.alarms, newAlarm()] } : prev));
    setDirty(true);
  }

  function deleteAlarm(id: string) {
    setDoc((prev) => (prev ? { ...prev, alarms: prev.alarms.filter((a) => a.id !== id) } : prev));
    setDirty(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Project Deep Dive</h1>
          <p className="text-sm text-muted-foreground">
            Macro-level equipment documentation — synopsis, PLC architecture, safety layout, alarm
            checklist and per-station breakdown for each project.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <label className="text-sm font-medium mb-1 block">Select Project</label>
            <Select value={selectedProject} onValueChange={handleSelectProject}>
              <SelectTrigger className="max-w-md" data-testid="select-project-filter">
                <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Choose a project"} />
              </SelectTrigger>
              <SelectContent>
                {projectNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!selectedProject && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Select a project above to view or create its equipment documentation.
            </CardContent>
          </Card>
        )}

        {selectedProject && loadingDoc && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading...</CardContent>
          </Card>
        )}

        {selectedProject && doc && !loadingDoc && (
          <>
            <div className="flex items-center justify-between sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
              <div className="text-sm text-muted-foreground">
                {doc.updatedAt && `Last updated ${new Date(doc.updatedAt).toLocaleString()}`}
              </div>
              <Button
                onClick={() => saveMutation.mutate(doc)}
                disabled={!dirty || saveMutation.isPending}
                data-testid="button-save-doc"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" /> Synopsis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="What is this equipment? Purpose, scope, key process it performs..."
                  value={doc.synopsis}
                  onChange={(e) => updateDoc({ synopsis: e.target.value })}
                  data-testid="textarea-synopsis"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4" /> PLC Architecture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="PLC make/model, CPU, rack layout, remote I/O, network topology (Ethernet/IP, Profinet...), redundancy..."
                  value={doc.plcArchitecture}
                  onChange={(e) => updateDoc({ plcArchitecture: e.target.value })}
                  data-testid="textarea-plc-architecture"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" /> Safety Layout &amp; Architecture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="Safety PLC/relays, e-stops, light curtains, interlocks, category/SIL/PL rating, safety network..."
                  value={doc.safetyLayout}
                  onChange={(e) => updateDoc({ safetyLayout: e.target.value })}
                  data-testid="textarea-safety-layout"
                />
              </CardContent>
            </Card>

            <AlarmChecklist
              projectName={doc.projectName || selectedProject}
              alarms={doc.alarms}
              onChange={updateAlarm}
              onAdd={addAlarm}
              onDelete={deleteAlarm}
            />

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Stations {doc.stations.length > 0 && `(${doc.stations.length})`}
              </h2>
              <Button variant="outline" onClick={addStation} data-testid="button-add-station">
                <Plus className="h-4 w-4 mr-2" /> Add Station
              </Button>
            </div>

            {doc.stations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  This equipment has no stations yet. Click "Add Station" if the equipment is
                  broken into multiple stations, otherwise leave empty for single-unit equipment.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {doc.stations.map((station, i) => (
                  <StationCard
                    key={station.id}
                    station={station}
                    index={i}
                    onChange={updateStation}
                    onDelete={deleteStation}
                    onUploadImage={handleUploadImage}
                    uploading={uploadingStationId === station.id}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-end pb-10">
              <Button
                onClick={() => saveMutation.mutate(doc)}
                disabled={!dirty || saveMutation.isPending}
                data-testid="button-save-doc-bottom"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
