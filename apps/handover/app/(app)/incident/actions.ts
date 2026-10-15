"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import { INCIDENT_CATEGORIES, INCIDENT_STATUSES, isOneOf, PRIORITIES, SECURITY_TYPES } from "@/lib/constants";
import { isUuid, wibToIso } from "@/lib/util";

type Ctx = Awaited<ReturnType<typeof actionContext>>;

/**
 * Divisi, kategori & detail keamanan dari form. Detail keamanan hanya disimpan bila bagiannya
 * tampil di form (kategori "keamanan" atau divisi SOC) atau jenis serangan diisi; selain itu
 * dikosongkan (field tersembunyi yang tidak relevan).
 */
async function classification(supabase: Ctx["supabase"], formData: FormData, back: string) {
  const divisionId = str(formData, "division_id");
  if (divisionId !== null && !isUuid(divisionId)) fail(back, "Divisi tidak valid.");
  let isSoc = false;
  if (divisionId !== null) {
    const { data: div, error: divErr } = await supabase.from("divisions").select("code").eq("id", divisionId).maybeSingle();
    if (divErr) fail(back, dbError(divErr));
    if (!div) fail(back, "Divisi tidak ditemukan.");
    isSoc = (div as { code: string }).code.toUpperCase() === "SOC";
  }
  const category = str(formData, "category") ?? "jaringan";
  if (!isOneOf(INCIDENT_CATEGORIES, category)) fail(back, "Kategori tidak valid.");
  const securityType = str(formData, "security_type");
  if (securityType !== null && !isOneOf(SECURITY_TYPES, securityType)) fail(back, "Jenis serangan tidak valid.");
  const keepSecurity = category === "keamanan" || isSoc || securityType !== null;
  return {
    division_id: divisionId,
    category,
    security_type: keepSecurity ? securityType : null,
    mitre_technique: keepSecurity ? str(formData, "mitre_technique") : null,
    iocs: keepSecurity ? normalizeLines(str(formData, "iocs")) : null,
    affected_assets: keepSecurity ? str(formData, "affected_assets") : null,
  };
}

/** Rapikan daftar per baris: trim tiap baris & buang baris kosong. */
function normalizeLines(v: string | null): string | null {
  if (!v) return null;
  const lines = v
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export async function createIncident(formData: FormData) {
  const back = "/incident/baru";
  const { supabase, auth } = await actionContext(back, "incident.manage");
  const severity = str(formData, "severity") ?? "medium";
  if (!isOneOf(PRIORITIES, severity)) fail(back, "Severity tidak valid.");
  const startedRaw = str(formData, "started_at");
  const startedAt = wibToIso(startedRaw);
  if (startedRaw && !startedAt) fail(back, "Waktu mulai tidak valid.");
  const cls = await classification(supabase, formData, back);

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      title: req(formData, "title", back, "Judul"),
      description: str(formData, "description"),
      site_id: str(formData, "site_id"),
      severity,
      affected_service: str(formData, "affected_service"),
      external_ticket: str(formData, "external_ticket"),
      reported_by: auth.userId,
      assigned_to: str(formData, "assigned_to"),
      ...cls,
      ...(startedAt ? { started_at: startedAt } : {}),
    })
    .select("id, division_id")
    .single();
  if (error || !data) fail(back, dbError(error));
  const created = data as { id: string; division_id: string | null };
  // Trigger DB mengisi divisi pembuat bila kosong; "Umum" dipilih eksplisit → kosongkan lagi.
  if (cls.division_id === null && created.division_id !== null) {
    const { error: divErr } = await supabase.from("incidents").update({ division_id: null }).eq("id", created.id);
    if (divErr) fail(`/incident/${created.id}`, dbError(divErr));
  }
  revalidatePath("/incident");
  done(`/incident/${created.id}`, "Incident dicatat. Tambahkan perkembangan penanganan di timeline.");
}

/** Status baru → nilai resolved_at yang sesuai. */
function resolvedPatch(status: string, current: string | null) {
  if (status === "resolved") return { resolved_at: new Date().toISOString() };
  if (status === "closed") return { resolved_at: current ?? new Date().toISOString() };
  return { resolved_at: null };
}

export async function addIncidentUpdate(formData: FormData) {
  const id = req(formData, "incident_id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase, auth } = await actionContext(back, "incident.manage");
  const content = req(formData, "content", back, "Isi update");
  const status = str(formData, "status");
  if (status !== null && !isOneOf(INCIDENT_STATUSES, status)) fail(back, "Status tidak valid.");

  const { data: inc, error: incErr } = await supabase.from("incidents").select("status, resolved_at").eq("id", id).maybeSingle();
  if (incErr) fail(back, dbError(incErr));
  if (!inc) fail(back, "Incident tidak ditemukan.");
  const current = inc as { status: string; resolved_at: string | null };
  const changed = status !== null && status !== current.status;

  const { error } = await supabase
    .from("incident_updates")
    .insert({ incident_id: id, content, status: changed ? status : null, created_by: auth.userId });
  if (error) fail(back, dbError(error));

  if (changed && status) {
    const { error: upErr } = await supabase
      .from("incidents")
      .update({ status, ...resolvedPatch(status, current.resolved_at) })
      .eq("id", id);
    if (upErr) fail(back, dbError(upErr));
  }
  revalidatePath(back);
  revalidatePath("/incident");
  done(back, changed ? "Update ditambahkan dan status diubah." : "Update ditambahkan.");
}

export async function updateIncident(formData: FormData) {
  const id = req(formData, "id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase } = await actionContext(back, "incident.manage");
  const severity = str(formData, "severity") ?? "medium";
  if (!isOneOf(PRIORITIES, severity)) fail(back, "Severity tidak valid.");
  const cls = await classification(supabase, formData, back);

  const { error } = await supabase
    .from("incidents")
    .update({
      ...cls,
      severity,
      assigned_to: str(formData, "assigned_to"),
      affected_service: str(formData, "affected_service"),
      external_ticket: str(formData, "external_ticket"),
      root_cause: str(formData, "root_cause"),
      resolution: str(formData, "resolution"),
    })
    .eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  revalidatePath("/incident");
  done(back, "Incident diperbarui.");
}

export async function deleteIncident(formData: FormData) {
  const id = req(formData, "id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase } = await actionContext(back, "incident.delete");
  const { error } = await supabase.from("incidents").delete().eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/incident");
  done("/incident", "Incident dihapus.");
}
