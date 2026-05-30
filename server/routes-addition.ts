// ── DAILY REPORT ATTENDANCE ──────────────────────────────────────────────────
// Add this block inside registerRoutes(), just before the health check route.
// Saves/loads attendance data to daily-report-data.json in Controls_Team_Tracker.

interface DailyReportFile {
  attendance: Record<string, Record<string, Record<string, string>>>;
  // structure: attendance[year][month][engId][day] = value
  lastUpdated: string;
}

r.get("/daily-report-data", async (req, res) => {
  try {
    const { year, month } = req.query as { year?: string; month?: string };
    const f = await readJsonFile<DailyReportFile>("daily-report-data.json");
    if (!f) return res.json({ attendance: {} });
    if (year && month !== undefined) {
      const monthData = f.attendance?.[year]?.[month] ?? {};
      return res.json({ attendance: monthData });
    }
    res.json(f);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.post("/daily-report-data", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const { year, month, attendance } = req.body as {
      year?: string | number;
      month?: string | number;
      attendance?: Record<string, Record<string, string>>;
    };
    if (!year || month === undefined || !attendance)
      return res.status(400).json({ message: "year, month, attendance required" });

    const f = (await readJsonFile<DailyReportFile>("daily-report-data.json"))
      ?? { attendance: {}, lastUpdated: "" };

    const y = String(year);
    const m = String(month);
    if (!f.attendance[y]) f.attendance[y] = {};
    f.attendance[y][m] = attendance;
    f.lastUpdated = new Date().toISOString();

    await writeJsonFile(
      "daily-report-data.json", f,
      `Daily report save: ${y}-${String(parseInt(m)+1).padStart(2,"0")}`
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── END DAILY REPORT ATTENDANCE ──────────────────────────────────────────────
