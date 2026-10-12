"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import type { ChecklistTemplateItem, Handover } from "@noc/supabase/types";
import { CATEGORIES, isOneOf, ITEM_STATUSES, PRIORITIES } from "@/lib/constants";
import { isUuid, safeBack, wibToIso } from "@/lib/util";

type Ctx = Awaited<ReturnType<typeof actionContext>>;

async function loadHandover(supabase: Ctx["supabase"], id: string, back: string): Promise<Handover> {
  const { data, error } = await supabase.from("handovers").select("*").eq("id", id).maybeSingle();
  if (error) fail(back, dbError(error));
  if (!data) fail(back, "Handover tidak ditemukan.");
  return data as Handover;
}

const editable = (h: Handover) => h.status === "draft" || h.status === "returned";

// ---------- Header ----------

export async function updateHandoverHeader(formData: FormData) {
  const id = req(formData, "id", "/", "ID");
  const back = `/${id}`;
  const { supabase } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (!editable(h)) fail(back, "Handover hanya bisa diubah saat draft atau dikembalikan.");
  const incomingBy = str(formData, "incoming_by");
  if (incomingBy && incomingBy === h.outgoing_by) fail(back, "Penerima tidak boleh sama dengan penyerah.");

  const { error } = await supabase
    .from("handovers")
    .update({ summary: str(formData, "summary"), notes: str(formData, "notes"), incoming_by: incomingBy })
    .eq("id", id);
  if (error) fail(back, dbError(error));
  if (incomingBy) {
    await supabase.from("handover_members").upsert(
      { handover_id: id, user_id: incomingBy, side: "incoming" },
      { onConflict: "handover_id,user_id,side", ignoreDuplicates: true },
    );
  }
  revalidatePath(back);
  done(back, "Handover diperbarui.");
}

// ---------- Workflow ----------

export async function submitHandover(formData: FormData) {
  const id = req(formData, "id", "/", "ID");
  const back = `/${id}`;
  const { supabase, auth } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (h.outgoing_by !== auth.userId) fail(back, "Hanya penyerah yang dapat mengajukan handover.");
  if (!editable(h)) fail(back, "Handover tidak dalam status draft/dikembalikan.");
  if (!h.incoming_by) fail(back, "Tentukan penerima terlebih dahulu.");

  // Item checklist wajib harus terisi (bila checklist dipakai).
  const { data: results } = await supabase
    .from("handover_checklist_results")
    .select("template_item_id, checklist_template_items(template_id)")
    .eq("handover_id", id);
  const templateIds = [
    ...new Set(
      ((results ?? []) as unknown as { checklist_template_items: { template_id: string } | null }[])
        .map((r) => r.checklist_template_items?.template_id)
        .filter((t): t is string => !!t),
    ),
  ];
  if (templateIds.length) {
    const { data: reqItems } = await supabase
      .from("checklist_template_items")
      .select("id, label")
      .in("template_id", templateIds)
      .eq("is_required", true);
    const filled = new Set(((results ?? []) as { template_item_id: string }[]).map((r) => r.template_item_id));
    const missing = ((reqItems ?? []) as { id: string; label: string }[]).filter((i) => !filled.has(i.id));
    if (missing.length) fail(back, `Checklist wajib belum diisi: ${missing.map((m) => m.label).join(", ")}.`);
  }

  const { data, error } = await supabase
    .from("handovers")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "returned"])
    .select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, "Status handover sudah berubah. Muat ulang halaman.");
  revalidatePath(back);
  revalidatePath("/");
  done(back, "Handover diajukan ke penerima.");
}

async function decide(formData: FormData, target: "acknowledged" | "returned") {
  const id = req(formData, "id", "/", "ID");
  const back = `/${id}`;
  const { supabase, auth } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (h.status !== "submitted") fail(back, "Handover belum diajukan.");
  if (h.outgoing_by === auth.userId) fail(back, "Penyerah tidak dapat menerima/mengembalikan handover sendiri.");
  const note = target === "returned" ? req(formData, "ack_note", back, "Alasan pengembalian") : str(formData, "ack_note");

  const patch: Record<string, unknown> = { status: target, ack_note: note };
  if (target === "acknowledged") {
    patch.acknowledged_at = new Date().toISOString();
    if (!h.incoming_by) patch.incoming_by = auth.userId;
  }
  const { data, error } = await supabase.from("handovers").update(patch).eq("id", id).eq("status", "submitted").select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, "Status handover sudah berubah. Muat ulang halaman.");
  revalidatePath(back);
  revalidatePath("/");
  done(back, target === "acknowledged" ? "Handover diterima." : "Handover dikembalikan ke penyerah.");
}

export async function acknowledgeHandover(formData: FormData) {
  return decide(formData, "acknowledged");
}

export async function returnHandover(formData: FormData) {
  return decide(formData, "returned");
}

export async function deleteHandover(formData: FormData) {
  const id = req(formData, "id", "/", "ID");
  const back = `/${id}`;
  const { supabase } = await actionContext(back, "handover.delete");
  const { error } = await supabase.from("handovers").delete().eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/");
  done("/", "Handover dihapus.");
}

// ---------- Items ----------

