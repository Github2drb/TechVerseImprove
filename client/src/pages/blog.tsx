// client/src/pages/blog.tsx
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { BlogCard } from "@/components/BlogCard";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Plus, X, Save, Trash2, Pin, Eye, EyeOff,
  Search, ChevronLeft, Edit2,
} from "lucide-react";

const CATEGORIES = ["All", "PLC", "HMI", "SCADA", "Project Update", "Training", "General"];

const CATEGORY_COLORS: Record<string, string> = {
  PLC:            "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300",
  HMI:            "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  SCADA:          "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300",
  "Project Update":"bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Training:       "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
  General:        "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
};
function catColor(c: string) { return CATEGORY_COLORS[c] ?? CATEGORY_COLORS.General; }

interface BlogPost {
  id: string; title: string; author: string; date: string;
  category: string; tags: string[]; coverImage: string;
  excerpt: string; content: string;
  isPinned: boolean; isPublished: boolean; createdAt: string;
}

const EMPTY_POST: Omit<BlogPost, "id"|"createdAt"> = {
  title:"", author:"Admin", date: new Date().toISOString().split("T")[0],
  category:"General", tags:[], coverImage:"", excerpt:"", content:"",
  isPinned:false, isPublished:false,
};

function getAdminHeader(): string {
  try {
    const stored = sessionStorage.getItem("drb_admin");
    if (stored !== "1") return "";
    const name = sessionStorage.getItem("drb_admin_name") ?? "admin";
    return btoa(JSON.stringify({ username: name.toLowerCase(), role: "admin" }));
  } catch { return ""; }
}
function isAdminSession() { return sessionStorage.getItem("drb_admin") === "1"; }

