// client/src/pages/WeeklyAssignments.tsx
// FIXED:
//   1) Engineer dropdown now loads from /api/engineers-master-list (correct endpoint + fallback chain)
//   2) After saving a weekly assignment, tasks are auto-synced to daily-activities for the week

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Edit2, Save, X, Calendar,
  ChevronDown, AlertCircle, CheckCircle2, Loader2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Engineer {
  id: string;
  name: string;
  initials?: string;
}

interface WeeklyTask {
  id: string;
  taskName: string;
  targetDate?: string;
  completionDate?: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  weekStart: string;
  projectName: string;
  projectTargetDate?: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
  internalTarget?: string;
  customerTarget?: string;
  tasks: WeeklyTask[];
  currentStatus: "not_started" | "in_progress" | "completed" | "on_hold" | "blocked";
  notes?: string;
  constraint?: string;
}

interface FormData {
  engineerName: string;
  projectName: string;
  projectTargetDate: string;
  resourceLockedFrom: string;
  resourceLockedTill: string;
  internalTarget: string;
  customerTarget: string;
  currentStatus: WeeklyAssignment["currentStatus"];
  notes: string;
  constraint: string;
}

const EMPTY_FORM: FormData = {
  engineerName: "",
  projectName: "",
  projectTargetDate: "",
  resourceLockedFrom: "",
  resourceLockedTill: "",
  internalTarget: "",
  customerTarget: "",
  currentStatus: "not_started",
  notes: "",
  constraint: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 6; i++) { // Mon–Sat (6 days)
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    not_started: "Not Started", in_progress: "In Progress",
    completed: "Completed", on_hold: "On Hold", blocked: "Blocked",
  };
  return map[s] || s;
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    on_hold: "bg-yellow-100 text-yellow-700",
    blocked: "bg-red-100 text-red-700",
  };
  return map[s] || "bg-gray-100 text-gray-600";
}

function getAdminHeader(): Record<string, string> {
  try {
    const user = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || "{}");
    if (user?.role === "admin" || user?.username === "admin") {
      return { "x-admin-auth": btoa(JSON.stringify(user)) };
    }
  } catch {}
  return {};
}

