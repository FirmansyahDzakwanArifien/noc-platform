import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { APPS } from "./apps";
import { getAuth } from "./auth";
import { createClient } from "./server";

export type BellItem = { id: string; app: string; title: string; body: string | null; url: string | null; read: boolean; created_at: string };

/** Link notifikasi disimpan relatif ke app asalnya (mis. "/cuti" dari perizinan) → jadikan URL absolut. */
function resolve(app: string, link: string | null) {
  if (!link) return null;
  if (/^https?:\/\//.test(link)) return link;
  const base = APPS.find((a) => a.key === app)?.url;
  return base ? base + link : link;
}

/** GET /api/notifikasi — jumlah belum dibaca + 8 terbaru (dipakai lonceng di header semua app). */
export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ unread: 0, items: [] }, { status: 401 });
  const supabase = await createClient();
  const [{ count }, { data }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("notifications").select("id, app, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const items: BellItem[] = (data ?? []).map((n) => ({
    id: n.id,
    app: n.app,
    title: n.title,
    body: n.body,
    url: resolve(n.app, n.link),
    read: !!n.read_at,
    created_at: n.created_at,
  }));
  return NextResponse.json({ unread: count ?? 0, items }, { headers: { "cache-control": "no-store" } });
}

/** POST /api/notifikasi { id } → tandai satu dibaca; tanpa id → tandai semua. */
export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (body.id) q = q.eq("id", body.id);
  const { error } = await q;
  return NextResponse.json({ ok: !error });
}
