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

type OpenItem = HandoverItem & { handover_no: string | null; shift_date: string; site_id: string | null };

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
  let q = supabase.from("v_open_handover_items").select("*").order("shift_date", { ascending: false }).limit(300);
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
  const back = `/item-terbuka${category || priority ? `?${new URLSearchParams({ category, priority }).toString()}` : ""}`;

  return (
    <div>
      <PageHeader title="Item Terbuka" description="Butir handover yang masih open / sedang dikerjakan." />
      <Flash searchParams={sp} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Select name="category" defaultValue={category} aria-label="Kategori">
            <option value="">Semua kategori</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
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
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada item terbuka" description="Semua butir handover sudah selesai." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Kategori</TH>
                <TH>Prioritas</TH>
                <TH>Handover</TH>
                <TH>Site</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((it) => (
                <TR key={it.id}>
                  <TD className="min-w-56">
                    <p className="font-medium text-slate-900">{it.title}</p>
                    {it.description && <p className="line-clamp-2 text-xs text-slate-500">{it.description}</p>}
                    {it.ref_ticket && <p className="text-xs text-slate-500">Tiket: {it.ref_ticket}</p>}
                  </TD>
                  <TD className="whitespace-nowrap">{categoryLabel(it.category)}</TD>
                  <TD>
                    <StatusBadge status={it.priority} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    <Link href={`/${it.handover_id}`} className="text-brand-600 hover:underline">
                      {it.handover_no ?? "Handover"}
                    </Link>
                    <p className="text-xs text-slate-500">{formatDate(it.shift_date)}</p>
                  </TD>
                  <TD>{sites.name(it.site_id)}</TD>
                  <TD>
                    {canUpdate ? (
                      <form action={updateItemStatus}>
                        <input type="hidden" name="item_id" value={it.id} />
                        <input type="hidden" name="back" value={back} />
                        <AutoSubmitSelect name="status" defaultValue={it.status} aria-label="Status item" className="h-8 w-36 text-xs">
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
