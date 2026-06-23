// client/src/pages/blog.tsx
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { BlogCard } from "@/components/BlogCard";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Plus, X, Save, Trash2, Pin, Eye,
  Search, ChevronLeft, Edit2, Lock, Unlock, Download,
  BookOpen, RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ["All", "PLC", "HMI", "SCADA", "Project Update", "Training", "General"];
const CATEGORY_COLORS: Record<string, string> = {
  PLC:             "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300",
  HMI:             "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  SCADA:           "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300",
  "Project Update":"bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Training:        "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
  General:         "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
};
function catColor(c: string) { return CATEGORY_COLORS[c] ?? CATEGORY_COLORS.General; }

interface BlogPost {
  id: string; title: string; author: string; date: string;
  category: string; tags: string[]; coverImage: string;
  excerpt: string; content: string;
  isPinned: boolean; isPublished: boolean; createdAt: string;
}
const EMPTY_POST: Omit<BlogPost, "id" | "createdAt"> = {
  title: "", author: "Admin", date: new Date().toISOString().split("T")[0],
  category: "General", tags: [], coverImage: "", excerpt: "", content: "",
  isPinned: false, isPublished: true,
};

interface DraftMeta { key: string; code: string; name: string; savedAt: string }

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getAdminHeader(): string {
  try {
    const stored = sessionStorage.getItem("drb_admin");
    if (stored !== "1") return "";
    const name = sessionStorage.getItem("drb_admin_name") ?? "admin";
    return btoa(JSON.stringify({ username: name.toLowerCase(), role: "admin" }));
  } catch { return ""; }
}
function isAdminSession(): boolean {
  if (sessionStorage.getItem("drb_admin") === "1") return true;
  try {
    for (const k of ["user", "currentUser", "auth", "drb_user", "session"]) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj?.role === "admin" || obj?.username?.toLowerCase() === "admin") return true;
    }
  } catch {}
  return false;
}

