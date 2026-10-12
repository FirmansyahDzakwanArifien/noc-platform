"use server";

import { revalidatePath } from "next/cache";
import { actionContext, bool, dbError, done, fail, req, str } from "@noc/supabase/actions";
import type { HandoverItem, Shift, ShiftSchedule } from "@noc/supabase/types";
import { addDays, isDate, isUuid } from "@/lib/util";

export async function createHandover(formData: FormData) {
  const back = "/baru";
  const { supabase, auth } = await actionContext(back, "handover.create");

  const siteId = str(formData, "site_id");
  if (siteId && !isUuid(siteId)) fail(back, "Site tidak valid.");
  const shiftDate = req(formData, "shift_date", back, "Tanggal shift");
  if (!isDate(shiftDate)) fail(back, "Tanggal shift tidak valid.");
  const fromShiftId = req(formData, "from_shift_id", back, "Dari shift");
  const toShiftId = req(formData, "to_shift_id", back, "Ke shift");
  if (fromShiftId === toShiftId) fail(back, "Shift asal dan tujuan tidak boleh sama.");
  let incomingBy = str(formData, "incoming_by");
  const carryOver = bool(formData, "carry_over");

  const { data: shiftRows, error: shiftErr } = await supabase.from("shifts").select("*").in("id", [fromShiftId, toShiftId]);
  if (shiftErr) fail(back, dbError(shiftErr));
  const shifts = (shiftRows as Shift[] | null) ?? [];
  const from = shifts.find((s) => s.id === fromShiftId);
  const to = shifts.find((s) => s.id === toShiftId);
  if (!from || !to || !from.is_working || !to.is_working) fail(back, "Shift tidak valid.");

  // Shift tujuan mulai lebih awal dari shift asal (mis. Malam → Pagi) → jadwal penerima ada di hari berikutnya.
  const incomingDate = (to.start_time ?? "") < (from.start_time ?? "") ? addDays(shiftDate, 1) : shiftDate;

  // Jadwal (RLS: hanya periode published kecuali schedule.manage). Gagal baca jadwal bukan error fatal.
  const schedQuery = (date: string, shiftId: string) => {
    let q = supabase.from("shift_schedules").select("*").eq("work_date", date).eq("shift_id", shiftId);
    if (siteId) q = q.or(`site_id.eq.${siteId},site_id.is.null`);
    return q;
  };
  const [outSched, inSched] = await Promise.all([schedQuery(shiftDate, fromShiftId), schedQuery(incomingDate, toShiftId)]);
  const outgoing = (outSched.data as ShiftSchedule[] | null) ?? [];
  const incoming = (inSched.data as ShiftSchedule[] | null) ?? [];

  if (!incomingBy) {
    incomingBy = incoming.find((s) => s.is_leader && s.user_id !== auth.userId)?.user_id ?? null;
  }
  if (incomingBy === auth.userId) fail(back, "Penerima tidak boleh sama dengan penyerah.");

  const { data: created, error } = await supabase
    .from("handovers")
    .insert({
      site_id: siteId,
      shift_date: shiftDate,
      from_shift_id: fromShiftId,
      to_shift_id: toShiftId,
      outgoing_by: auth.userId,
      incoming_by: incomingBy,
      summary: str(formData, "summary"),
      notes: str(formData, "notes"),
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !created) fail(back, dbError(error));
  const id = (created as { id: string }).id;
  const warnings: string[] = [];

  // Anggota tim
  const members = new Map<string, { handover_id: string; user_id: string; side: string }>();
  const addMember = (userId: string, side: "outgoing" | "incoming") =>
    members.set(`${userId}:${side}`, { handover_id: id, user_id: userId, side });
  addMember(auth.userId, "outgoing");
  outgoing.forEach((s) => addMember(s.user_id, "outgoing"));
  if (incomingBy) addMember(incomingBy, "incoming");
  incoming.forEach((s) => addMember(s.user_id, "incoming"));
  const { error: memErr } = await supabase.from("handover_members").insert([...members.values()]);
  if (memErr) warnings.push(`anggota tim gagal disimpan (${dbError(memErr)})`);

  // Bawa item terbuka dari handover sebelumnya (site sama)
  let carried = 0;
  if (carryOver) {
    let prevQ = supabase
      .from("handovers")
      .select("id")
      .neq("id", id)
      .lte("shift_date", shiftDate)
      .order("shift_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    prevQ = siteId ? prevQ.eq("site_id", siteId) : prevQ.is("site_id", null);
    const { data: prev } = await prevQ.maybeSingle();
    if (prev) {
      const { data: openItems } = await supabase
        .from("handover_items")
        .select("*")
        .eq("handover_id", (prev as { id: string }).id)
        .in("status", ["open", "in_progress"])
        .order("sort_order");
      const items = (openItems as HandoverItem[] | null) ?? [];
      if (items.length) {
        const { error: itemErr } = await supabase.from("handover_items").insert(
          items.map((it) => ({
            handover_id: id,
            category: it.category,
            title: it.title,
            description: it.description,
            priority: it.priority,
            status: it.status,
            incident_id: it.incident_id,
            ref_ticket: it.ref_ticket,
            due_at: it.due_at,
            sort_order: it.sort_order,
            carried_from: it.id,
          })),
        );
        if (itemErr) warnings.push(`item terbuka gagal disalin (${dbError(itemErr)})`);
        else carried = items.length;
      }
    }
  }

  revalidatePath("/");
  const path = `/${id}`;
  if (warnings.length) fail(path, `Draft dibuat, tetapi ${warnings.join("; ")}.`);
  done(path, carried ? `Draft handover dibuat. ${carried} item terbuka dibawa dari handover sebelumnya.` : "Draft handover dibuat.");
}