// ── Component ─────────────────────────────────────────────────────────────────
export default function BlogPage() {
  const [posts,    setPosts]    = useState<BlogPost[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<BlogPost|null>(null);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState<typeof EMPTY_POST & { id?:string; createdAt?:string }>(EMPTY_POST);
  const [saving,   setSaving]   = useState(false);
  const [tagInput, setTagInput] = useState("");
  const adminMode = isAdminSession();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/blog-posts");
      if (!r.ok) throw new Error("HTTP " + r.status);
      setPosts(await r.json());
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Filter
  const filtered = posts.filter(p => {
    const matchCat = category === "All" || p.category === category;
    const q = search.toLowerCase();
    const matchQ = !q || p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  // ── Save post ──────────────────────────────────────────────────────────────
  const savePost = async () => {
    if (!draft.title.trim()) return alert("Title is required");
    setSaving(true);
    try {
      const isNew = !draft.id;
      const url   = isNew ? "/api/blog-posts" : `/api/blog-posts/${draft.id}`;
      const method = isNew ? "POST" : "PUT";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type":"application/json", "x-admin-auth": getAdminHeader() },
        body: JSON.stringify(draft),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message ?? "Save failed"); }
      await load();
      setEditing(false);
    } catch(e:any) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  // ── Delete post ────────────────────────────────────────────────────────────
  const deletePost = async (id: string) => {
    if (!confirm("Delete this post permanently?")) return;
    try {
      await fetch(`/api/blog-posts/${id}`, {
        method:"DELETE", headers:{ "x-admin-auth": getAdminHeader() },
      });
      setSelected(null);
      await load();
    } catch(e:any) { alert("Delete failed: " + e.message); }
  };

  // ── Open editor ────────────────────────────────────────────────────────────
  const openNew = () => { setDraft({ ...EMPTY_POST }); setTagInput(""); setEditing(true); };
  const openEdit = (p: BlogPost) => {
    setDraft({ ...p }); setTagInput(p.tags.join(", ")); setEditing(true);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setDraft(d => ({ ...d, tags: [...new Set([...d.tags, ...t.split(",").map(x=>x.trim()).filter(Boolean)])] }));
    setTagInput("");
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected && !editing) return (
    <>
      <Header searchQuery="" onSearchChange={()=>{}} />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
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
        </div>

        {selected.coverImage && (
          <img src={selected.coverImage} alt={selected.title}
            className="w-full h-56 object-cover rounded-xl mb-6"
            onError={e => (e.currentTarget.style.display="none")} />
        )}

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${catColor(selected.category)}`}>
            {selected.category}
          </span>
          {selected.isPinned && <span className="text-xs text-amber-600 font-medium">📌 Pinned</span>}
          {!selected.isPublished && <span className="text-xs text-red-500 font-medium">Draft</span>}
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">{selected.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {selected.author} · {new Date(selected.date).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}
        </p>

        {selected.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {selected.tags.map(t => (
              <span key={t} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">#{t}</span>
            ))}
          </div>
        )}

        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: selected.content }}
        />
      </main>
    </>
  );

  // ── Editor ─────────────────────────────────────────────────────────────────
  if (editing) return (
    <>
      <Header searchQuery="" onSearchChange={()=>{}} />
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
            <input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
              placeholder="Post title"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input">
              {CATEGORIES.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Cover Image URL (optional)</label>
            <input value={draft.coverImage} onChange={e=>setDraft(d=>({...d,coverImage:e.target.value}))}
              placeholder="https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/blog-images/image.jpg"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Excerpt (short summary shown on card)</label>
            <textarea value={draft.excerpt} onChange={e=>setDraft(d=>({...d,excerpt:e.target.value}))}
              rows={2} placeholder="One or two sentences describing the post…"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input resize-none" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Content <span className="text-muted-foreground/60">(HTML supported — use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;, &lt;img src="…"&gt;)</span>
            </label>
            <textarea value={draft.content} onChange={e=>setDraft(d=>({...d,content:e.target.value}))}
              rows={14} placeholder="<h2>Introduction</h2><p>Your content here…</p>"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input resize-y font-mono" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addTag();}}}
                placeholder="e.g. PLC, SIEMENS, Automation"
                className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
              <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {draft.tags.map(t=>(
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                  {t}
                  <button onClick={()=>setDraft(d=>({...d,tags:d.tags.filter(x=>x!==t)}))}><X className="h-2.5 w-2.5"/></button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-4 items-center sm:col-span-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={draft.isPinned} onChange={e=>setDraft(d=>({...d,isPinned:e.target.checked}))}
                className="rounded" />
              <Pin className="h-4 w-4 text-amber-500" /> Pin this post
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={draft.isPublished} onChange={e=>setDraft(d=>({...d,isPublished:e.target.checked}))}
                className="rounded" />
              <Eye className="h-4 w-4 text-green-500" /> Publish (visible to all)
            </label>
          </div>
        </div>
      </main>
    </>
  );

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <>
      <Header searchQuery="" onSearchChange={()=>{}} />
      <main className="mx-auto max-w-[98vw] xl:max-w-6xl px-4 py-8 md:px-6 space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Knowledge Base</h1>
            <p className="text-muted-foreground text-sm">Automation insights and technical updates from the Controls team</p>
          </div>
          <div className="flex gap-2 items-center">
            {adminMode && (
              <Button size="sm" onClick={openNew} className="gap-2">
                <Plus className="h-4 w-4" /> New post
              </Button>
            )}
            <Link href="/"><Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4"/>Back</Button></Link>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search posts…"
              className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setCategory(c)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors
                  ${category===c?"bg-primary text-primary-foreground border-primary":"hover:bg-muted border-input text-muted-foreground"}`}>
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
        {error && (
          <div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm">⚠ {error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No posts found.</p>
            {adminMode && <Button variant="outline" size="sm" onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4"/>Create first post</Button>}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(post => (
              <BlogCard key={post.id} post={post} onClick={() => setSelected(post)} />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} post{filtered.length!==1?"s":""} · Data stored in Controls_Team_Tracker GitHub repo
        </p>
      </main>
    </>
  );
}