export async function addItem(formData: FormData) {
  const id = req(formData, "handover_id", "/", "ID");
  const back = `/${id}`;
  const { supabase } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (!editable(h)) fail(back, "Item hanya bisa ditambah saat draft atau dikembalikan.");

  const category = str(formData, "category");
  const priority = str(formData, "priority") ?? "medium";
  const status = str(formData, "status") ?? "open";
  if (!isOneOf(CATEGORIES, category)) fail(back, "Kategori tidak valid.");
  if (!isOneOf(PRIORITIES, priority)) fail(back, "Prioritas tidak valid.");
  if (!isOneOf(ITEM_STATUSES, status)) fail(back, "Status tidak valid.");

  const { error } = await supabase.from("handover_items").insert({
    handover_id: id,
    category,
    title: req(formData, "title", back, "Judul"),
    description: str(formData, "description"),
    priority,
    status,
    ref_ticket: str(formData, "ref_ticket"),
    incident_id: str(formData, "incident_id"),
    due_at: wibToIso(str(formData, "due_at")),
  });
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Item ditambahkan.");
}

/** Ubah status item — dipakai di halaman detail dan /item-terbuka (hidden input "back"). */
export async function updateItemStatus(formData: FormData) {
  const back = safeBack(str(formData, "back"), "/item-terbuka");
  const { supabase } = await actionContext(back, "handover.create");
  const itemId = req(formData, "item_id", back, "Item");
  if (!isUuid(itemId)) fail(back, "Item tidak valid.");
  const status = str(formData, "status");
  if (!isOneOf(ITEM_STATUSES, status)) fail(back, "Status tidak valid.");
  const { data, error } = await supabase.from("handover_items").update({ status }).eq("id", itemId).select("id");
  if (error) fail(back, dbError(error));
  if (!data?.length) fail(back, "Item tidak ditemukan atau Anda tidak memiliki izin.");

  // Samakan status di seluruh rantai item yang dibawa antar handover (carried_from),
  // supaya salinan lama tidak tertinggal sebagai "item terbuka".
  const chain = new Set<string>([itemId]);
  let frontier = [itemId];
  for (let depth = 0; depth < 30 && frontier.length; depth++) {
    const ids = frontier.join(",");
    const { data: rel } = await supabase
      .from("handover_items")
      .select("id, carried_from")
      .or(`id.in.(${ids}),carried_from.in.(${ids})`);
    const next: string[] = [];
    for (const r of (rel ?? []) as { id: string; carried_from: string | null }[]) {
      for (const x of [r.id, r.carried_from]) {
        if (x && !chain.has(x)) {
          chain.add(x);
          next.push(x);
        }
      }
    }
    frontier = next;
  }
  chain.delete(itemId);
  if (chain.size) {
    await supabase.from("handover_items").update({ status }).in("id", [...chain]);
  }

  revalidatePath(back);
  revalidatePath("/item-terbuka");
  done(back, "Status item diperbarui.");
}

export async function deleteItem(formData: FormData) {
  const id = req(formData, "handover_id", "/", "ID");
  const back = `/${id}`;
  const { supabase } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (!editable(h)) fail(back, "Item hanya bisa dihapus saat draft atau dikembalikan.");
  const { error } = await supabase.from("handover_items").delete().eq("id", req(formData, "item_id", back, "Item")).eq("handover_id", id);
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  done(back, "Item dihapus.");
}

// ---------- Checklist ----------

export async function saveChecklist(formData: FormData) {
  const id = req(formData, "handover_id", "/", "ID");
  const templateId = req(formData, "template_id", `/${id}`, "Template");
  const back = `/${id}?template=${templateId}`;
  const { supabase, auth } = await actionContext(back, "handover.create");
  const h = await loadHandover(supabase, id, back);
  if (!editable(h)) fail(back, "Checklist hanya bisa diisi saat draft atau dikembalikan.");

  const { data: itemRows, error: itemErr } = await supabase.from("checklist_template_items").select("*").eq("template_id", templateId);
  if (itemErr) fail(back, dbError(itemErr));
  const items = (itemRows as ChecklistTemplateItem[] | null) ?? [];

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const clear: string[] = [];
  for (const it of items) {
    const raw = str(formData, `v_${it.id}`);
    const note = str(formData, `n_${it.id}`);
    if (raw === null) {
      clear.push(it.id);
      continue;
    }
    let value: unknown;
    let isOk: boolean | null = null;
    switch (it.input_type) {
      case "boolean":
        value = raw === "true";
        isOk = value === true;
        break;
      case "number": {
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n)) fail(back, `Nilai "${it.label}" harus berupa angka.`);
        value = n;
        const min = it.min_value === null ? null : Number(it.min_value);
        const max = it.max_value === null ? null : Number(it.max_value);
        isOk = (min === null || n >= min) && (max === null || n <= max);
        break;
      }
      case "select":
        if (it.options && !it.options.includes(raw)) fail(back, `Pilihan "${it.label}" tidak valid.`);
        value = raw;
        isOk = true;
        break;
      default:
        value = raw;
        isOk = true;
    }
    rows.push({ handover_id: id, template_item_id: it.id, value, is_ok: isOk, note, checked_by: auth.userId, checked_at: now });
  }

  if (rows.length) {
    const { error } = await supabase.from("handover_checklist_results").upsert(rows, { onConflict: "handover_id,template_item_id" });
    if (error) fail(back, dbError(error));
  }
  if (clear.length) {
    const { error } = await supabase.from("handover_checklist_results").delete().eq("handover_id", id).in("template_item_id", clear);
    if (error) fail(back, dbError(error));
  }
  revalidatePath(`/${id}`);
  const notOk = rows.filter((r) => r.is_ok === false).length;
  done(back, notOk ? `Checklist tersimpan. ${notOk} item tidak normal.` : "Checklist tersimpan.");
}
