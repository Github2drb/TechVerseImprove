// client/src/pages/EngineerReports.tsx
// FIXED: Null-safe data loading. Empty state shown gracefully instead of crash.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, CheckCircle2, Target, User, AlertCircle } from "lucide-react";

interface DailyEntry {
  engineerName: string;
  date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

export default function EngineerReports() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/daily-activities?date=${date}`, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const raw = await res.json();
        // Guard: API should return an array; if not, fall back to empty
        setEntries(Array.isArray(raw) ? raw : []);
      } catch (e: any) {
        console.error("EngineerReports load error:", e);
        setError(e.message ?? "Failed to load reports");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 transition"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Engineer Daily Reports</h1>
            <p className="text-sm text-gray-500">{formatDate(date)}</p>
          </div>
        </div>
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Loading reports…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="bg-white rounded-xl border p-16 flex flex-col items-center text-center">
          <div className="rounded-full bg-gray-100 p-5 mb-4">
            <User size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium">No activities logged for {formatDate(date)}</p>
          <p className="text-gray-400 text-sm mt-1">
            Engineers can log activities from their dashboard.
          </p>
          {date !== todayISO() && (
            <button
              onClick={() => setDate(todayISO())}
              className="mt-4 text-blue-600 text-sm hover:underline"
            >
              View today's reports
            </button>
          )}
        </div>
      )}

      {/* Engineer cards */}
      {!loading && entries.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map((entry) => {
            // Defensive: guard arrays inside each entry
            const targetTasks = Array.isArray(entry.targetTasks) ? entry.targetTasks : [];
            const completedActivities = Array.isArray(entry.completedActivities) ? entry.completedActivities : [];
            const completedCount = completedActivities.length;
            const targetCount = targetTasks.length;
            const rate = targetCount > 0 ? Math.round((completedCount / targetCount) * 100) : 0;

            return (
              <div key={entry.engineerName} className="bg-white rounded-xl border p-5 shadow-sm">
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                      {entry.engineerName.trim().slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{entry.engineerName}</p>
                      <p className="text-xs text-gray-400">{completedCount}/{targetCount} tasks done</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      rate === 100 ? "bg-green-100 text-green-700" :
                      rate >= 50  ? "bg-yellow-100 text-yellow-700" :
                                    "bg-red-100 text-red-600"
                    }`}
                  >
                    {rate}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="bg-gray-100 rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      rate === 100 ? "bg-green-500" : rate >= 50 ? "bg-yellow-400" : "bg-red-400"
                    }`}
                    style={{ width: `${rate}%` }}
                  />
                </div>

                {/* Planned tasks */}
                {targetTasks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <Target size={12} /> Planned
                    </p>
                    <ul className="space-y-1">
                      {targetTasks.map((t) => (
                        <li key={t.id} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                          {t.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Completed activities */}
                {completedActivities.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-green-500" /> Completed
                    </p>
                    <ul className="space-y-1">
                      {completedActivities.map((a) => (
                        <li key={a.id} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <CheckCircle2 size={12} className="mt-0.5 text-green-500 flex-shrink-0" />
                          {a.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {targetTasks.length === 0 && completedActivities.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No tasks logged for this date.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
