import { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINEERS_URL =
  "https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/engineers_master_list.json";
const MASTER_SITE_URL =
  "https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/master_site.json";

const DEFAULT_SITE = "3D CAD U1";

// Leave / absence codes (also valid "site" assignments)
const LEAVE_CODES = [
  { code: "Leave", label: "Leave", color: "#f87171", bg: "#450a0a" },
  { code: "RH",    label: "RH – Restricted Holiday", color: "#fbbf24", bg: "#451a03" },
  { code: "CL",    label: "CL – Casual Leave",        color: "#fb923c", bg: "#431407" },
  { code: "EL",    label: "EL – Earned Leave",         color: "#a78bfa", bg: "#2e1065" },
  { code: "COff",  label: "C.Off – Comp Off",          color: "#34d399", bg: "#022c22" },
];

const LEAVE_SET = new Set(LEAVE_CODES.map((l) => l.code));

// Fallback site list when master_site.json doesn't exist yet
const FALLBACK_SITES = ["3D CAD U1", "Daikin", "TKM", "GE", "EY"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function dayLabel(year, month, d) {
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(year, month, d).getDay()];
}

function isWeekend(year, month, d) {
  const day = new Date(year, month, d).getDay();
  return day === 0 || day === 6;
}

function monthName(month) {
  return new Date(2000, month).toLocaleString("default", { month: "long" });
}

function leaveInfo(code) {
  return LEAVE_CODES.find((l) => l.code === code) || null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EngineerTracker() {
  const { year, month, day: todayDay } = today();
  const totalDays = daysInMonth(year, month);

  const [engineers, setEngineers] = useState([]);
  const [siteList, setSiteList]   = useState(FALLBACK_SITES);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // attendance[engId][day] = site name or leave code
  const [attendance, setAttendance] = useState({});

  // Admin mode toggle
  const [adminMode, setAdminMode]   = useState(false);
  const [adminPass, setAdminPass]   = useState("");
  const [showPassDlg, setShowPassDlg] = useState(false);
  const ADMIN_PASSWORD = "drb2024"; // change as needed

  // Popup state for site selection
  const [popup, setPopup]           = useState(null); // { engId, day, x, y }
  const popupRef                    = useRef(null);

  // Admin: add new site
  const [newSiteName, setNewSiteName] = useState("");

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [engRes, siteRes] = await Promise.allSettled([
          fetch(ENGINEERS_URL),
          fetch(MASTER_SITE_URL),
        ]);

        let engs = [];
        if (engRes.status === "fulfilled" && engRes.value.ok) {
          const json = await engRes.value.json();
          engs = json.engineers || [];
        } else {
          throw new Error("Could not load engineers list from GitHub.");
        }

        let sites = FALLBACK_SITES;
        if (siteRes.status === "fulfilled" && siteRes.value.ok) {
          const json = await siteRes.value.json();
          sites = json.sites || FALLBACK_SITES;
        }
        // else master_site.json doesn't exist yet – use fallback silently

        setEngineers(engs);
        setSiteList(sites);

        // Init attendance: weekends blank, weekdays → DEFAULT_SITE
        const init = {};
        engs.forEach((eng) => {
          init[eng.id] = {};
          for (let d = 1; d <= totalDays; d++) {
            init[eng.id][d] = isWeekend(year, month, d) ? "" : DEFAULT_SITE;
          }
        });
        setAttendance(init);
        setLoading(false);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, []);

  // Close popup on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const openPopup = (engId, day, e) => {
    if (!adminMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({ engId, day, x: rect.left, y: rect.bottom + window.scrollY + 4 });
  };

  const assignSite = (engId, day, value) => {
    setAttendance((prev) => ({
      ...prev,
      [engId]: { ...prev[engId], [day]: value },
    }));
    setPopup(null);
  };

  const addSite = () => {
    const name = newSiteName.trim();
    if (!name || siteList.includes(name)) return;
    setSiteList((prev) => [...prev, name]);
    setNewSiteName("");
  };

  const removeSite = (site) => {
    if (site === DEFAULT_SITE) return; // can't remove default
    setSiteList((prev) => prev.filter((s) => s !== site));
  };

  const tryAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) {
      setAdminMode(true);
      setShowPassDlg(false);
      setAdminPass("");
    } else {
      alert("Incorrect password");
    }
  };

  // ── Cell value display ───────────────────────────────────────────────────────

  const cellValue = (engId, day) => attendance[engId]?.[day] ?? "";

  const cellStyle = (engId, day) => {
    const val = cellValue(engId, day);
    const isToday_ = day === todayDay;
    const weekend  = isWeekend(year, month, day);
    const lv       = leaveInfo(val);

    return {
      base: {
        background: isToday_
          ? "rgba(239,68,68,0.13)"
          : weekend
          ? "rgba(255,255,255,0.02)"
          : "transparent",
        borderLeft: isToday_ ? "2px solid rgba(239,68,68,0.6)" : undefined,
        borderRight: isToday_ ? "2px solid rgba(239,68,68,0.6)" : undefined,
      },
      chip: lv
        ? { background: lv.bg, color: lv.color, border: `1px solid ${lv.color}40` }
        : val
        ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)" }
        : { background: "rgba(255,255,255,0.04)", color: "#475569", border: "1px solid rgba(255,255,255,0.06)" },
    };
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={styles.centred}>
      <div style={styles.spinner} />
      <p style={{ color: "#94a3b8", marginTop: 16, fontFamily: "monospace" }}>Loading team data…</p>
    </div>
  );

  if (error) return (
    <div style={styles.centred}>
      <p style={{ color: "#f87171", fontFamily: "monospace" }}>⚠ {error}</p>
    </div>
  );

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const allSiteOptions = [...siteList, ...LEAVE_CODES.map((l) => l.code)];

  return (
    <div style={styles.root}>
      {/* ── Top bar ── */}
      <div style={styles.topBar}>
        <div>
          <div style={styles.brand}>
            <span style={{ color: "#f97316", fontSize: 22 }}>⚙</span>
            DRB TechVerse
          </div>
          <div style={styles.subtitle}>Controls Team · Site & Attendance Tracker</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={styles.monthBadge}>{monthName(month)} {year}</div>
          {adminMode ? (
            <button style={styles.btnDanger} onClick={() => setAdminMode(false)}>
              🔓 Exit Admin
            </button>
          ) : (
            <button style={styles.btnAdmin} onClick={() => setShowPassDlg(true)}>
              🔒 Admin Mode
            </button>
          )}
        </div>
      </div>

      {/* ── Admin password dialog ── */}
      {showPassDlg && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h3 style={{ color: "#f1f5f9", margin: "0 0 14px", fontSize: 16 }}>🔐 Admin Login</h3>
            <input
              type="password"
              placeholder="Enter admin password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
              style={styles.input}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={styles.btnAdmin} onClick={tryAdminLogin}>Login</button>
              <button style={styles.btnGhost} onClick={() => { setShowPassDlg(false); setAdminPass(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: site list manager ── */}
      {adminMode && (
        <div style={styles.siteManager}>
          <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            📋 Manage Sites
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {siteList.map((site) => (
              <span key={site} style={styles.sitePill}>
                {site}
                {site !== DEFAULT_SITE && (
                  <button style={styles.pillRemove} onClick={() => removeSite(site)} title="Remove site">×</button>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              placeholder="Add new site…"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSite()}
              style={{ ...styles.input, maxWidth: 220, fontSize: 12, padding: "6px 10px" }}
            />
            <button style={styles.btnAdmin} onClick={addSite}>+ Add</button>
          </div>
          <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 11 }}>
            Click any cell to assign a site or leave code for that engineer on that day.
          </p>
        </div>
      )}

      {/* ── Legend ── */}
      <div style={styles.legend}>
        <span style={styles.legendItem("rgba(99,102,241,0.18)", "#a5b4fc")}>🏢 Site</span>
        {LEAVE_CODES.map((lv) => (
          <span key={lv.code} style={styles.legendItem(lv.bg, lv.color)}>
            {lv.code} – {lv.label.split("–")[1]?.trim() || lv.label}
          </span>
        ))}
        <span style={styles.legendItem("rgba(239,68,68,0.13)", "#fca5a5")}>📅 Today</span>
      </div>

      {/* ── Table ── */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            {/* Day-name row */}
            <tr>
              <th style={{ ...styles.th, ...styles.stickyCol(0), minWidth: 160 }}>Engineer</th>
              {days.map((d) => (
                <th key={d} style={{
                  ...styles.th,
                  background: d === todayDay ? "rgba(220,38,38,0.85)" : isWeekend(year, month, d) ? "#0d1625" : "#1e293b",
                  color: d === todayDay ? "#fff" : isWeekend(year, month, d) ? "#334155" : "#94a3b8",
                  fontWeight: d === todayDay ? 800 : 600,
                  fontSize: 10,
                  padding: "8px 2px 2px",
                  minWidth: 62,
                }}>
                  {dayLabel(year, month, d)}
                </th>
              ))}
            </tr>
            {/* Day-number row */}
            <tr>
              <th style={{ ...styles.th, ...styles.stickyCol(0), background: "#0f172a", borderTop: "none" }} />
              {days.map((d) => (
                <th key={d} style={{
                  ...styles.th,
                  background: d === todayDay ? "rgba(185,28,28,0.85)" : isWeekend(year, month, d) ? "#0d1625" : "#1e293b",
                  color: d === todayDay ? "#fff" : isWeekend(year, month, d) ? "#1e293b" : "#64748b",
                  fontWeight: d === todayDay ? 900 : 700,
                  fontSize: 13,
                  padding: "2px 2px 9px",
                  borderTop: "none",
                }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {engineers.map((eng, ei) => (
              <tr key={eng.id}
                style={{ background: ei % 2 === 0 ? "#0f172a" : "#0a1120" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2540")}
                onMouseLeave={(e) => (e.currentTarget.style.background = ei % 2 === 0 ? "#0f172a" : "#0a1120")}
              >
                {/* Name */}
                <td style={{ ...styles.td, ...styles.stickyCol(0), background: ei % 2 === 0 ? "#0f172a" : "#0a1120" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={styles.avatar}>{eng.initials}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                      {eng.name}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {days.map((d) => {
                  const val  = cellValue(eng.id, d);
                  const cs   = cellStyle(eng.id, d);
                  const lv   = leaveInfo(val);
                  const weekend = isWeekend(year, month, d);
                  const isToday_ = d === todayDay;

                  return (
                    <td key={d}
                      style={{ ...styles.td, ...cs.base, cursor: adminMode && !weekend ? "pointer" : "default", padding: "5px 3px", textAlign: "center" }}
                      onClick={(e) => !weekend && openPopup(eng.id, d, e)}
                      title={adminMode && !weekend ? `Click to assign – ${eng.name} · ${d} ${monthName(month)}` : val}
                    >
                      {val ? (
                        <span style={{ ...styles.chip, ...cs.chip, fontSize: val.length > 7 ? 9 : 10 }}>
                          {val}
                        </span>
                      ) : (
                        <span style={{ color: "#1e3a5f", fontSize: 10 }}>{weekend ? "—" : ""}</span>
                      )}
                      {isToday_ && (
                        <div style={{
                          position: "absolute", inset: 0,
                          border: "2px solid rgba(239,68,68,0.5)",
                          pointerEvents: "none",
                          borderRadius: 0,
                        }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Site/Leave selector popup ── */}
      {popup && (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            top: Math.min(popup.y, window.innerHeight - 320),
            left: Math.min(popup.x, window.innerWidth - 240),
            zIndex: 9999,
            background: "#1e293b",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            width: 230,
            padding: 10,
          }}
        >
          <div style={{ color: "#64748b", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, padding: "0 4px" }}>
            Assign Site · Day {popup.day}
          </div>

          {/* Sites */}
          <div style={{ color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 4px 2px" }}>Sites</div>
          {siteList.map((site) => (
            <div key={site}
              style={styles.popupOption(cellValue(popup.engId, popup.day) === site)}
              onClick={() => assignSite(popup.engId, popup.day, site)}
            >
              🏢 {site}
            </div>
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "6px 0" }} />

          {/* Leave codes */}
          <div style={{ color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 4px" }}>Leave / Absence</div>
          {LEAVE_CODES.map((lv) => (
            <div key={lv.code}
              style={{
                ...styles.popupOption(cellValue(popup.engId, popup.day) === lv.code),
                color: lv.color,
              }}
              onClick={() => assignSite(popup.engId, popup.day, lv.code)}
            >
              {lv.label}
            </div>
          ))}

          {/* Clear */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "6px 0" }} />
          <div style={{ ...styles.popupOption(false), color: "#64748b" }}
            onClick={() => assignSite(popup.engId, popup.day, DEFAULT_SITE)}>
            ↩ Reset to default ({DEFAULT_SITE})
          </div>
        </div>
      )}

      <div style={styles.footer}>
        {adminMode
          ? "Admin Mode active · Click any weekday cell to assign a site or leave type"
          : "View only · Enable Admin Mode to make changes"}
      </div>
    </div>
  );
}

// ── Style definitions ─────────────────────────────────────────────────────────

const styles = {
  root: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    background: "linear-gradient(160deg, #060d1a 0%, #0f172a 60%, #0a1629 100%)",
    minHeight: "100vh",
    padding: "20px 14px 40px",
    color: "#e2e8f0",
  },
  centred: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: "60vh",
  },
  spinner: {
    width: 40, height: 40,
    border: "3px solid rgba(99,102,241,0.2)",
    borderTop: "3px solid #818cf8",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  topBar: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    flexWrap: "wrap", gap: 12, marginBottom: 18,
  },
  brand: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 20, fontWeight: 800, color: "#f1f5f9", letterSpacing: "0.02em",
  },
  subtitle: {
    color: "#475569", fontSize: 12, marginTop: 2, letterSpacing: "0.05em",
  },
  monthBadge: {
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.35)",
    color: "#a5b4fc",
    borderRadius: 20, padding: "4px 14px",
    fontSize: 13, fontWeight: 700,
  },
  btnAdmin: {
    background: "rgba(99,102,241,0.2)",
    border: "1px solid rgba(99,102,241,0.5)",
    color: "#a5b4fc",
    borderRadius: 8, padding: "6px 14px",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  btnDanger: {
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.5)",
    color: "#fca5a5",
    borderRadius: 8, padding: "6px 14px",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#64748b",
    borderRadius: 8, padding: "6px 14px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10000,
  },
  dialog: {
    background: "#1e293b",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 24, minWidth: 280,
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  },
  input: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "8px 12px",
    fontSize: 13,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  },
  siteManager: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(99,102,241,0.25)",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 16,
  },
  sitePill: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(99,102,241,0.18)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#a5b4fc",
    borderRadius: 20, padding: "3px 10px",
    fontSize: 11, fontWeight: 600,
  },
  pillRemove: {
    background: "none", border: "none", color: "#f87171",
    cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
  },
  legend: {
    display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14,
  },
  legendItem: (bg, color) => ({
    background: bg, color,
    border: `1px solid ${color}40`,
    borderRadius: 20, padding: "3px 10px",
    fontSize: 10, fontWeight: 600,
    whiteSpace: "nowrap",
  }),
  tableWrap: {
    overflowX: "auto",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    minWidth: 900,
    background: "#0f172a",
  },
  th: {
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "9px 3px",
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    userSelect: "none",
    background: "#1e293b",
    color: "#94a3b8",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  td: {
    border: "1px solid rgba(255,255,255,0.06)",
    padding: "5px 4px",
    verticalAlign: "middle",
    position: "relative",
  },
  stickyCol: (left) => ({
    position: "sticky",
    left,
    zIndex: 3,
    background: "#0f172a",
  }),
  chip: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 6px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
    maxWidth: 58,
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.4,
  },
  avatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28, height: 28,
    borderRadius: "50%",
    background: "rgba(99,102,241,0.2)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#a5b4fc",
    fontSize: 9,
    fontWeight: 800,
    flexShrink: 0,
    letterSpacing: "-0.02em",
  },
  popupOption: (active) => ({
    padding: "7px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? "#fff" : "#cbd5e1",
    background: active ? "rgba(99,102,241,0.3)" : "transparent",
    marginBottom: 2,
    transition: "background 0.1s",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
  footer: {
    textAlign: "center",
    marginTop: 20,
    color: "#334155",
    fontSize: 11,
    letterSpacing: "0.04em",
  },
};
