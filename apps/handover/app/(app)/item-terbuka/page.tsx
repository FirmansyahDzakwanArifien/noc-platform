import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { HandoverItem } from "@noc/supabase/types";
import {
  buttonClass,
  Card,
  EmptyState,
  Flash,
  Forbidden,
  formatDate,
  formatDateTime,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@noc/ui";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { CATEGORIES, categoryLabel, isOneOf, ITEM_STATUSES, PRIORITIES } from "@/lib/constants";
import { loadSites } from "@/lib/data";
import { first } from "@/lib/util";
import { updateItemStatus } from "../[id]/actions";

export const metadata = { title: "Item Terbuka" };

type OpenItem = Pick<
  HandoverItem,
  "id" | "handover_id" | "category" | "title" | "description" | "priority" | "status" | "ref_ticket" | "carried_from" | "due_at"
> & { handover_no: string | null; shift_date: string; site_id: string | null };

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function OpenItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("handover.view")) return <Forbidden />;

  const category = first(sp.category) ?? "";
  const priority = first(sp.priority) ?? "";

  const supabase = await createClient();
  let q = supabase.from("v_open_handover_items").select("id, handover_id, category, title, description, priority, status, ref_ticket, carried_from, due_at, handover_no, shift_date, site_id")
    .order("shift_date", { ascending: false }).limit(300);
  if (isOneOf(CATEGORIES, category)) q = q.eq("category", category);
  if (isOneOf(PRIORITIES, priority)) q = q.eq("priority", priority);
  const [{ data }, sites] = await Promise.all([q, loadSites(supabase)]);

  // Satu baris per "rantai" item: jika item sudah dibawa ke handover yang lebih baru, sembunyikan versi lamanya.
  const all = (data as OpenItem[] | null) ?? [];
  const carriedIds = new Set(all.map((i) => i.carried_from).filter((x): x is string => !!x));
  const rows = all
    .filter((i) => !carriedIds.has(i.id))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || b.shift_date.localeCompare(a.shift_date));
  const canUpdate = auth.can("handover.create");
  const filtered = !!(category || priority);
  const now = Date.now();
  const back = `/item-terbuka${category || priority ? `?${new URLSearchParams({ category, priority }).toString()}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Item Terbuka"
        description="Semua item handover yang belum selesai (Open / Dikerjakan), diurutkan dari prioritas tertinggi."
      />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-48">
          <Select name="category" defaultValue={category} aria-label="Kategori">
            <option value="">Semua kategori</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select name="priority" defaultValue={priority} aria-label="Prioritas">
            <option value="">Semua prioritas</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Terapkan
        </button>
        {filtered && (
          <Link href="/item-terbuka" className={buttonClass("ghost")}>
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Tidak ada item yang cocok"
            description="Tidak ada item terbuka untuk kategori/prioritas ini."
            action={
              <Link href="/item-terbuka" className={buttonClass("secondary")}>
                Reset filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Tidak ada item terbuka"
            description="Semua item handover sudah selesai. Item baru muncul di sini saat ditambahkan ke handover dengan status Open atau Dikerjakan."
          />
        )
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="hidden md:table-cell">Kategori</TH>
                <TH className="hidden sm:table-cell">Prioritas</TH>
                <TH className="hidden md:table-cell">Handover</TH>
                <TH className="hidden lg:table-cell">Site</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((it) => (
                <TR key={it.id}>
                  <TD className="sm:min-w-56">
                    <p className="break-words font-medium text-slate-900">{it.title}</p>
                    {it.description && <p className="line-clamp-2 break-words text-xs text-slate-500">{it.description}</p>}
                    <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                      {it.ref_ticket && <span>Tiket eksternal: {it.ref_ticket}</span>}
                      {it.due_at && (
                        <span className={new Date(it.due_at).getTime() < now ? "font-medium text-red-700" : undefined}>
                          Tenggat: {formatDateTime(it.due_at)}
                          {new Date(it.due_at).getTime() < now && " (lewat)"}
                        </span>
                      )}
                    </p>
                    {/* Ringkasan untuk layar kecil (kolom lain disembunyikan) */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 md:hidden">
                      <span className="sm:hidden">
                        <StatusBadge status={it.priority} />
                      </span>
                      <span>{categoryLabel(it.category)}</span>
                      <span>·</span>
                      <Link href={`/${it.handover_id}`} className="text-brand-600 hover:underline">
                        {it.handover_no ?? "Handover"}
                      </Link>
                    </div>
                  </TD>
                  <TD className="hidden whitespace-nowrap md:table-cell">{categoryLabel(it.category)}</TD>
                  <TD className="hidden sm:table-cell">
                    <StatusBadge status={it.priority} />
                  </TD>
                  <TD className="hidden whitespace-nowrap md:table-cell">
                    <Link href={`/${it.handover_id}`} className="text-brand-600 hover:underline">
                      {it.handover_no ?? "Handover"}
                    </Link>
                    <p className="text-xs text-slate-500">{formatDate(it.shift_date)}</p>
                  </TD>
                  <TD className="hidden lg:table-cell">{sites.name(it.site_id)}</TD>
                  <TD>
                    {canUpdate ? (
                      <form action={updateItemStatus}>
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="back" value={back} />
                        <AutoSubmitSelect name="status" defaultValue={it.status} aria-label={`Status item ${it.title}`} className="h-8 w-32 text-xs sm:w-36">
                          {ITEM_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    ) : (
                      <StatusBadge status={it.status} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
