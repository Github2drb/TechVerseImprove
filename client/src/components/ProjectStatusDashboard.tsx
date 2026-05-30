// ProjectStatusDashboard.tsx
// Paste this file in: client/src/components/ProjectStatusDashboard.tsx
// Then import and add <ProjectStatusDashboard /> in analytics.tsx

// ── Status symbols from Excel ─────────────────────────────────────────────────
// ü = Completed  |  û = Not Started/Incomplete  |  y = In Progress  |  ≠ = Not Applicable

const PHASES = [
  "Long Lead BOM","Complete BOP","DAP","BOM in ODOO","EPLAN",
  "Hardware Availability","Offline PLC Program","Offline HMI Program",
  "Communication with other devices","Equipment Power up","IO Check",
  "Hardware Integration","Manual Testing","Auto Testing","Trials",
  "Documentation","Line Handover to Customer",
];

const PROJECTS = [
  { no:1,  name:"3A-AD1-26046 – ASAHI DENSO Switch Endurance Testing Station",  engineer:"Needs to Assign",
    s:["ü","û","ü","y","û","û","û","û","û","û","û","û","û","û","û","û","û"] },
  { no:2,  name:"3A-AV1-25120 – Eddy Current Testing Equipment",                engineer:"Needs to Assign",
    s:["ü","û","ü","û","û","û","û","û","û","û","û","û","û","û","û","û","û"] },
  { no:3,  name:"3A-DK1-25077 – Dehydration Project",                           engineer:"Harsha KA",
    s:["ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","ü","û"] },
  { no:4,  name:"3A-DK2-25143 STEP 4 – Leak Testing Machine",                  engineer:"Needs to Assign",
    s:["ü","ü","ü","ü","ü","û","y","y","û","û","û","û","û","û","û","û","û"] },
  { no:5,  name:"3A-GB1-26007 – GE Pressure Tester",                            engineer:"Eswanth",
    s:["ü","ü","ü","ü","ü","û","ü","ü","û","û","û","û","û","û","û","û","û"] },
  { no:6,  name:"3A-IE1-26042 & 26043 – INDIC Wave Soldering Machine (Misumi & Bosch)", engineer:"Dhanesh",
    s:["ü","≠","ü","≠","≠","û","û","û","û","û","û","û","û","û","û","û","û"] },
  { no:7,  name:"3A-IS1-26051 – Final Line Filling Equipment Interlinking with Conveyor", engineer:"Harsha KA",
    s:["ü","ü","ü","≠","ü","û","≠","≠","û","û","û","û","û","û","û","û","û"] },
  { no:8,  name:"3A-DK2-25142 STEP 4 – Dehydration",                           engineer:"Susanth",
    s:["ü","ü","ü","ü","ü","û","y","y","û","û","û","û","û","û","û","û","û"] },
  { no:9,  name:"3A-SS1-26012 – Sartorius Glass Bead Blasting Automation",      engineer:"Eswanth",
    s:["ü","ü","ü","ü","ü","ü","y","y","û","û","û","û","û","û","û","û","û"] },
  { no:10, name:"3A-TC-26039 – Assy Stn for 46P and 6P Connector",              engineer:"Eswanth",
    s:["ü","û","ü","û","û","û","û","û","û","û","û","û","û","û","û","û","û"] },
  { no:11, name:"3A-VA1-26035 – Varroc Stator Housing Shrink Fitting",          engineer:"Dhanesh",
    s:["ü","û","ü","û","û","û","ü","ü","û","û","û","û","û","û","û","û","û"] },
  { no:12, name:"3S-SO1-26025 – Gen6 EV Charge Port E-Lock Assembly Machine",   engineer:"Praveen",
    s:["ü","ü","ü","ü","ü","û","y","y","û","û","û","û","û","û","û","û","û"] },
  { no:13, name:"DK1-25110 – ODU Assembly Auto Line",                            engineer:"Susanth",
    s:["ü","ü","ü","ü","ü","ü","y","û","û","û","û","û","û","û","û","û","û"] },
];

// ── Status helpers ────────────────────────────────────────────────────────────
type StatusSym = "ü"|"û"|"y"|"≠";

const STATUS_META: Record<StatusSym,{label:string;bg:string;text:string;badge:string;weight:number}> = {
  "ü": { label:"Completed",           bg:"bg-green-100 dark:bg-green-950",  text:"text-green-700 dark:text-green-300",  badge:"✓", weight:1   },
  "û": { label:"Not Started",         bg:"bg-red-50 dark:bg-red-950/60",    text:"text-red-400 dark:text-red-500",      badge:"✗", weight:0   },
  "y": { label:"In Progress",         bg:"bg-blue-100 dark:bg-blue-950",    text:"text-blue-700 dark:text-blue-300",    badge:"◑", weight:0.5 },
  "≠": { label:"Not Applicable",      bg:"bg-gray-100 dark:bg-gray-800",    text:"text-gray-400 dark:text-gray-500",    badge:"–", weight:-1  },
};

function calcCompletion(statuses: string[]): number {
  let done=0, total=0;
  for (const s of statuses) {
    if (s==="≠") continue; // exclude N/A
    total++;
    if (s==="ü") done += 1;
    else if (s==="y") done += 0.5;
  }
  return total===0 ? 0 : Math.round((done/total)*100);
}

