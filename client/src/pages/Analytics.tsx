// client/src/pages/Analytics.tsx
// FIXED: All .map() calls are guarded — API returning undefined/null no longer crashes the page.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Users, FolderOpen, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface AnalyticsSummary {
  totalProjects: number;
  completedProjects: number;
  inProgressProjects: number;
  onHoldProjects: number;
  completionRate: number;
}

interface EngineerStat {
  name: string;
  totalProjects: number;
  completedProjects: number;
  activeProjects: number;
  completionRate: number;
}

interface StatusDistribution {
  status: string;
  count: number;
}

interface RecentActivity {
  projectName: string;
  date: string;
  activity: string;
  status: string;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  engineerStats: EngineerStat[];
  statusDistribution: StatusDistribution[];
  recentActivities: RecentActivity[];
}

// Safe default so we never have undefined arrays
const EMPTY_DATA: AnalyticsData = {
  summary: { totalProjects: 0, completedProjects: 0, inProgressProjects: 0, onHoldProjects: 0, completionRate: 0 },
  engineerStats: [],
  statusDistribution: [],
  recentActivities: [],
};

export default function Analytics() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/analytics", {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const raw = await res.json();

        // Defensive normalisation — guard every field individually
        setData({
          summary: raw?.summary ?? EMPTY_DATA.summary,
          engineerStats: Array.isArray(raw?.engineerStats) ? raw.engineerStats : [],
          statusDistribution: Array.isArray(raw?.statusDistribution) ? raw.statusDistribution : [],
          recentActivities: Array.isArray(raw?.recentActivities) ? raw.recentActivities : [],
        });
      } catch (e: any) {
        console.error("Analytics load error:", e);
        setError(e.message ?? "Failed to load analytics");
        setData(EMPTY_DATA);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const { summary, engineerStats, statusDistribution, recentActivities } = data;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 transition"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 size={24} className="text-blue-600" /> Analytics
          </h1>
          <p className="text-sm text-gray-500">Project and engineer performance overview</p>
        </div>
      </div>

      {/* Error banner — non-fatal, shows data even if stale */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} />
          {error} — showing last available data.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard icon={<FolderOpen size={20} />} label="Total Projects" value={summary.totalProjects} color="blue" />
        <SummaryCard icon={<CheckCircle2 size={20} />} label="Completed" value={summary.completedProjects} color="green" />
        <SummaryCard icon={<TrendingUp size={20} />} label="In Progress" value={summary.inProgressProjects} color="yellow" />
        <SummaryCard icon={<Clock size={20} />} label="On Hold" value={summary.onHoldProjects} color="gray" />
      </div>

      {/* Completion rate */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-2">Overall Completion Rate</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className="bg-green-500 h-4 rounded-full transition-all duration-700"
              style={{ width: `${summary.completionRate}%` }}
            />
          </div>
          <span className="text-xl font-bold text-green-600">{summary.completionRate}%</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Status distribution */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FolderOpen size={18} /> Status Distribution
          </h2>
          {statusDistribution.length === 0 ? (
            <p className="text-gray-400 text-sm">No project data available yet.</p>
          ) : (
            <div className="space-y-3">
              {statusDistribution.map((s) => (
                <div key={s.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{s.status}</span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${statusColor(s.status)}`}
                      style={{ width: `${summary.totalProjects > 0 ? Math.round(s.count / summary.totalProjects * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activities */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={18} /> Recent Project Activities
          </h2>
          {recentActivities.length === 0 ? (
            <p className="text-gray-400 text-sm">No recent activities logged yet.</p>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto">
              {recentActivities.map((a, i) => (
                <div key={i} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">
                  <span className="text-sm font-medium text-gray-800">{a.projectName}</span>
                  <span className="text-xs text-gray-500">{a.date} — {a.activity}</span>
                  <span className="text-xs text-blue-600">{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Engineer stats table */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users size={18} /> Engineer Performance
        </h2>
        {engineerStats.length === 0 ? (
          <p className="text-gray-400 text-sm">No engineer data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pb-2 pr-4">Engineer</th>
                  <th className="pb-2 pr-4 text-center">Total</th>
                  <th className="pb-2 pr-4 text-center">Active</th>
                  <th className="pb-2 pr-4 text-center">Completed</th>
                  <th className="pb-2 text-center">Rate</th>
                </tr>
              </thead>
              <tbody>
                {engineerStats.map((e) => (
                  <tr key={e.name} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-800">{e.name}</td>
                    <td className="py-2 pr-4 text-center">{e.totalProjects}</td>
                    <td className="py-2 pr-4 text-center text-blue-600">{e.activeProjects}</td>
                    <td className="py-2 pr-4 text-center text-green-600">{e.completedProjects}</td>
                    <td className="py-2 text-center">
                      <span className={`font-semibold ${e.completionRate >= 75 ? "text-green-600" : e.completionRate >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                        {e.completionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    yellow: "text-yellow-600 bg-yellow-50",
    gray: "text-gray-600 bg-gray-100",
  };
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colors[color]}`}>{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "completed": return "bg-green-500";
    case "in progress": return "bg-blue-500";
    case "on hold": return "bg-yellow-500";
    default: return "bg-gray-400";
  }
}
