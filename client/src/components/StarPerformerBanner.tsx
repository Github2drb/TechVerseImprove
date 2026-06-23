// client/src/components/StarPerformerBanner.tsx
// Add at the TOP of skill-matrix.tsx, just below the page header:
//   import { StarPerformerBanner } from "@/components/StarPerformerBanner";
//   <StarPerformerBanner />

import { useState, useEffect } from "react";
import { Star, Trophy, TrendingUp, Users, Target, RefreshCw, Calendar } from "lucide-react";

interface EngineerPerf {
  name: string; rank: number; overallScore: number;
  attendanceScore: number; taskScore: number; logScore: number;
  daysPresent: number; totalWorkdays: number;
  logEntries: number; tasksCompleted: number; totalTasks: number;
  level: "Expert"|"Proficient"|"Developing"|"Learning";
}
interface WeekPerf {
  weekStart: string; teamEfficiency: number;
  starPerformer: EngineerPerf | null;
  topPerformers: number; needsSupport: number;
  engineers: EngineerPerf[];
}

const LEVEL_STYLE: Record<string,{bg:string;text:string;border:string}> = {
  Expert:     { bg:"bg-green-500/15",  text:"text-green-400",  border:"border-green-500/30"  },
  Proficient: { bg:"bg-blue-500/15",   text:"text-blue-400",   border:"border-blue-500/30"   },
  Developing: { bg:"bg-amber-500/15",  text:"text-amber-400",  border:"border-amber-500/30"  },
  Learning:   { bg:"bg-muted/50",      text:"text-muted-foreground", border:"border-border"  },
};

