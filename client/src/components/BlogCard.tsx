// client/src/components/BlogCard.tsx

import { Pin, Clock, Tag } from "lucide-react";

interface BlogPost {
  id: string; title: string; author: string; date: string;
  category: string; tags: string[]; coverImage: string;
  excerpt: string; content: string;
  isPinned: boolean; isPublished: boolean; createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  PLC:            "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300",
  HMI:            "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  SCADA:          "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300",
  "Project Update":"bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Training:       "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
  General:        "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
};

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.General;
}

export function BlogCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:border-border transition-all duration-200"
    >
      {/* Cover image */}
      {post.coverImage && (
        <div className="h-40 overflow-hidden bg-muted">
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => (e.currentTarget.style.display = "none")}
          />
        </div>
      )}

      <div className="p-4 space-y-2.5">
        {/* Top row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor(post.category)}`}>
            {post.category}
          </span>
          {post.isPinned && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </span>
          )}
          {!post.isPublished && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
              Draft
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h3>

        {/* Excerpt */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{post.excerpt}</p>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
            {post.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground border-t">
          <span className="font-medium">{post.author}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(post.date).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
          </span>
        </div>
      </div>
    </article>
  );
}