// ── Excel helpers (SheetJS / xlsx — already installed, no extra npm needed) ───
function makeWs(
  title: string,
  headers: string[],
  rows: (string | number | boolean)[][],
  colWidths: number[]
): XLSX.WorkSheet {
  const aoa: (string | number | boolean)[][] = [
    [title],
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Merge title row across all columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  // Column widths
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
  // Freeze header row (row 3 = index 2)
  ws["!freeze"] = { xSplit: 0, ySplit: 3 };
  return ws;
}

function addSubSection(
  aoa: (string | number | boolean)[][],
  headers: string[],
  rows: (string | number | boolean)[][]
) {
  aoa.push([], headers, ...rows);
}

function v(el: Element | null): string {
  if (!el) return "";
  return ((el as HTMLInputElement | HTMLSelectElement).value ?? "").trim();
}
function radioVal(div: HTMLDivElement, name: string): string {
  return (div.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? "").trim();
}
function checkboxGroup(div: HTMLDivElement, name: string): string {
  return Array.from(div.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`))
    .map(el => el.value).filter(Boolean).join(", ");
}
function isChecked(div: HTMLDivElement, id: string): boolean {
  return (div.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BlogPage() {
  const [posts,        setPosts]        = useState<BlogPost[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [category,     setCategory]     = useState("All");
  const [selected,     setSelected]     = useState<BlogPost | null>(null);
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState<typeof EMPTY_POST & { id?: string; createdAt?: string }>(EMPTY_POST);
  const [saving,       setSaving]       = useState(false);
  const [tagInput,     setTagInput]     = useState("");
  const [adminMode,    setAdminMode]    = useState(isAdminSession());
  const [showLogin,    setShowLogin]    = useState(false);
  const [loginUser,    setLoginUser]    = useState("");
  const [loginPass,    setLoginPass]    = useState("");
  const [loginErr,     setLoginErr]     = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [adminUsers,   setAdminUsers]   = useState<{ username: string; password: string; name?: string }[]>([]);

  // Draft save / load
  const [draftStatus,   setDraftStatus]   = useState("");
  const [showDraftList, setShowDraftList] = useState(false);
  const [draftList,     setDraftList]     = useState<DraftMeta[]>([]);

  // Ref for form interactions
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Load auth list ──────────────────────────────────────────────────────────
  const loadAdmins = async () => {
    setLoginLoading(true);
    try {
      const r = await fetch("https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/engineers_auth.json?t=" + Date.now());
      const data = await r.json();
      const list = data.engineers || data;
      const admins = list.filter((u: any) => u.role === "admin" && u.isActive !== false);
      setAdminUsers(admins.length ? admins : [{ username: "admin", password: "admin@drb", name: "Admin" }]);
    } catch {
      setAdminUsers([{ username: "admin", password: "admin@drb", name: "Admin" }]);
    } finally { setLoginLoading(false); }
  };

  const submitLogin = () => {
    const un = loginUser.trim().toLowerCase();
    const match = adminUsers.find(u => u.username.toLowerCase() === un && u.password === loginPass);
    if (match) {
      sessionStorage.setItem("drb_admin", "1");
      sessionStorage.setItem("drb_admin_name", match.name || match.username);
      setAdminMode(true); setShowLogin(false);
      setLoginUser(""); setLoginPass(""); setLoginErr(false);
    } else { setLoginErr(true); setLoginPass(""); }
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const headers: Record<string, string> = {};
      const ah = getAdminHeader();
      if (ah) headers["x-admin-auth"] = ah;
      const r = await fetch("/api/blog-posts", { headers });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setPosts(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = posts.filter(p => {
    const matchCat = category === "All" || p.category === category;
    const q = search.toLowerCase();
    const matchQ = !q || p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    const matchPublished = isAdminSession() || p.isPublished;
    return matchCat && matchQ && matchPublished;
  });

  // ── Save post ───────────────────────────────────────────────────────────────
  const savePost = async () => {
    if (!draft.title.trim()) return alert("Title is required");
    setSaving(true);
    try {
      const isNew = !draft.id;
      const url = isNew ? "/api/blog-posts" : `/api/blog-posts/${draft.id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", "x-admin-auth": getAdminHeader() },
        body: JSON.stringify(draft),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message ?? "Save failed"); }
      await load(); setEditing(false);
    } catch (e: any) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post permanently?")) return;
    try {
      await fetch(`/api/blog-posts/${id}`, { method: "DELETE", headers: { "x-admin-auth": getAdminHeader() } });
      setSelected(null); await load();
    } catch (e: any) { alert("Delete failed: " + e.message); }
  };

  const openNew  = () => { setDraft({ ...EMPTY_POST }); setTagInput(""); setEditing(true); };
  const openEdit = (p: BlogPost) => { setDraft({ ...p }); setTagInput(p.tags.join(", ")); setEditing(true); };
  const addTag   = () => {
    const t = tagInput.trim();
    if (!t) return;
    setDraft(d => ({ ...d, tags: [...new Set([...d.tags, ...t.split(",").map(x => x.trim()).filter(Boolean)])] }));
    setTagInput("");
  };

  // ── DRAFT SAVE ──────────────────────────────────────────────────────────────
  const saveDraft = () => {
    const div = contentRef.current;
    if (!div) return;

    const data: Record<string, any> = {};

    // All inputs with IDs (text, date, number, select, textarea — not checkboxes/radios)
    div.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type=checkbox]):not([type=radio]), select, textarea"
    ).forEach(el => { if (el.id) data[el.id] = el.value; });

    // Named checkbox groups (multi-select)
    ["f_projType", "f_systems"].forEach(name => {
      data[`_chk_${name}`] = Array.from(
        div.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`)
      ).map(el => el.value);
    });

    // All named radio groups
    const radioNames = new Set<string>();
    div.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach(el => { if (el.name) radioNames.add(el.name); });
    radioNames.forEach(name => {
      const checked = div.querySelector<HTMLInputElement>(`[name="${name}"]:checked`);
      if (checked) data[`_radio_${name}`] = checked.value;
    });

    // Individual checkboxes with IDs (QA, closure)
    div.querySelectorAll<HTMLInputElement>("input[type=checkbox][id]").forEach(el => {
      data[`_bool_${el.id}`] = el.checked;
    });

    const projectCode = (div.querySelector<HTMLInputElement>("#f_projectCode"))?.value?.trim() || "draft";
    const projectName = (div.querySelector<HTMLInputElement>("#f_projectName"))?.value?.trim() || "Unnamed";

    const draftKey = `cpf_draft_${projectCode.replace(/\W/g, "_")}`;
    const draftObj = { code: projectCode, name: projectName, savedAt: new Date().toISOString(), data };
    localStorage.setItem(draftKey, JSON.stringify(draftObj));

    // Update index
    const index: string[] = JSON.parse(localStorage.getItem("cpf_draft_index") || "[]");
    if (!index.includes(draftKey)) { index.push(draftKey); localStorage.setItem("cpf_draft_index", JSON.stringify(index)); }

    setDraftStatus(`✅ Saved: ${projectName} (${projectCode})`);
    setTimeout(() => setDraftStatus(""), 3500);
  };

  // ── DRAFT LOAD ──────────────────────────────────────────────────────────────
  const loadDraft = (draftKey: string) => {
    const div = contentRef.current;
    if (!div) return;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    const draftObj = JSON.parse(raw);
    const data: Record<string, any> = draftObj.data;

    // Text / select / number fields
    Object.entries(data).forEach(([key, val]) => {
      if (key.startsWith("_")) return;
      const el = div.querySelector<HTMLInputElement | HTMLSelectElement>(`#${key}`);
      if (el && val !== undefined) (el as any).value = val;
    });

    // Named checkbox groups
    ["f_projType", "f_systems"].forEach(name => {
      const vals: string[] = data[`_chk_${name}`] || [];
      div.querySelectorAll<HTMLInputElement>(`[name="${name}"]`).forEach(el => { el.checked = vals.includes(el.value); });
    });

    // Named radio groups
    Object.entries(data).forEach(([key, val]) => {
      if (!key.startsWith("_radio_")) return;
      const name = key.replace("_radio_", "");
      const el = div.querySelector<HTMLInputElement>(`[name="${name}"][value="${val}"]`);
      if (el) el.checked = true;
    });

    // Individual checkboxes
    Object.entries(data).forEach(([key, val]) => {
      if (!key.startsWith("_bool_")) return;
      const id = key.replace("_bool_", "");
      const el = div.querySelector<HTMLInputElement>(`#${id}`);
      if (el) el.checked = !!val;
    });

    setShowDraftList(false);
    setDraftStatus(`📂 Loaded: ${draftObj.name}`);
    setTimeout(() => setDraftStatus(""), 3500);
  };

  // ── DELETE DRAFT ────────────────────────────────────────────────────────────
  const deleteDraft = (draftKey: string) => {
    localStorage.removeItem(draftKey);
    const index: string[] = JSON.parse(localStorage.getItem("cpf_draft_index") || "[]");
    localStorage.setItem("cpf_draft_index", JSON.stringify(index.filter(k => k !== draftKey)));
    setDraftList(prev => prev.filter(d => d.key !== draftKey));
  };

  const openDraftList = () => {
    const index: string[] = JSON.parse(localStorage.getItem("cpf_draft_index") || "[]");
    const list: DraftMeta[] = index.map(key => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { key, code: d.code, name: d.name, savedAt: d.savedAt };
    }).filter(Boolean) as DraftMeta[];
    setDraftList(list);
    setShowDraftList(true);
  };

  // ── DOWNLOAD EXCEL (SheetJS/xlsx — already installed, no extra dependency) ──
  const downloadExcel = () => {
    const div = contentRef.current;
    if (!div) return;

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Project Overview ─────────────────────────────────────────
    const s1 = makeWs(
      "CONTROLS PROJECT ALLOCATION & ASSIGNMENT",
      ["Field", "Value"],
      [
        ["Project Name",          v(div.querySelector("#f_projectName"))],
        ["Project Code",          v(div.querySelector("#f_projectCode"))],
        ["Client / Facility",     v(div.querySelector("#f_client"))],
        ["Project Manager",       v(div.querySelector("#f_projectManager"))],
        ["Start Date",            v(div.querySelector("#f_startDate"))],
        ["Target Completion",     v(div.querySelector("#f_completionDate"))],
        ["Budget Allocation",     v(div.querySelector("#f_budget"))],
        ["Prepared By",           v(div.querySelector("#f_preparedBy"))],
        ["Approved By",           v(div.querySelector("#f_approvedBy"))],
        ["Document Date",         v(div.querySelector("#f_docDate"))],
        ["Project Type",          checkboxGroup(div, "f_projType")],
        ["Priority Level",        radioVal(div, "f_priority")],
        ["Safety Classification", radioVal(div, "f_safety")],
      ],
      [30, 55]
    );
    XLSX.utils.book_append_sheet(wb, s1, "1. Project Overview");

    // ── Sheet 2: Scope & Systems ──────────────────────────────────────────
    const SYSTEMS: [string, string, string][] = [
      ["f_sys_plc","PLC Programming",           "f_sys_plc_note"],
      ["f_sys_hmi","HMI / SCADA Development",   "f_sys_hmi_note"],
      ["f_sys_mcs","Motor Control Systems",      "f_sys_mcs_note"],
      ["f_sys_ins","Instrumentation & Sensors",  "f_sys_ins_note"],
      ["f_sys_net","Industrial Networks",         "f_sys_net_note"],
      ["f_sys_saf","Safety Systems (SIL Rated)", "f_sys_saf_note"],
      ["f_sys_pcs","Process Control Systems",    "f_sys_pcs_note"],
      ["f_sys_rob","Robotics Integration",       "f_sys_rob_note"],
      ["f_sys_vis","Vision Systems",             "f_sys_vis_note"],
      ["f_sys_drv","Drive Systems (VFDs/Servo)", "f_sys_drv_note"],
    ];
    const sysRows = SYSTEMS.map(([cbId, label, noteId], i) => [
      i + 1,
      label,
      div.querySelector<HTMLInputElement>(`#${cbId}`)?.checked ? "Yes" : "No",
      v(div.querySelector(`#${noteId}`)),
    ]);
    const delRows: (string | number)[][] = [];
    for (let i = 1; i <= 5; i++) delRows.push([i, v(div.querySelector(`#f_del${i}`))]);

    const s2aoa: (string | number)[][] = [
      ["PROJECT SCOPE & TECHNICAL REQUIREMENTS"],
      [],
      ["AUTOMATION SYSTEMS INVOLVED"],
      ["#", "System / Scope", "Included", "Brand / Standard / Details"],
      ...sysRows,
      [],
      ["KEY DELIVERABLES"],
      ["#", "Description"],
      ...delRows,
    ];
    const s2 = XLSX.utils.aoa_to_sheet(s2aoa);
    s2["!cols"] = [{ wch: 6 }, { wch: 34 }, { wch: 10 }, { wch: 45 }];
    s2["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 14, c: 0 }, e: { r: 14, c: 3 } },
    ];
    XLSX.utils.book_append_sheet(wb, s2, "2. Scope & Systems");

    // ── Sheet 3: Team Assignment ──────────────────────────────────────────
    const s3 = makeWs(
      "TEAM ASSIGNMENT MATRIX",
      ["Team Member","Role / Specialization","Primary Tasks","Hours","Start Date","End Date","Dependencies"],
      Array.from({ length: 6 }, (_, i) => [
        v(div.querySelector(`#f_tm${i}_name`)),
        v(div.querySelector(`#f_tm${i}_role`)),
        v(div.querySelector(`#f_tm${i}_tasks`)),
        v(div.querySelector(`#f_tm${i}_hrs`)),
        v(div.querySelector(`#f_tm${i}_start`)),
        v(div.querySelector(`#f_tm${i}_end`)),
        v(div.querySelector(`#f_tm${i}_dep`)),
      ]),
      [22, 24, 28, 8, 12, 12, 26]
    );
    XLSX.utils.book_append_sheet(wb, s3, "3. Team Assignment");

    // ── Sheet 4: Skill Requirements ───────────────────────────────────────
    const SKILLS = [
      "PLC Programming (Brand Specific)","HMI Development",
      "Industrial Safety Certification","Electrical Installation",
      "Instrumentation Calibration","Network Configuration","Client Site Access / Clearance",
    ];
    const s4 = makeWs(
      "SKILL REQUIREMENTS & CERTIFICATIONS",
      ["Certification","Assigned Team Member","Status","Notes"],
      SKILLS.map((sk, i) => [
        sk,
        v(div.querySelector(`#f_sk${i}_member`)),
        radioVal(div, `f_sk${i}_status`),
        v(div.querySelector(`#f_sk${i}_notes`)),
      ]),
      [36, 24, 20, 32]
    );
    XLSX.utils.book_append_sheet(wb, s4, "4. Skill Requirements");

    // ── Sheet 5: Project Phases ───────────────────────────────────────────
    const phaseHdr = ["Task","Assigned To","Duration","Start Date","End Date","Status","Notes"];
    const p1rows = [
      ["System Architecture Design", v(div.querySelector("#f_p1_arch_to")), v(div.querySelector("#f_p1_arch_dur")), v(div.querySelector("#f_p1_arch_start")), v(div.querySelector("#f_p1_arch_end")), radioVal(div,"f_p1_arch_st"), v(div.querySelector("#f_p1_arch_notes"))],
      ["I/O List Development",        v(div.querySelector("#f_p1_io_to")),   v(div.querySelector("#f_p1_io_dur")),   v(div.querySelector("#f_p1_io_start")),   v(div.querySelector("#f_p1_io_end")),   radioVal(div,"f_p1_io_st"),   v(div.querySelector("#f_p1_io_notes"))],
      ["Control Logic Design",         v(div.querySelector("#f_p1_ctrl_to")),v(div.querySelector("#f_p1_ctrl_dur")),v(div.querySelector("#f_p1_ctrl_start")),v(div.querySelector("#f_p1_ctrl_end")),radioVal(div,"f_p1_ctrl_st"),v(div.querySelector("#f_p1_ctrl_notes"))],
      ["HMI Screen Design",            v(div.querySelector("#f_p1_hmi_to")), v(div.querySelector("#f_p1_hmi_dur")), v(div.querySelector("#f_p1_hmi_start")), v(div.querySelector("#f_p1_hmi_end")), radioVal(div,"f_p1_hmi_st"), v(div.querySelector("#f_p1_hmi_notes"))],
      ["Safety System Design",         v(div.querySelector("#f_p1_saf_to")), v(div.querySelector("#f_p1_saf_dur")), v(div.querySelector("#f_p1_saf_start")), v(div.querySelector("#f_p1_saf_end")), radioVal(div,"f_p1_saf_st"), v(div.querySelector("#f_p1_saf_notes"))],
    ];
    const p2rows = [
      ["PLC Program Development", v(div.querySelector("#f_p2_plc_to")),v(div.querySelector("#f_p2_plc_dur")),v(div.querySelector("#f_p2_plc_start")),v(div.querySelector("#f_p2_plc_end")),radioVal(div,"f_p2_plc_st"),v(div.querySelector("#f_p2_plc_notes"))],
      ["HMI Development",          v(div.querySelector("#f_p2_hmi_to")),v(div.querySelector("#f_p2_hmi_dur")),v(div.querySelector("#f_p2_hmi_start")),v(div.querySelector("#f_p2_hmi_end")),radioVal(div,"f_p2_hmi_st"),v(div.querySelector("#f_p2_hmi_notes"))],
      ["Simulation Testing",        v(div.querySelector("#f_p2_sim_to")),v(div.querySelector("#f_p2_sim_dur")),v(div.querySelector("#f_p2_sim_start")),v(div.querySelector("#f_p2_sim_end")),radioVal(div,"f_p2_sim_st"),v(div.querySelector("#f_p2_sim_notes"))],
      ["FAT Preparation",           v(div.querySelector("#f_p2_fat_to")),v(div.querySelector("#f_p2_fat_dur")),v(div.querySelector("#f_p2_fat_start")),v(div.querySelector("#f_p2_fat_end")),radioVal(div,"f_p2_fat_st"),v(div.querySelector("#f_p2_fat_notes"))],
      ["Documentation Creation",    v(div.querySelector("#f_p2_doc_to")),v(div.querySelector("#f_p2_doc_dur")),v(div.querySelector("#f_p2_doc_start")),v(div.querySelector("#f_p2_doc_end")),radioVal(div,"f_p2_doc_st"),v(div.querySelector("#f_p2_doc_notes"))],
    ];
    const p3rows = [
      ["Hardware Installation",      v(div.querySelector("#f_p3_hw_to")), v(div.querySelector("#f_p3_hw_dur")), v(div.querySelector("#f_p3_hw_start")), v(div.querySelector("#f_p3_hw_end")), radioVal(div,"f_p3_hw_st"), v(div.querySelector("#f_p3_hw_notes"))],
      ["System Wiring",              v(div.querySelector("#f_p3_wir_to")),v(div.querySelector("#f_p3_wir_dur")),v(div.querySelector("#f_p3_wir_start")),v(div.querySelector("#f_p3_wir_end")),radioVal(div,"f_p3_wir_st"),v(div.querySelector("#f_p3_wir_notes"))],
      ["Software Download & Config", v(div.querySelector("#f_p3_sw_to")), v(div.querySelector("#f_p3_sw_dur")), v(div.querySelector("#f_p3_sw_start")), v(div.querySelector("#f_p3_sw_end")), radioVal(div,"f_p3_sw_st"), v(div.querySelector("#f_p3_sw_notes"))],
      ["System Integration Testing", v(div.querySelector("#f_p3_sit_to")),v(div.querySelector("#f_p3_sit_dur")),v(div.querySelector("#f_p3_sit_start")),v(div.querySelector("#f_p3_sit_end")),radioVal(div,"f_p3_sit_st"),v(div.querySelector("#f_p3_sit_notes"))],
      ["Operator Training",          v(div.querySelector("#f_p3_trn_to")),v(div.querySelector("#f_p3_trn_dur")),v(div.querySelector("#f_p3_trn_start")),v(div.querySelector("#f_p3_trn_end")),radioVal(div,"f_p3_trn_st"),v(div.querySelector("#f_p3_trn_notes"))],
      ["System Handover",            v(div.querySelector("#f_p3_hnd_to")),v(div.querySelector("#f_p3_hnd_dur")),v(div.querySelector("#f_p3_hnd_start")),v(div.querySelector("#f_p3_hnd_end")),radioVal(div,"f_p3_hnd_st"),v(div.querySelector("#f_p3_hnd_notes"))],
    ];
    const s5aoa = [
      ["PROJECT PHASES & MILESTONES"],
      [],
      ["▶ PHASE 1: DESIGN & ENGINEERING"],
      phaseHdr, ...p1rows,
      [],
      ["▶ PHASE 2: DEVELOPMENT & TESTING"],
      phaseHdr, ...p2rows,
      [],
      ["▶ PHASE 3: INSTALLATION & COMMISSIONING"],
      phaseHdr, ...p3rows,
    ];
    const s5 = XLSX.utils.aoa_to_sheet(s5aoa);
    s5["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 28 }];
    s5["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 9, c: 0 }, e: { r: 9, c: 6 } },
      { s: { r: 16, c: 0 }, e: { r: 16, c: 6 } },
    ];
    XLSX.utils.book_append_sheet(wb, s5, "5. Project Phases");

    // ── Sheet 6: Resources ────────────────────────────────────────────────
    const EQ_NAMES = ["Laptop / Programming Software","PLC Hardware","Test Equipment (Multimeter etc.)","Safety Equipment (PPE)","Vehicle / Transportation"];
    const s6aoa = [
      ["RESOURCE REQUIREMENTS"],
      [],
      ["EQUIPMENT & TOOLS"],
      ["Item","Qty","Assigned To","Required Date","Status"],
      ...EQ_NAMES.map((name, i) => [name, v(div.querySelector(`#f_eq${i}_qty`)), v(div.querySelector(`#f_eq${i}_to`)), v(div.querySelector(`#f_eq${i}_reqdate`)), radioVal(div, `f_eq${i}_st`)]),
      [],
      ["SOFTWARE LICENSES"],
      ["Software","Version","Assigned User","License Status","Expiry Date"],
      ...Array.from({ length: 3 }, (_, i) => [v(div.querySelector(`#f_sw${i}_name`)), v(div.querySelector(`#f_sw${i}_ver`)), v(div.querySelector(`#f_sw${i}_user`)), radioVal(div, `f_sw${i}_st`), v(div.querySelector(`#f_sw${i}_expiry`))]),
    ];
    const s6 = XLSX.utils.aoa_to_sheet(s6aoa);
    s6["!cols"] = [{ wch: 34 }, { wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 18 }];
    s6["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
      { s: { r: 9, c: 0 }, e: { r: 9, c: 4 } },
    ];
    XLSX.utils.book_append_sheet(wb, s6, "6. Resources");

    // ── Sheet 7: Communication ────────────────────────────────────────────
    const STAKEHOLDERS = ["Client Project Manager","Site Supervisor","Operations Manager","Maintenance Team Lead"];
    const s7 = makeWs(
      "COMMUNICATION PLAN",
      ["Stakeholder","Role","Contact Method","Frequency","Assigned Team Member"],
      STAKEHOLDERS.map((sh, i) => [sh, v(div.querySelector(`#f_comm${i}_role`)), v(div.querySelector(`#f_comm${i}_contact`)), v(div.querySelector(`#f_comm${i}_freq`)), v(div.querySelector(`#f_comm${i}_member`))]),
      [28, 22, 24, 16, 26]
    );
    XLSX.utils.book_append_sheet(wb, s7, "7. Communication");

    // ── Sheet 8: Risk Assessment ──────────────────────────────────────────
    const RISKS = ["Equipment Delivery Delays","Site Access Restrictions","Technical Skill Gaps","Safety Incidents"];
    const s8 = makeWs(
      "RISK ASSESSMENT & MITIGATION",
      ["Risk Factor","Probability","Impact","Mitigation Strategy","Responsible Person"],
      RISKS.map((r, i) => [r, radioVal(div, `f_risk${i}_prob`), radioVal(div, `f_risk${i}_impact`), v(div.querySelector(`#f_risk${i}_mit`)), v(div.querySelector(`#f_risk${i}_resp`))]),
      [30, 14, 14, 36, 24]
    );
    XLSX.utils.book_append_sheet(wb, s8, "8. Risk Assessment");

    // ── Sheet 9: QA Checklist ─────────────────────────────────────────────
    const DR  = ["System architecture reviewed and approved","Safety systems validated","Client requirements verified","Code standards compliance checked"];
    const TV  = ["Unit testing completed","Integration testing passed","FAT successfully conducted","Performance benchmarks met"];
    const DC  = ["As-built drawings updated","Operation manuals completed","Maintenance procedures documented","Training materials prepared"];
    const s9aoa = [
      ["QUALITY ASSURANCE CHECKLIST"],
      [],
      ["Design Review","Status","Testing & Validation","Status","Documentation","Status"],
      ...DR.map((item, i) => [
        item, isChecked(div, `f_qa_dr${i}`) ? "✔ Done" : "Pending",
        TV[i], isChecked(div, `f_qa_tv${i}`) ? "✔ Done" : "Pending",
        DC[i], isChecked(div, `f_qa_dc${i}`) ? "✔ Done" : "Pending",
      ]),
    ];
    const s9 = XLSX.utils.aoa_to_sheet(s9aoa);
    s9["!cols"] = [{ wch: 36 }, { wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 36 }, { wch: 12 }];
    s9["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    XLSX.utils.book_append_sheet(wb, s9, "9. QA Checklist");

    // ── Sheet 10: Project Status ──────────────────────────────────────────
    const s10aoa = [
      ["PROJECT STATUS TRACKING"],
      [],
      ["WEEKLY PROGRESS REPORT"],
      ["Week Ending","Progress %","Issues / Blockers","Next Week Priorities","Team Member Updates"],
      ...Array.from({ length: 3 }, (_, i) => [v(div.querySelector(`#f_wk${i}_end`)), v(div.querySelector(`#f_wk${i}_pct`)), v(div.querySelector(`#f_wk${i}_issues`)), v(div.querySelector(`#f_wk${i}_pri`)), v(div.querySelector(`#f_wk${i}_updates`))]),
      [],
      ["CHANGE MANAGEMENT"],
      ["CR #","Date","Requested By","Description","Impact Assessment","Approval Status","Impl. Date"],
      ...Array.from({ length: 3 }, (_, i) => [v(div.querySelector(`#f_cr${i}_num`)), v(div.querySelector(`#f_cr${i}_date`)), v(div.querySelector(`#f_cr${i}_by`)), v(div.querySelector(`#f_cr${i}_desc`)), v(div.querySelector(`#f_cr${i}_impact`)), radioVal(div, `f_cr${i}_st`), v(div.querySelector(`#f_cr${i}_impl`))]),
    ];
    const s10 = XLSX.utils.aoa_to_sheet(s10aoa);
    s10["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 12 }];
    s10["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 6 } },
    ];
    XLSX.utils.book_append_sheet(wb, s10, "10. Project Status");

    // ── Sheet 11: Project Closure ─────────────────────────────────────────
    const PC_ITEMS = [
      ["f_pc0","All systems tested and operational"],
      ["f_pc1","Client training completed"],
      ["f_pc2","Documentation handed over"],
      ["f_pc3","Warranty terms explained"],
      ["f_pc4","Support procedures established"],
      ["f_pc5","Project retrospective conducted"],
      ["f_pc6","Lessons learned documented"],
    ];
    const s11aoa = [
      ["PROJECT CLOSURE"],
      [],
      ["FINAL DELIVERABLES CHECKLIST"],
      ["Item","Status"],
      ...PC_ITEMS.map(([id, label]) => [label, isChecked(div, id) ? "✔ Done" : "Pending"]),
      [],
      ["TEAM PERFORMANCE REVIEW"],
      ["Team Member","Contributions","Performance Rating","Key Development Areas"],
      ...Array.from({ length: 3 }, (_, i) => [v(div.querySelector(`#f_tp${i}_member`)), v(div.querySelector(`#f_tp${i}_contrib`)), radioVal(div, `f_tp${i}_rating`), v(div.querySelector(`#f_tp${i}_areas`))]),
    ];
    const s11 = XLSX.utils.aoa_to_sheet(s11aoa);
    s11["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 22 }, { wch: 32 }];
    s11["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 11, c: 0 }, e: { r: 11, c: 3 } },
    ];
    XLSX.utils.book_append_sheet(wb, s11, "11. Project Closure");

    // ── Write & trigger download ──────────────────────────────────────────
    XLSX.writeFile(wb, (selected?.title || "project").replace(/[^a-zA-Z0-9]/g, "_") + ".xlsx");
  };

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected && !editing) return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        {/* Button bar */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelected(null)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {adminMode && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => openEdit(selected)}>
                <Edit2 className="h-4 w-4" /> Edit
              </Button>
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => deletePost(selected.id)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
          {/* Save / Load draft — available to all */}
          <Button variant="outline" size="sm" className="gap-2" onClick={saveDraft}>
            <Save className="h-4 w-4" /> Save Draft
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={openDraftList}>
            <BookOpen className="h-4 w-4" /> Load Draft
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadExcel}>
            <Download className="h-4 w-4" /> Download Excel
          </Button>
        </div>

        {/* Draft status toast */}
        {draftStatus && (
          <div className="mb-4 px-4 py-2 rounded-lg text-sm font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
            {draftStatus}
          </div>
        )}

        {/* Draft picker modal */}
        {showDraftList && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border rounded-xl shadow-2xl p-6 w-96 space-y-3 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Saved Drafts
                </h2>
                <button onClick={() => setShowDraftList(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {draftList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No saved drafts found.</p>
              ) : (
                draftList.map(d => (
                  <div key={d.key} className="flex items-center gap-2 border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.code} · {new Date(d.savedAt).toLocaleString("en-IN")}</p>
                    </div>
                    <Button size="sm" onClick={() => loadDraft(d.key)}>Load</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteDraft(d.key)}><X className="h-3 w-3" /></Button>
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowDraftList(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {selected.coverImage && (
          <img src={selected.coverImage} alt={selected.title}
            className="w-full h-56 object-cover rounded-xl mb-6"
            onError={e => (e.currentTarget.style.display = "none")} />
        )}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${catColor(selected.category)}`}>{selected.category}</span>
          {selected.isPinned && <span className="text-xs text-amber-600 font-medium">📌 Pinned</span>}
          {!selected.isPublished && <span className="text-xs text-red-500 font-medium">Draft</span>}
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">{selected.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {selected.author} · {new Date(selected.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        {selected.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {selected.tags.map(t => <span key={t} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">#{t}</span>)}
          </div>
        )}
        {/* Single content div with ref */}
        <div
          ref={contentRef}
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: selected.content }}
        />
      </main>
    </>
  );

  // ── Editor ──────────────────────────────────────────────────────────────────
  if (editing) return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold">{draft.id ? "Edit post" : "New post"}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={savePost} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save post"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Post title"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input">
              {CATEGORIES.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Cover Image URL</label>
            <input value={draft.coverImage} onChange={e => setDraft(d => ({ ...d, coverImage: e.target.value }))}
              placeholder="https://raw.githubusercontent.com/..."
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
            <textarea value={draft.excerpt} onChange={e => setDraft(d => ({ ...d, excerpt: e.target.value }))} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input resize-none" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Content (HTML)</label>
            <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} rows={16}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input resize-y font-mono" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                placeholder="e.g. PLC, SIEMENS"
                className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
              <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {draft.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                  {t}<button onClick={() => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))}><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-4 items-center sm:col-span-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={draft.isPinned} onChange={e => setDraft(d => ({ ...d, isPinned: e.target.checked }))} className="rounded" />
              <Pin className="h-4 w-4 text-amber-500" /> Pin this post
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={draft.isPublished ?? true} onChange={e => setDraft(d => ({ ...d, isPublished: e.target.checked }))} className="rounded" />
              <Eye className="h-4 w-4 text-green-500" /> Publish
            </label>
          </div>
        </div>
      </main>
    </>
  );

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      <main className="mx-auto max-w-[98vw] xl:max-w-6xl px-4 py-8 md:px-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Knowledge Base</h1>
            <p className="text-muted-foreground text-sm">Automation insights and technical updates from the Controls team</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {adminMode ? (
              <>
                <Button size="sm" onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> New post</Button>
                <Button variant="destructive" size="sm" className="gap-2" onClick={() => { sessionStorage.removeItem("drb_admin"); setAdminMode(false); }}>
                  <Unlock className="h-4 w-4" /> Lock
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { setShowLogin(true); setLoginErr(false); loadAdmins(); }}>
                <Lock className="h-4 w-4" /> Admin Mode
              </Button>
            )}
            <Link href="/"><Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button></Link>
          </div>
        </div>

        {/* Admin login modal */}
        {showLogin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border rounded-xl shadow-2xl p-6 w-80 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Admin Login</h2>
              {loginLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />Loading…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <input type="text" placeholder="e.g. admin" value={loginUser} autoFocus
                      onChange={e => { setLoginUser(e.target.value); setLoginErr(false); }}
                      onKeyDown={e => e.key === "Enter" && submitLogin()}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <input type="password" placeholder="Enter password" value={loginPass}
                      onChange={e => { setLoginPass(e.target.value); setLoginErr(false); }}
                      onKeyDown={e => e.key === "Enter" && submitLogin()}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary ${loginErr ? "border-red-500" : "border-input"}`} />
                  </div>
                  {loginErr && <p className="text-xs text-red-500">Incorrect username or password.</p>}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={submitLogin} disabled={loginLoading} className="flex-1">Login</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowLogin(false); setLoginUser(""); setLoginPass(""); setLoginErr(false); }} className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts…"
              className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${category === c ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-input text-muted-foreground"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-12 justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="text-muted-foreground text-sm">Loading posts…</span>
          </div>
        )}
        {error && <div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm">⚠ {error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No posts found.</p>
            {adminMode && <Button variant="outline" size="sm" onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4" />Create first post</Button>}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(post => <BlogCard key={post.id} post={post} onClick={() => setSelected(post)} />)}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} post{filtered.length !== 1 ? "s" : ""} · Data stored in Controls_Team_Tracker GitHub repo
        </p>
      </main>
    </>
  );
}