function ScorePill({ label, value, color }: { label:string; value:number; color:string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}%</div>
      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${
          value>=75?"bg-green-500":value>=50?"bg-amber-500":"bg-muted-foreground/40"
        }`} style={{width:`${value}%`}}/>
      </div>
    </div>
  );
}

function getInitials(name:string){ return name.split(" ").map(n=>n[0]).slice(0,2).join(""); }

function WeekSelector({ value, onChange }: { value:string; onChange:(v:string)=>void }) {
  const options: {value:string;label:string}[] = [];
  const now = new Date(); now.setHours(0,0,0,0);
  const day = now.getDay();
  const base = new Date(now); base.setDate(now.getDate()-(day===0?6:day-1));
  for(let i=0;i<8;i++){
    const ws=new Date(base); ws.setDate(base.getDate()-(i*7));
    const we=new Date(ws); we.setDate(ws.getDate()+6);
    options.push({
      value: ws.toISOString().split("T")[0],
      label: i===0?"This week":i===1?"Last week":
        ws.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+" – "+
        we.toLocaleDateString("en-IN",{day:"numeric",month:"short"})
    });
  }
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
      <select value={value} onChange={e=>onChange(e.target.value)}
        className="border rounded-lg px-3 py-1.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input">
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function StarPerformerBanner() {
  const [data,       setData]    = useState<WeekPerf|null>(null);
  const [loading,    setLoading] = useState(true);
  const [error,      setError]   = useState<string|null>(null);
  const [expanded,   setExpanded]= useState(false);
  const [weekStart,  setWeekStart]= useState(() => {
    const d=new Date(); d.setHours(0,0,0,0);
    const day=d.getDay(); d.setDate(d.getDate()-(day===0?6:day-1));
    return d.toISOString().split("T")[0];
  });

  const load = async (ws=weekStart) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/performance/week?weekStart=${ws}`);
      if(!r.ok) throw new Error("HTTP "+r.status);
      setData(await r.json());
    } catch(e:any){ setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(weekStart); },[weekStart]);

  if(loading) return (
    <div className="border rounded-2xl p-6 bg-card flex items-center gap-3">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"/>
      <span className="text-sm text-muted-foreground">Computing performance data…</span>
    </div>
  );

  if(error||!data) return (
    <div className="border rounded-2xl p-4 bg-card text-sm text-muted-foreground flex items-center justify-between">
      <span>⚠ Could not load performance data: {error}</span>
      <button onClick={()=>load(weekStart)} className="text-xs underline">Retry</button>
    </div>
  );

  const star = data.starPerformer;
  const topLevel = star ? LEVEL_STYLE[star.level] : LEVEL_STYLE.Learning;

  return (
    <div className="space-y-4">

      {/* ── Week selector + summary cards ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <WeekSelector value={weekStart} onChange={ws=>{ setWeekStart(ws); }}/>
        <button onClick={()=>load(weekStart)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw className="h-3.5 w-3.5"/>Refresh
        </button>
      </div>

      {/* ── Summary row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon:<Users className="h-5 w-5 text-blue-400"/>,   label:"Total Engineers",   value:data.engineers.length,  color:"text-foreground"         },
          { icon:<TrendingUp className="h-5 w-5 text-green-400"/>, label:"Team Efficiency", value:data.teamEfficiency+"%", color:"text-green-400"         },
          { icon:<Star className="h-5 w-5 text-amber-400"/>,   label:"Top Performers",    value:data.topPerformers,     color:"text-amber-400"          },
          { icon:<Target className="h-5 w-5 text-red-400"/>,   label:"Needs Support",     value:data.needsSupport,      color:"text-red-400"            },
        ].map(c=>(
          <div key={c.label} className="border rounded-xl p-4 bg-card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted flex-shrink-0">{c.icon}</div>
            <div><p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>

      {/* ── Star performer banner ── */}
      {star ? (
        <div className={`border-2 rounded-2xl overflow-hidden ${topLevel.border}`}>
          <div className={`${topLevel.bg} px-6 py-4 flex items-center gap-4 flex-wrap`}>
            {/* Trophy icon */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl font-black text-white">{getInitials(star.name)}</span>
              </div>
              <span className="absolute -bottom-1 -right-1 text-xl">⭐</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500 text-white">
                  <Trophy className="h-3.5 w-3.5"/>Star Performer of the Week
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${topLevel.bg} ${topLevel.text} ${topLevel.border}`}>
                  {star.level}
                </span>
              </div>
              <h3 className="text-xl font-bold text-foreground">{star.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {star.daysPresent}/{star.totalWorkdays} days present · {star.tasksCompleted}/{star.totalTasks} tasks completed
                {star.logEntries>0 && ` · ${star.logEntries} activity log entries`}
              </p>
            </div>

            {/* Score breakdown */}
            <div className="flex items-center gap-6 flex-shrink-0">
              <ScorePill label="Attendance" value={star.attendanceScore} color="text-blue-400"/>
              <ScorePill label="Tasks" value={star.taskScore} color="text-green-400"/>
              <ScorePill label="Activity Log" value={star.logScore} color="text-purple-400"/>
              <div className="flex flex-col items-center gap-0.5 border-l pl-6">
                <div className="text-[10px] text-muted-foreground">Overall</div>
                <div className={`text-3xl font-black ${topLevel.text}`}>{star.overallScore}%</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-2xl p-6 bg-card text-center">
          <Star className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3"/>
          <p className="text-sm font-semibold text-foreground">No star performer yet this week</p>
          <p className="text-xs text-muted-foreground mt-1">Engineers need score above 60% based on attendance, tasks and activity logs</p>
        </div>
      )}

      {/* ── Full leaderboard ── */}
      <div className="border rounded-2xl overflow-hidden bg-card">
        <button onClick={()=>setExpanded(e=>!e)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
          <span className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground"/>
            Weekly Leaderboard — {data.engineers.length} engineers ranked
          </span>
          <span className="text-xs text-muted-foreground">{expanded?"▲ Hide":"▼ Show all"}</span>
        </button>

        {expanded && (
          <div className="border-t divide-y">
            {data.engineers.map((eng,idx)=>{
              const ls = LEVEL_STYLE[eng.level];
              const medals = ["🥇","🥈","🥉"];
              return (
                <div key={eng.name} className={`flex items-center gap-4 px-5 py-3 ${idx===0?"bg-amber-500/5":""}`}>
                  <span className="text-lg flex-shrink-0 w-8 text-center">
                    {idx<3?medals[idx]:<span className="text-sm font-bold text-muted-foreground">#{idx+1}</span>}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {getInitials(eng.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{eng.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ls.bg} ${ls.text}`}>{eng.level}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {eng.daysPresent}d present · {eng.tasksCompleted}/{eng.totalTasks} tasks
                      </span>
                    </div>
                  </div>
                  {/* Mini bars */}
                  <div className="flex items-center gap-3 hidden sm:flex">
                    {[
                      {l:"Attend",v:eng.attendanceScore,c:"bg-blue-500"},
                      {l:"Tasks", v:eng.taskScore,       c:"bg-green-500"},
                      {l:"Log",   v:eng.logScore,        c:"bg-purple-500"},
                    ].map(b=>(
                      <div key={b.l} className="flex flex-col items-center gap-0.5">
                        <div className="text-[9px] text-muted-foreground">{b.l}</div>
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${b.c}`} style={{width:`${b.v}%`}}/>
                        </div>
                        <div className="text-[9px] text-muted-foreground">{b.v}%</div>
                      </div>
                    ))}
                  </div>
                  <div className={`text-xl font-black flex-shrink-0 w-12 text-right ${ls.text}`}>
                    {eng.overallScore}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scoring legend */}
      <div className="border rounded-xl p-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground mb-2">How scores are calculated</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"/>
            <span><strong className="text-foreground">Attendance (40%)</strong> — Days with status marked in Daily Report this week</span>
          </div>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"/>
            <span><strong className="text-foreground">Task Completion (40%)</strong> — Weekly tasks completed vs assigned</span>
          </div>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"/>
            <span><strong className="text-foreground">Activity Log (20%)</strong> — Project log entries tagged with engineer name this week</span>
          </div>
        </div>
      </div>
    </div>
  );
}
