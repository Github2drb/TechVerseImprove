import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { ArrowLeft, Lock, Unlock, Plus, X, Save, Download } from "lucide-react";

// ── GitHub Data Sources ────────────────────────────────────────────────────────
const ENGINEERS_URL  = "https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/engineers_master_list.json";
const MASTER_SITE_URL= "https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/master_site.json";
const AUTH_URL       = "https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/engineers_auth.json";

const DEFAULT_SITE = "3D CAD U1";

// ── Leave / Absence Codes ──────────────────────────────────────────────────────
const LEAVE_CODES = [
  { code:"Leave", label:"Leave",               color:"bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" },
  { code:"RH",    label:"RH – Restricted Holiday", color:"bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" },
  { code:"CL",    label:"CL – Casual Leave",   color:"bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" },
  { code:"EL",    label:"EL – Earned Leave",   color:"bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800" },
  { code:"COff",  label:"COff – Comp Off",     color:"bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-800" },
  { code:"FH",    label:"FH – First Half",     color:"bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800" },
  { code:"WP+",   label:"WP+ – Work Plus",     color:"bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800" },
];
const FALLBACK_SITES = ["3D CAD U1","Daikin","TKM","GE","EY"];

// ── Helpers ────────────────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) { return new Date(year, month+1, 0).getDate(); }
function getDayLabel(year: number, month: number, d: number) { return ["Su","Mo","Tu","We","Th","Fr","Sa"][new Date(year,month,d).getDay()]; }
function isWeekend(year: number, month: number, d: number) { const day=new Date(year,month,d).getDay(); return day===0||day===6; }
function getMonthName(month: number) { return new Date(2000,month).toLocaleString("default",{month:"long"}); }
function leaveInfo(code: string) { return LEAVE_CODES.find(l=>l.code===code)||null; }

// Build x-admin-auth header value
function makeAuthHeader(username: string, role: string): string {
  return btoa(JSON.stringify({ username, role }));
}

interface Engineer  { id:string; name:string; initials:string; }
interface AdminUser { username:string; password:string; name?:string; role?:string; isActive?:boolean; }