// ─── Auto-sync weekly tasks → daily-activities ────────────────────────────────
// When an assignment is saved/updated, push each task into targetTasks
// for every working day of that week.
async function syncWeeklyTasksToDailyActivities(assignment: WeeklyAssignment): Promise<void> {
  if (!assignment.projectName || !assignment.engineerName) return;

  const weekDates = getWeekDates(assignment.weekStart);
  const adminHeaders = getAdminHeader();
  const taskText = `[${assignment.projectName}] ${assignment.notes || assignment.constraint || "Weekly project task"}`;

  try {
    // Fetch current daily activities to avoid duplicates
    const existing = await fetch("/api/daily-activities?date=" + assignment.weekStart).then(r => r.json()).catch(() => []);
    const existingArr: any[] = Array.isArray(existing) ? existing : [];

    // For each working day in the week, add a target task for this engineer+project
    for (const date of weekDates) {
      // Check if this engineer already has this project task for this date
      const engineerEntry = existingArr.find(
        e => e.engineerName?.trim().toLowerCase() === assignment.engineerName.trim().toLowerCase() && e.date === date
      );
      const alreadyHasTask = engineerEntry?.targetTasks?.some(
        (t: any) => t.text?.includes(assignment.projectName)
      );
      if (alreadyHasTask) continue;

      await fetch(`/api/engineer-target-tasks/${encodeURIComponent(assignment.engineerName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders },
        body: JSON.stringify({ task: taskText, date }),
      });
    }
  } catch (e) {
    console.warn("syncWeeklyTasksToDailyActivities failed:", e);
    // Non-fatal — assignment is still saved
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WeeklyAssignments() {
  const navigate = useNavigate();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [engLoading, setEngLoading] = useState(true);
  const [engError, setEngError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<WeeklyAssignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Load engineers — try multiple endpoints with fallback ──────────────────
  const loadEngineers = useCallback(async () => {
    setEngLoading(true);
    setEngError(null);
    try {
      // Primary: engineers_master_list.json — returns [{id, name, initials}]
      const r1 = await fetch("/api/engineers-master-list");
      if (r1.ok) {
        const data = await r1.json();
        const list: Engineer[] = Array.isArray(data) ? data : [];
        if (list.length > 0) { setEngineers(list); setEngLoading(false); return; }
      }

      // Fallback 1: /api/engineers-master — same data, different route
      const r2 = await fetch("/api/engineers-master");
      if (r2.ok) {
        const data = await r2.json();
        const list: Engineer[] = Array.isArray(data) ? data : [];
        if (list.length > 0) { setEngineers(list); setEngLoading(false); return; }
      }

      // Fallback 2: /api/engineer-credentials (admin-only) — extract name list
      const r3 = await fetch("/api/engineer-credentials", {
        headers: getAdminHeader(),
      });
      if (r3.ok) {
        const data = await r3.json();
        const list: Engineer[] = (Array.isArray(data?.engineers) ? data.engineers : [])
          .filter((e: any) => e.role !== "admin" && e.isActive !== false)
          .map((e: any) => ({ id: e.id, name: e.name, initials: e.name?.slice(0, 2)?.toUpperCase() }));
        if (list.length > 0) { setEngineers(list); setEngLoading(false); return; }
      }

      // Fallback 3: /api/team-members
      const r4 = await fetch("/api/team-members");
      if (r4.ok) {
        const data = await r4.json();
        const list: Engineer[] = (Array.isArray(data) ? data : [])
          .map((e: any) => ({ id: e.id, name: e.name, initials: e.name?.slice(0, 2)?.toUpperCase() }));
        setEngineers(list);
        setEngLoading(false);
        return;
      }

      setEngError("No engineer list found. Please initialize engineers from Settings.");
    } catch (e: any) {
      setEngError(e.message ?? "Failed to load engineers");
    } finally {
      setEngLoading(false);
    }
  }, []);

  // ── Load assignments for selected week ─────────────────────────────────────
  const loadAssignments = useCallback(async () => {
    setAssignLoading(true);
    try {
      const res = await fetch(`/api/weekly-assignments?weekStart=${weekStart}`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to load assignments:", e);
    } finally {
      setAssignLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { loadEngineers(); }, [loadEngineers]);
  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  // ── Week navigation ────────────────────────────────────────────────────────
  function navigateWeek(direction: -1 | 1) {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + direction * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  }

  // ── Open modal ─────────────────────────────────────────────────────────────
  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setSaveError(null);
    setSaveSuccess(false);
    setShowModal(true);
  }

  function openEdit(a: WeeklyAssignment) {
    setForm({
      engineerName: a.engineerName,
      projectName: a.projectName,
      projectTargetDate: a.projectTargetDate ?? "",
      resourceLockedFrom: a.resourceLockedFrom ?? "",
      resourceLockedTill: a.resourceLockedTill ?? "",
      internalTarget: a.internalTarget ?? "",
      customerTarget: a.customerTarget ?? "",
      currentStatus: a.currentStatus,
      notes: a.notes ?? "",
      constraint: a.constraint ?? "",
    });
    setEditId(a.id);
    setSaveError(null);
    setSaveSuccess(false);
    setShowModal(true);
  }

  // ── Save assignment ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.engineerName) { setSaveError("Please select an engineer."); return; }
    if (!form.projectName.trim()) { setSaveError("Project name is required."); return; }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const adminHeaders = getAdminHeader();
      const payload = { ...form, weekStart };

      let savedAssignment: WeeklyAssignment;

      if (editId) {
        const res = await fetch(`/api/weekly-assignments/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...adminHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        savedAssignment = { ...updated, id: editId, weekStart, tasks: updated.tasks ?? [] };
      } else {
        const res = await fetch("/api/weekly-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        savedAssignment = await res.json();
      }

      // ✅ KEY FIX: Auto-sync this assignment's project into daily target tasks
      await syncWeeklyTasksToDailyActivities(savedAssignment);

      setSaveSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        loadAssignments();
      }, 800);
    } catch (e: any) {
      setSaveError(e.message ?? "Failed to save assignment");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete assignment ──────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!window.confirm("Delete this assignment?")) return;
    try {
      await fetch(`/api/weekly-assignments/${id}`, {
        method: "DELETE",
        headers: getAdminHeader(),
      });
      loadAssignments();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  // ── Group assignments by engineer ──────────────────────────────────────────
  const grouped = assignments.reduce((acc, a) => {
    const key = a.engineerName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {} as Record<string, WeeklyAssignment[]>);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition">
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" /> Weekly Engineer Assignments
            </h1>
            <p className="text-xs text-gray-400">{formatWeekLabel(weekStart)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Week navigation */}
          <div className="flex items-center gap-2 border rounded-lg overflow-hidden text-sm">
            <button onClick={() => navigateWeek(-1)} className="px-3 py-2 hover:bg-gray-50 transition">←</button>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(getMondayOfWeek(new Date(e.target.value)))}
              className="border-x px-2 py-2 text-xs focus:outline-none"
            />
            <button onClick={() => navigateWeek(1)} className="px-3 py-2 hover:bg-gray-50 transition">→</button>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition font-medium"
          >
            <Plus size={16} /> Add Assignment
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {assignLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-blue-500" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="bg-white rounded-xl border p-16 text-center">
            <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No assignments for this week</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add Assignment" to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([eng, list]) => (
              <div key={eng} className="bg-white rounded-xl border overflow-hidden shadow-sm">
                <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center">
                      {eng.trim().slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-semibold text-gray-800">{eng}</span>
                  </div>
                  <span className="text-xs text-gray-400">{list.length} project{list.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="divide-y">
                  {list.map(a => (
                    <div key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-gray-900 text-sm">{a.projectName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.currentStatus)}`}>
                            {statusLabel(a.currentStatus)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          {a.projectTargetDate && <span>Target: {a.projectTargetDate}</span>}
                          {a.resourceLockedFrom && <span>Locked: {a.resourceLockedFrom} → {a.resourceLockedTill}</span>}
                          {a.notes && <span className="italic text-gray-400">{a.notes}</span>}
                        </div>
                        {a.tasks.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {a.tasks.map(t => (
                              <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === "completed" ? "bg-green-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-gray-300"}`} />
                                {t.taskName}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? "Edit Weekly Assignment" : "Add Weekly Assignment"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Engineer dropdown — THE FIXED PART */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Engineer <span className="text-red-500">*</span>
                </label>
                {engLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 size={14} className="animate-spin" /> Loading engineers…
                  </div>
                ) : engError ? (
                  <div className="space-y-2">
                    <div className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle size={14} /> {engError}
                    </div>
                    <button onClick={loadEngineers} className="text-xs text-blue-600 underline">Retry</button>
                  </div>
                ) : engineers.length === 0 ? (
                  <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    No engineers found. Please go to Settings → Engineers and add engineers first.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={form.engineerName}
                      onChange={e => setForm(f => ({ ...f, engineerName: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8"
                    >
                      <option value="">Select engineer</option>
                      {engineers.map(e => (
                        <option key={e.id} value={e.name}>{e.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.projectName}
                  onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                  placeholder="Enter project name"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Two-column date fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Target Date</label>
                  <input type="date" value={form.projectTargetDate}
                    onChange={e => setForm(f => ({ ...f, projectTargetDate: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Internal Target</label>
                  <input type="date" value={form.internalTarget}
                    onChange={e => setForm(f => ({ ...f, internalTarget: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Resource Locked From</label>
                  <input type="date" value={form.resourceLockedFrom}
                    onChange={e => setForm(f => ({ ...f, resourceLockedFrom: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Resource Locked Till</label>
                  <input type="date" value={form.resourceLockedTill}
                    onChange={e => setForm(f => ({ ...f, resourceLockedTill: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Target Date</label>
                <input type="date" value={form.customerTarget}
                  onChange={e => setForm(f => ({ ...f, customerTarget: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <div className="relative">
                  <select
                    value={form.currentStatus}
                    onChange={e => setForm(f => ({ ...f, currentStatus: e.target.value as WeeklyAssignment["currentStatus"] }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes / Scope of Work</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes or scope of work"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Constraint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Constraint / Blockers</label>
                <textarea
                  value={form.constraint}
                  onChange={e => setForm(f => ({ ...f, constraint: e.target.value }))}
                  placeholder="Any constraints or blockers"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Info box about daily sync */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
                This assignment will automatically appear as a planned task in each engineer's daily report for every day this week.
              </div>

              {/* Error / success */}
              {saveError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 size={14} /> Assignment saved and synced to daily reports!
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
