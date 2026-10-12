import type { Tone } from "@noc/ui";
import type { LeaveType, PermitStatus, PermitType, Priority } from "@noc/supabase/types";

export const PERMIT_TYPES: Record<PermitType, string> = {
  akses_site: "Akses Site",
  pekerjaan: "Pekerjaan",
  maintenance: "Maintenance",
  change_request: "Change Request",
  keluar_masuk_barang: "Keluar/Masuk Barang",
};

export const PERMIT_STATUSES: Record<PermitStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  in_review: "Ditinjau",
  approved: "Disetujui",
  rejected: "Ditolak",
  active: "Aktif",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};

/** Penjelasan singkat tiap jenis izin (hint di form). */
export const PERMIT_TYPE_HINTS: Record<PermitType, string> = {
  akses_site: "Kunjungan/akses ke lokasi tanpa pekerjaan teknis.",
  pekerjaan: "Pekerjaan instalasi/perbaikan di lokasi.",
  maintenance: "Pemeliharaan rutin atau terjadwal.",
  change_request: "Perubahan konfigurasi/perangkat produksi. Wajib rencana rollback.",
  keluar_masuk_barang: "Membawa perangkat/barang masuk atau keluar lokasi.",
};

export const RISK_LEVELS: Record<Priority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

export const RISK_TONES: Record<Priority, Tone> = {
  low: "gray",
  medium: "blue",
  high: "orange",
  critical: "red",
};

export const LEAVE_HINTS: Record<LeaveType, string> = {
  cuti: "Cuti yang direncanakan (tahunan/pribadi).",
  izin: "Tidak masuk karena keperluan mendesak.",
  sakit: "Tidak masuk karena sakit.",
  tukar_shift: "Minta rekan menggantikan salah satu jadwal shift Anda.",
  dinas: "Tugas di luar kantor/lokasi kerja.",
};

export const LEAVE_TYPES: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  tukar_shift: "Tukar Shift",
  dinas: "Dinas",
};

/** Jumlah baris kosong personel / barang di form pengajuan. */
export const ROW_COUNT = 5;

export function isPermitType(v: string | null | undefined): v is PermitType {
  return !!v && v in PERMIT_TYPES;
}

export function isPermitStatus(v: string | null | undefined): v is PermitStatus {
  return !!v && v in PERMIT_STATUSES;
}

export function isLeaveType(v: string | null | undefined): v is LeaveType {
  return !!v && v in LEAVE_TYPES;
}

export function isPriority(v: string | null | undefined): v is Priority {
  return !!v && v in RISK_LEVELS;
}
