import React, { useState, useEffect } from "react";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Instagram, 
  Twitter, 
  Linkedin, 
  Facebook, 
  Youtube, 
  Share2, 
  Clock, 
  Check, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw 
} from "lucide-react";
import { SocialPost, SocialPlatform } from "../types.ts";

interface ContentCalendarProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  testMode?: boolean;
}

const PLATFORM_ICONS: Record<SocialPlatform, any> = {
  tiktok: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  pinterest: Share2,
  x: Twitter,
  linkedin: Linkedin,
  youtube_shorts: Youtube
};

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  tiktok: "text-rose-400 border-rose-950/40 bg-rose-950/20",
  instagram: "text-pink-400 border-pink-950/40 bg-pink-950/20",
  facebook: "text-blue-500 border-blue-950/40 bg-blue-950/20",
  pinterest: "text-red-500 border-red-950/40 bg-red-950/20",
  x: "text-white border-gray-800 bg-gray-900/60",
  linkedin: "text-indigo-400 border-indigo-950/40 bg-indigo-950/20",
  youtube_shorts: "text-red-400 border-red-950/40 bg-red-950/20"
};

export default function ContentCalendar({
  workspaceId,
  onAddAuditLog,
  testMode = false
}: ContentCalendarProps) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);

  const loadCalendarPosts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/publishing/posts/calendar?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error("[ContentCalendar] Failed to load calendar posts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendarPosts();
  }, [workspaceId]);

  // Calendar logic helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Find posts scheduled/published on a specific calendar day
  const getPostsForDay = (dayNum: number) => {
    return posts.filter((post) => {
      const dateStr = post.scheduledAt || post.publishedAt || post.createdAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return (
        date.getDate() === dayNum &&
        date.getMonth() === month &&
        date.getFullYear() === year
      );
    });
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const calendarDays = [];
  // Add blank padding cells for first day offset
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-900 pb-5">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Content Calendar
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Visual scheduler tracking campaign timings, drafts, and historical publication dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0c0d12] border border-gray-850 p-1.5 rounded-lg text-xs font-semibold text-white">
            <button 
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-gray-850 text-gray-400 hover:text-white cursor-pointer transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[120px] text-center font-display">
              {monthNames[month]} {year}
            </span>
            <button 
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-gray-850 text-gray-400 hover:text-white cursor-pointer transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={loadCalendarPosts}
            className="p-2.5 rounded-lg bg-[#0c0d12] border border-gray-850 text-gray-400 hover:text-white cursor-pointer transition-all hover:border-gray-800"
            title="Refresh Grid"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Interactive Month Grid */}
        <div className="lg:col-span-8 bg-[#0c0d12] rounded-xl border border-gray-850 overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-900 bg-[#12131a]/60 text-center py-2.5 text-[10px] font-mono uppercase font-bold text-gray-500">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 h-[360px] divide-x divide-y divide-gray-900/40">
              {Array.from({ length: 35 }).map((_, idx) => (
                <div key={idx} className="bg-[#0c0d12]/20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 auto-rows-[90px] divide-x divide-y divide-gray-900/40">
              {calendarDays.map((day, idx) => {
                const dayPosts = day ? getPostsForDay(day) : [];
                return (
                  <div 
                    key={idx} 
                    className={`p-1.5 transition-all relative group ${
                      day ? "bg-[#0c0d12]" : "bg-[#0a0b10]/20"
                    }`}
                  >
                    {day && (
                      <span className="text-[10px] font-mono font-bold text-gray-500 group-hover:text-gray-300 transition-all block">
                        {day}
                      </span>
                    )}

                    {/* Posts list on this day */}
                    <div className="mt-1 space-y-1 overflow-y-auto max-h-[64px] scrollbar-thin">
                      {dayPosts.map((post) => {
                        const Icon = PLATFORM_ICONS[post.platform] || Share2;
                        return (
                          <button
                            key={post.id}
                            onClick={() => setSelectedPost(post)}
                            className={`w-full p-1 rounded text-left flex items-center gap-1 hover:brightness-110 transition-all cursor-pointer ${PLATFORM_COLORS[post.platform]}`}
                          >
                            <Icon className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-[9px] font-sans font-medium leading-none truncate text-white block">
                              {post.title || post.caption}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Post Detail Sidebar */}
        <div className="lg:col-span-4">
          {selectedPost ? (
            <div className="bg-[#0c0d12] p-5 rounded-xl border border-indigo-950/40 space-y-4">
              <div className="flex justify-between items-start pb-2 border-b border-gray-900">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${PLATFORM_COLORS[selectedPost.platform]}`}>
                    {React.createElement(PLATFORM_ICONS[selectedPost.platform] || Share2, { className: "w-4 h-4" })}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block capitalize">{selectedPost.platform} Channel</span>
                    <span className="text-[9px] text-gray-500 font-mono block">Post ID: {selectedPost.id}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                  selectedPost.status === "published" 
                    ? "bg-emerald-950/40 text-emerald-400" 
                    : selectedPost.status === "failed" 
                      ? "bg-rose-950/40 text-rose-400" 
                      : "bg-amber-950/40 text-amber-400"
                }`}>
                  {selectedPost.status}
                </span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] font-mono text-gray-500 uppercase font-bold block">Caption Preview</span>
                <p className="text-[11px] text-gray-300 leading-relaxed font-sans bg-[#12131a] p-3 rounded-lg border border-gray-850">
                  {selectedPost.caption}
                </p>
              </div>

              {selectedPost.scheduledAt && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-400 bg-amber-950/10 p-2 border border-amber-950/20 rounded-lg">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Planned: {new Date(selectedPost.scheduledAt).toLocaleString()}</span>
                </div>
              )}

              {selectedPost.publishedAt && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/10 p-2 border border-emerald-950/20 rounded-lg">
                  <Check className="w-3.5 h-3.5" />
                  <span>Published: {new Date(selectedPost.publishedAt).toLocaleString()}</span>
                </div>
              )}

              {selectedPost.failureReason && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400 bg-rose-950/10 p-2 border border-rose-950/20 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Error: {selectedPost.failureReason}</span>
                </div>
              )}

              {selectedPost.metrics && (
                <div className="space-y-2">
                  <span className="text-[9px] font-mono text-gray-500 uppercase font-bold block">Fulfillment Performance</span>
                  <div className="grid grid-cols-2 gap-2 text-center font-mono text-[10px]">
                    <div className="bg-[#12131a] p-2 rounded border border-gray-850">
                      <span className="text-gray-500 block uppercase text-[8px]">Reach</span>
                      <span className="text-white font-bold text-sm mt-0.5 block">{selectedPost.metrics.reach.toLocaleString()}</span>
                    </div>
                    <div className="bg-[#12131a] p-2 rounded border border-gray-850">
                      <span className="text-gray-500 block uppercase text-[8px]">Clicks</span>
                      <span className="text-white font-bold text-sm mt-0.5 block">{selectedPost.metrics.clicks.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={() => setSelectedPost(null)}
                className="w-full h-8 bg-gray-900 hover:bg-gray-850 border border-gray-850 text-gray-400 hover:text-white transition-all text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close View
              </button>
            </div>
          ) : (
            <div className="h-[200px] rounded-xl border border-dashed border-gray-800 flex flex-col items-center justify-center text-center p-6 bg-[#0c0d12]/30">
              <Sparkles className="w-8 h-8 text-indigo-400 mb-2 animate-pulse" />
              <p className="text-xs font-semibold text-gray-400">Post Detail Stream</p>
              <p className="text-[10px] text-gray-500 max-w-xs mt-1 leading-relaxed">
                Click any social post in the calendar grid to expand its metadata, status details, and interaction metrics.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
