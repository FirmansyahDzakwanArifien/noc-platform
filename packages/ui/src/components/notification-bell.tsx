"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "../cn";

type Item = { id: string; app: string; title: string; body: string | null; url: string | null; read: boolean; created_at: string };

const APP_LABEL: Record<string, string> = {
  jadwal: "Jadwal",
  handover: "Handover",
  perizinan: "Perizinan",
  perkembangan: "Perkembangan",
  core: "Portal",
  portal: "Portal",
};

const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s > -60) return "baru saja";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/**
 * Lonceng notifikasi di header. Data dimuat setelah halaman tampil (tidak menghambat render),
 * lalu diperbarui tiap 60 detik selama tab aktif & saat tab kembali difokuskan.
 */
export function NotificationBell({ allUrl }: { allUrl: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifikasi", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* jaringan putus — coba lagi di interval berikutnya */
    }
  }, []);

  useEffect(() => {
    const idle = (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300))) as (cb: () => void) => void;
    idle(() => void load());
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markRead(id?: string) {
    setItems((list) => list?.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) ?? null);
    setUnread((u) => (id ? Math.max(0, u - (items?.some((n) => n.id === id && !n.read) ? 1 : 0)) : 0));
    void fetch("/api/notifikasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
      keepalive: true,
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative grid size-9 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
        aria-expanded={open}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifikasi</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <div className="space-y-3 p-4" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto size-6 text-slate-300" aria-hidden />
                <p className="mt-2 text-sm font-medium text-slate-700">Belum ada notifikasi</p>
                <p className="mt-0.5 text-xs text-slate-500">Approval, handover, tugas, dan jadwal baru akan muncul di sini.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.url ?? allUrl}
                      onClick={() => !n.read && markRead(n.id)}
                      className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50", !n.read && "bg-brand-50/40")}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-500")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", n.read ? "text-slate-700" : "font-medium text-slate-900")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {APP_LABEL[n.app] ?? n.app} · {ago(n.created_at)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <a href={allUrl} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-50">
            Lihat semua notifikasi
          </a>
        </div>
      )}
    </div>
  );
}