function StatusCell({ sym }: { sym: string }) {
  const m = STATUS_META[sym as StatusSym] ?? STATUS_META["û"];
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-sm font-bold ${m.bg} ${m.text}`}
      title={m.label}>
      {m.badge}
    </span>
  );
}

function CompletionBar({ pct }: { pct: number }) {
  const color = pct>=90?"bg-green-500":pct>=60?"bg-blue-500":pct>=30?"bg-amber-500":"bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{width:`${pct}%`}}/>
      </div>
      <span className={`text-xs font-bold tabular-nums min-w-[32px] text-right
        ${pct>=90?"text-green-600 dark:text-green-400":pct>=60?"text-blue-600 dark:text-blue-400":pct>=30?"text-amber-600 dark:text-amber-400":"text-red-500"}`}>
        {pct}%
      </span>
    </div>
  );
}

export function ProjectStatusDashboard() {
  const totals = PROJECTS.map(p=>calcCompletion(p.s));
  const fullDone  = PROJECTS.filter((_,i)=>totals[i]===100).length;
  const inProg    = PROJECTS.filter((_,i)=>totals[i]>0&&totals[i]<100).length;
  const notStart  = PROJECTS.filter((_,i)=>totals[i]===0).length;
  const avgPct    = Math.round(totals.reduce((a,b)=>a+b,0)/totals.length);

  return (
    <div className="space-y-6">

      {/* ── Title ── */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Project Status</h2>
        <p className="text-muted-foreground text-sm mt-1">May – Sept 2026 · Controls Engineering</p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:"Total Projects",   value:PROJECTS.length, color:"text-foreground",              sub:"All tracked" },
          { label:"Completed",        value:fullDone,          color:"text-green-600 dark:text-green-400", sub:"100% done" },
          { label:"In Progress",      value:inProg,            color:"text-blue-600 dark:text-blue-400",  sub:"Partially done" },
          { label:"Overall Progress", value:`${avgPct}%`,      color:"text-amber-600 dark:text-amber-400",sub:"Average completion" },
        ].map(c=>(
          <div key={c.label} className="border rounded-xl p-4 bg-card">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-3 items-center text-xs font-medium">
        <span className="text-muted-foreground">Legend:</span>
        {(Object.entries(STATUS_META) as [StatusSym,typeof STATUS_META[StatusSym]][]).map(([sym,m])=>(
          <span key={sym} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${m.bg} ${m.text}`}>
            <span className="font-bold">{m.badge}</span>{m.label}
          </span>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full border-collapse text-xs" style={{minWidth:"1400px"}}>
          <thead>
            <tr className="border-b bg-muted">
              <th className="sticky left-0 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[40px]">#</th>
              <th className="sticky left-10 z-20 bg-muted border-r px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[260px]">Project</th>
              <th className="border-r px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[100px]">Engineer</th>
              {PHASES.map(p=>(
                <th key={p} className="border-r px-2 py-3 text-center font-semibold text-muted-foreground min-w-[72px]">
                  <span className="block leading-tight" style={{writingMode:"vertical-lr",transform:"rotate(180deg)",height:"90px",whiteSpace:"nowrap"}}>
                    {p}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[130px]">Completion</th>
            </tr>
          </thead>
          <tbody>
            {PROJECTS.map((proj,idx)=>{
              const pct=totals[idx];
              const rowBg=pct===100?"bg-green-50/50 dark:bg-green-950/20":idx%2===0?"":"bg-muted/20";
              return (
                <tr key={proj.no} className={`border-b hover:bg-muted/40 transition-colors ${rowBg}`}>
                  <td className="sticky left-0 z-10 bg-background border-r px-3 py-3 text-muted-foreground font-mono">{proj.no}</td>
                  <td className="sticky left-10 z-10 bg-background border-r px-3 py-3 font-medium text-foreground max-w-[260px]">
                    <span className="line-clamp-2 leading-snug">{proj.name}</span>
                  </td>
                  <td className="border-r px-3 py-3 whitespace-nowrap text-muted-foreground">{proj.engineer}</td>
                  {proj.s.map((sym,ci)=>(
                    <td key={ci} className="border-r px-2 py-2 text-center">
                      <StatusCell sym={sym}/>
                    </td>
                  ))}
                  <td className="px-3 py-3"><CompletionBar pct={pct}/></td>
                </tr>
              );
            })}
          </tbody>

          {/* ── Phase completion footer ── */}
          <tfoot>
            <tr className="border-t-2 bg-muted/50">
              <td className="sticky left-0 z-10 bg-muted border-r px-3 py-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wide" colSpan={2}>Phase %</td>
              <td className="border-r px-3 py-2"/>
              {PHASES.map((p,ci)=>{
                const applicable=PROJECTS.filter(proj=>proj.s[ci]!=="≠");
                const done=applicable.filter(proj=>proj.s[ci]==="ü").length;
                const inP=applicable.filter(proj=>proj.s[ci]==="y").length;
                const pct=applicable.length===0?0:Math.round(((done+inP*0.5)/applicable.length)*100);
                const color=pct>=90?"text-green-600 dark:text-green-400":pct>=60?"text-blue-600 dark:text-blue-400":pct>=30?"text-amber-500":"text-red-500";
                return (
                  <td key={p} className="border-r px-2 py-2 text-center">
                    <span className={`text-[10px] font-bold ${color}`}>{pct}%</span>
                    <div className="w-full h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${pct>=90?"bg-green-500":pct>=60?"bg-blue-500":pct>=30?"bg-amber-500":"bg-red-400"}`} style={{width:`${pct}%`}}/>
                    </div>
                  </td>
                );
              })}
              <td className="px-3 py-2"/>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Source: Project Status_May_Sept_2026.xlsx · {PROJECTS.length} projects · {PHASES.length} phases tracked
      </p>
    </div>
  );
}
