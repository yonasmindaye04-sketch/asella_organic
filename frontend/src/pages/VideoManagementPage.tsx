import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/shorts/')) {
    const id = url.split('youtube.com/shorts/')[1]?.split('?')[0];
    return `https://www.youtube.com/embed/${id}?rel=0`;
  }
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split('?')[0];
    return `https://www.youtube.com/embed/${id}?rel=0`;
  }
  if (url.includes('youtube.com/watch?v=')) {
    const id = new URLSearchParams(url.split('?')[1]).get('v');
    return `https://www.youtube.com/embed/${id}?rel=0`;
  }
  return url;
};

interface Video { id: number; url: string; title: string; created_at?: string; }

const VideoManagementPage: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/v1/videos`);
      const json = await res.json();
      if (json.success) setVideos(json.data);
      else setError(json.error ?? 'Failed to load videos.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: newUrl.trim(), title: newTitle.trim() || 'Community Testimonial' }),
      });
      const json = await res.json();
      if (json.success) {
        setNewUrl('');
        setNewTitle('');
        flash('Video added successfully!', true);
        await fetchVideos();
      } else {
        flash(json.error ?? 'Failed to add video.', false);
      }
    } catch {
      flash('Network error. Please try again.', false);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/videos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setVideos(v => v.filter(x => x.id !== id));
        flash('Video deleted.', true);
      } else {
        flash(json.error ?? 'Failed to delete.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--fg)] flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-[var(--accent)]">smart_display</span>
            Community Videos
          </h1>
          <p className="text-[var(--fg-muted)] text-sm mt-1">
            Add or remove YouTube community testimonial videos. Changes appear on the public storefront immediately.
          </p>
        </div>

        {/* Toast message */}
        {msg && (
          <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border ${
            msg.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span className="material-symbols-outlined text-[18px]">
              {msg.ok ? 'check_circle' : 'error'}
            </span>
            {msg.text}
          </div>
        )}

        {/* Add Video Form */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-sm p-6 mb-8">
          <h2 className="text-base font-bold text-[var(--fg)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--accent)]">add_circle</span>
            Add New Video
          </h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                YouTube URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://youtube.com/shorts/abc123  or  https://youtu.be/abc123"
                required
                className="w-full bg-[var(--input-bg,#fff)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              />
              <p className="text-xs text-[var(--fg-muted)] mt-1">
                Supports: YouTube Shorts, regular watch links, and youtu.be short links
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                Title <span className="text-[var(--fg-muted)]">(optional)</span>
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Customer Testimonial 10"
                maxLength={200}
                className="w-full bg-[var(--input-bg,#fff)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={adding || !newUrl.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0D2E10] text-white rounded-xl text-sm font-bold hover:bg-[#1a4a1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding
                  ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Adding…</>
                  : <><span className="material-symbols-outlined text-[16px]">add</span>Add Video</>
                }
              </button>
              {(newUrl || newTitle) && (
                <button
                  type="button"
                  onClick={() => { setNewUrl(''); setNewTitle(''); }}
                  className="px-4 py-2.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)] rounded-xl transition"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Video List */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--fg)] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[var(--accent)]">video_library</span>
              All Videos
              <span className="ml-1 text-xs font-mono bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full">
                {videos.length}
              </span>
            </h2>
            <button
              onClick={fetchVideos}
              className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition"
              title="Refresh"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh
            </button>
          </div>

          {loading && (
            <div className="p-8 flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-[var(--border)] rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="p-8 text-center">
              <span className="material-symbols-outlined text-[48px] text-red-300 block mb-2">error_outline</span>
              <p className="text-red-600 font-bold">{error}</p>
              <button onClick={fetchVideos} className="mt-3 text-sm text-[var(--accent)] underline">Try again</button>
            </div>
          )}

          {!loading && !error && videos.length === 0 && (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-[56px] text-[var(--fg-muted)] block mb-3">video_library</span>
              <p className="text-[var(--fg-muted)] font-semibold">No videos yet. Add your first one above!</p>
            </div>
          )}

          {!loading && !error && videos.length > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {videos.map((v, i) => (
                <li key={v.id} className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--accent)]/5 transition group">
                  {/* Number */}
                  <span className="w-6 shrink-0 text-center text-xs font-mono text-[var(--fg-muted)] pt-1">
                    {i + 1}
                  </span>

                  {/* Thumbnail preview */}
                  <div className="w-20 h-14 shrink-0 rounded-lg overflow-hidden bg-black">
                    <iframe
                      src={getEmbedUrl(v.url)}
                      title={v.title}
                      className="w-full h-full border-0 pointer-events-none"
                      loading="lazy"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--fg)] truncate">{v.title}</p>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent)] hover:underline truncate block max-w-xs"
                    >
                      {v.url}
                    </a>
                    {v.created_at && (
                      <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                        Added {new Date(v.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(v.id, v.title)}
                    disabled={deletingId === v.id}
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                    title="Delete video"
                  >
                    {deletingId === v.id
                      ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      : <span className="material-symbols-outlined text-[18px]">delete</span>
                    }
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default VideoManagementPage;