// ── Component ──────────────────────────────────────────────────────────────────
export default function DailyReport() {
  const now       = new Date();
  const year      = now.getFullYear();
  const month     = now.getMonth();
  const todayDay  = now.getDate();
  const totalDays = getDaysInMonth(year, month);
  const days      = Array.from({length:totalDays},(_,i)=>i+1);

  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [siteList,  setSiteList]  = useState<string[]>(FALLBACK_SITES);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string|null>(null);

  // attendance[engId][day] = site name or leave code
  const [attendance, setAttendance] = useState<Record<string,Record<number,string>>>({});

  // Admin
  const [adminMode,    setAdminMode]    = useState(false);
  const [adminName,    setAdminName]    = useState("");
  const [adminRole,    setAdminRole]    = useState("admin");
  const [adminUser,    setAdminUser]    = useState("admin");
  const [showPassDlg,  setShowPassDlg]  = useState(false);
  const [adminUsers,   setAdminUsers]   = useState<AdminUser[]>([]);
  const [authLoading,  setAuthLoading]  = useState(false);
  const [inputUser,    setInputUser]    = useState("");
  const [inputPass,    setInputPass]    = useState("");
  const [passError,    setPassError]    = useState(false);

  // Save status
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");

  // Popup for cell assignment
  const [popup, setPopup] = useState<{engId:string;day:number;top:number;left:number}|null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Table scroll ref — used to auto-scroll to today on load
  const tableRef = useRef<HTMLDivElement>(null);

  // Admin: new site input
  const [newSite, setNewSite] = useState("");

  // ── Fetch engineers, sites, and saved attendance ─────────────────────────────
  useEffect(()=>{
    (async()=>{
      try {
        const [engRes, siteRes] = await Promise.allSettled([
          fetch(ENGINEERS_URL),
          fetch(MASTER_SITE_URL),
        ]);

        let engs: Engineer[] = [];
        if (engRes.status==="fulfilled"&&engRes.value.ok) {
          const json = await engRes.value.json();
          engs = json.engineers||[];
        } else throw new Error("Could not load engineers list from GitHub.");

        let sites = FALLBACK_SITES;
        if (siteRes.status==="fulfilled"&&siteRes.value.ok) {
          const json = await siteRes.value.json();
          if (json.sites?.length) sites = json.sites;
        }

        setEngineers(engs);
        setSiteList(sites);

        // Build default attendance (weekdays = DEFAULT_SITE, weekends = "")
        const init: Record<string,Record<number,string>> = {};
        engs.forEach(eng=>{
          init[eng.id]={};
          for (let d=1;d<=totalDays;d++) {
            init[eng.id][d] = isWeekend(year,month,d) ? "" : DEFAULT_SITE;
          }
        });

        // Load saved attendance from GitHub via backend API
        try {
          const saved = await fetch(`/api/daily-report-data?year=${year}&month=${month}`);
          if (saved.ok) {
            const json = await saved.json();
            const savedAttendance: Record<string,Record<string,string>> = json.attendance||{};
            // Merge saved data over defaults (saved overrides default)
            Object.keys(savedAttendance).forEach(id=>{
              if (init[id]) {
                Object.keys(savedAttendance[id]).forEach(day=>{
                  init[id][parseInt(day)] = savedAttendance[id][day];
                });
              }
            });
          }
        } catch { /* use defaults if API unreachable */ }

        setAttendance(init);
        setLoading(false);
      } catch(e:any) { setError(e.message); setLoading(false); }
    })();
  },[]);

  // Scroll table so today is the first visible column
  const scrollToToday = () => {
    if (!tableRef.current) return;
    tableRef.current.scrollLeft = (todayDay - 1) * 62;
  };

  // Auto-scroll on load
  useEffect(()=>{
    if (!loading) setTimeout(scrollToToday, 80);
  },[loading]);

  // Close popup on outside click
  useEffect(()=>{
    const handler=(e:MouseEvent)=>{
      if (popupRef.current&&!popupRef.current.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  // ── Fetch admin credentials when dialog opens ────────────────────────────────
  const openLoginDialog = async()=>{
    setShowPassDlg(true);
    setInputUser(""); setInputPass(""); setPassError(false);
    setAuthLoading(true);
    try {
      const res = await fetch(AUTH_URL+"?t="+Date.now());
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: AdminUser[] = data.engineers||data;
      const admins = list.filter(u=>u.role==="admin"&&u.isActive!==false);
      setAdminUsers(admins.length ? admins : [{username:"admin",password:"admin@drb",name:"Admin",role:"admin"}]);
    } catch {
      setAdminUsers([{username:"admin",password:"admin@drb",name:"Admin",role:"admin"}]);
    } finally { setAuthLoading(false); }
  };

  // ── Save to GitHub via backend API ───────────────────────────────────────────
  const saveToGitHub = async()=>{
    if (!adminMode) return;
    setSaveStatus("saving");
    try {
      // Convert number keys to string for JSON
      const serialised: Record<string,Record<string,string>> = {};
      Object.keys(attendance).forEach(id=>{
        serialised[id]={};
        Object.keys(attendance[id]).forEach(day=>{
          serialised[id][day] = attendance[id][parseInt(day)];
        });
      });

      const res = await fetch("/api/daily-report-data",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-admin-auth": makeAuthHeader(adminUser, adminRole),
        },
        body: JSON.stringify({ year, month, attendance: serialised }),
      });

      if (!res.ok) { const j=await res.json(); throw new Error(j.message||"Save failed"); }
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2500);
    } catch(e:any) {
      setSaveStatus("error");
      setTimeout(()=>setSaveStatus("idle"),3000);
      alert("Save failed: "+e.message);
    }
  };

  // ── Export CSV to local file ─────────────────────────────────────────────────
  const exportCSV=()=>{
    const header=["Engineer",...days.map(d=>`${d}-${getMonthName(month).slice(0,3)}-${year}`)];
    const rows=engineers.map(eng=>[eng.name,...days.map(d=>cellVal(eng.id,d)||"")]);
    const csv=[header,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`attendance_${getMonthName(month)}_${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Login / logout ───────────────────────────────────────────────────────────
  const tryLogin=()=>{
    const un=inputUser.trim().toLowerCase();
    const pw=inputPass;
    const match=adminUsers.find(u=>u.username.toLowerCase()===un&&u.password===pw);
    if (match) {
      setAdminMode(true);
      setAdminName(match.name||match.username);
      setAdminUser(match.username);
      setAdminRole(match.role||"admin");
      setShowPassDlg(false);
      setInputUser(""); setInputPass(""); setPassError(false);
    } else {
      setPassError(true); setInputPass("");
    }
  };

  // ── Cell popup ───────────────────────────────────────────────────────────────
  const openPopup=(engId:string,day:number,e:React.MouseEvent<HTMLTableCellElement>)=>{
    if (!adminMode) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const POPUP_H=340, POPUP_W=224;
    let top=rect.top-POPUP_H-6; if(top<8) top=rect.bottom+6;
    let left=rect.left; if(left+POPUP_W>window.innerWidth-8) left=window.innerWidth-POPUP_W-8; if(left<8) left=8;
    setPopup({engId,day,top,left});
  };

  const assignSite=(engId:string,day:number,value:string)=>{
    setAttendance(prev=>({...prev,[engId]:{...prev[engId],[day]:value}}));
    setPopup(null);
  };

  const addSite=()=>{
    const name=newSite.trim();
    if (!name||siteList.includes(name)) return;
    setSiteList(prev=>[...prev,name]); setNewSite("");
  };
  const removeSite=(site:string)=>{ if(site===DEFAULT_SITE) return; setSiteList(prev=>prev.filter(s=>s!==site)); };

  const cellVal=(engId:string,day:number)=>attendance[engId]?.[day]??"";
  const chipClass=(val:string)=>{
    const lv=leaveInfo(val);
    if(lv) return `${lv.color} border text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap`;
    if(val) return "bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap";
    return "";
  };

  const saveBtnLabel = saveStatus==="saving"?"Saving…":saveStatus==="saved"?"Saved ✓":saveStatus==="error"?"Error!":"Save";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <Header searchQuery="" onSearchChange={()=>{}} />
      <main className="mx-auto max-w-[98vw] xl:max-w-7xl space-y-6 px-4 py-8 md:px-6 md:py-10">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Daily Report</h1>
            <p className="text-muted-foreground">
              Engineer site &amp; attendance tracker — {getMonthName(month)} {year}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {adminMode && (
              <Button size="sm" onClick={saveToGitHub} disabled={saveStatus==="saving"}
                className={`gap-2 ${saveStatus==="error"?"bg-red-600 hover:bg-red-700":saveStatus==="saved"?"bg-green-600 hover:bg-green-700":""}`}>
                <Save className="h-4 w-4"/>{saveBtnLabel}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4"/>Export CSV
            </Button>
            {adminMode ? (
              <Button variant="destructive" size="sm" className="gap-2"
                onClick={()=>{setAdminMode(false);setAdminName("");}}>
                <Unlock className="h-4 w-4"/>Exit Admin ({adminName})
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={openLoginDialog}>
                <Lock className="h-4 w-4"/>Admin Mode
              </Button>
            )}
            <Link href="/"><Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4"/>Back</Button></Link>
          </div>
        </div>

        {/* Admin login dialog */}
        {showPassDlg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border rounded-xl shadow-2xl p-6 w-80 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Lock className="h-4 w-4"/>Admin Login</h2>
              {authLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"/>Loading credentials…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <input type="text" placeholder="e.g. admin" value={inputUser} autoComplete="username"
                      onChange={e=>{setInputUser(e.target.value);setPassError(false);}}
                      onKeyDown={e=>e.key==="Enter"&&tryLogin()}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" autoFocus/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <input type="password" placeholder="Enter password" value={inputPass} autoComplete="current-password"
                      onChange={e=>{setInputPass(e.target.value);setPassError(false);}}
                      onKeyDown={e=>e.key==="Enter"&&tryLogin()}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary ${passError?"border-red-500":"border-input"}`}/>
                  </div>
                  {passError&&<p className="text-xs text-red-500">Incorrect username or password. Try again.</p>}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={tryLogin} disabled={authLoading} className="flex-1">Login</Button>
                <Button size="sm" variant="outline" onClick={()=>{setShowPassDlg(false);setInputUser("");setInputPass("");setPassError(false);}} className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Admin: site manager */}
        {adminMode && (
          <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Manage Sites</p>
            <div className="flex flex-wrap gap-2">
              {siteList.map(site=>(
                <span key={site} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  {site}
                  {site!==DEFAULT_SITE&&<button onClick={()=>removeSite(site)} className="ml-1 text-red-400 hover:text-red-600"><X className="h-3 w-3"/></button>}
                </span>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input placeholder="Add new site…" value={newSite} onChange={e=>setNewSite(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addSite()}
                className="border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input w-52"/>
              <Button size="sm" variant="outline" onClick={addSite} className="gap-1"><Plus className="h-3.5 w-3.5"/>Add</Button>
            </div>
            <p className="text-xs text-muted-foreground">Click any weekday cell to assign a site or leave type. Use Save to store changes to GitHub.</p>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium mr-1">Legend:</span>
          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-700 text-xs font-medium px-2 py-0.5 rounded">🏢 Site</span>
          {LEAVE_CODES.map(lv=><span key={lv.code} className={`${lv.color} border text-xs font-medium px-2 py-0.5 rounded`}>{lv.code}</span>)}
          <button onClick={scrollToToday} className="inline-flex items-center gap-1 bg-red-100 text-red-600 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800 text-xs font-medium px-2 py-0.5 rounded hover:bg-red-200 transition-colors cursor-pointer">📅 Today</button>
        </div>

        {loading&&<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"/><span className="ml-3 text-muted-foreground text-sm">Loading team data…</span></div>}
        {error&&<div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm">⚠ {error}</div>}

        {/* Table — ref used for scroll-to-today */}
        {!loading&&!error&&(
          <div ref={tableRef} className="rounded-xl border overflow-x-auto shadow-sm">
            <table className="w-full border-collapse text-sm" style={{minWidth:`${160+totalDays*62}px`}}>
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-20 bg-muted border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[160px]">Engineer</th>
                  {days.map(d=>(
                    <th key={d} className={`border-r px-1 pt-2 pb-0.5 text-center text-[10px] font-semibold uppercase tracking-wide min-w-[58px]
                      ${d===todayDay?"bg-red-500 text-white":isWeekend(year,month,d)?"bg-muted/60 text-muted-foreground/40":"bg-muted text-muted-foreground"}`}>
                      {getDayLabel(year,month,d)}
                    </th>
                  ))}
                </tr>
                <tr className="border-b">
                  <th className="sticky left-0 z-20 bg-muted border-r px-3 py-1.5"/>
                  {days.map(d=>(
                    <th key={d} className={`border-r px-1 pb-2 pt-0.5 text-center text-xs font-bold min-w-[58px]
                      ${d===todayDay?"bg-red-600 text-white":isWeekend(year,month,d)?"bg-muted/60 text-muted-foreground/30":"bg-muted text-muted-foreground"}`}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {engineers.map((eng,ei)=>(
                  <tr key={eng.id} className={`border-b hover:bg-muted/40 transition-colors ${ei%2===0?"":"bg-muted/20"}`}>
                    <td className="sticky left-0 z-10 bg-background border-r px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-[9px] font-bold border border-primary/20 flex-shrink-0">{eng.initials}</span>
                        <span className="font-medium text-xs text-foreground">{eng.name}</span>
                      </div>
                    </td>
                    {days.map(d=>{
                      const val=cellVal(eng.id,d);
                      const isToday=d===todayDay;
                      const weekend=isWeekend(year,month,d);
                      return (
                        <td key={d} onClick={e=>openPopup(eng.id,d,e)}
                          className={`border-r text-center align-middle transition-colors relative
                            ${isToday?"bg-red-50 dark:bg-red-950/30":weekend?"bg-muted/30":""}
                            ${adminMode?"cursor-pointer hover:bg-primary/5":"cursor-default"}`}
                          style={{padding:"5px 3px"}}
                          title={adminMode?`${eng.name} · ${d} ${getMonthName(month)}`:val||undefined}>
                          {isToday&&<span className="absolute inset-0 border-x-2 border-red-400/50 pointer-events-none"/>}
                          {val
                            ? <span className={chipClass(val)} style={{fontSize:val.length>8?9:10}}>{val}</span>
                            : <span className="text-muted-foreground/30 text-xs">{weekend?"—":""}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading&&!error&&(
          <p className="text-xs text-muted-foreground text-center pb-4">
            {adminMode
              ? `Admin mode (${adminName}) — click cell to assign · Save stores to GitHub · Export CSV downloads file`
              : "View only — enable Admin Mode to make changes · Export CSV available to all"}
          </p>
        )}
      </main>

      {/* Cell assignment popup */}
      {popup&&(
        <div ref={popupRef} className="fixed z-50 bg-background border rounded-xl shadow-2xl w-56 py-2 overflow-hidden"
          style={{top:popup.top,left:popup.left}}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-1">Assign · Day {popup.day}</p>
          <p className="text-[10px] text-muted-foreground/60 px-3 pt-1">Sites</p>
          {siteList.map(site=>{
            const active=cellVal(popup.engId,popup.day)===site;
            return <button key={site} onClick={()=>assignSite(popup.engId,popup.day,site)}
              className={`w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 hover:bg-muted transition-colors ${active?"bg-primary/10 text-primary font-semibold":"text-foreground"}`}>
              🏢 {site}
            </button>;
          })}
          <div className="border-t my-1.5"/>
          <p className="text-[10px] text-muted-foreground/60 px-3 pb-1">Leave / Absence</p>
          {LEAVE_CODES.map(lv=>{
            const active=cellVal(popup.engId,popup.day)===lv.code;
            return <button key={lv.code} onClick={()=>assignSite(popup.engId,popup.day,lv.code)}
              className={`w-full text-left text-xs px-3 py-1.5 hover:bg-muted transition-colors ${active?"bg-primary/10 font-semibold":""}`}>
              <span className={`${lv.color} border text-[10px] font-semibold px-1.5 py-0.5 rounded`}>{lv.label}</span>
            </button>;
          })}
          <div className="border-t my-1.5"/>
          <button onClick={()=>assignSite(popup.engId,popup.day,DEFAULT_SITE)}
            className="w-full text-left text-xs px-3 py-1.5 text-muted-foreground hover:bg-muted transition-colors">
            ↩ Reset to {DEFAULT_SITE}
          </button>
        </div>
      )}
    </>
  );
}
