import { Alert } from "./alert";

/** Tampilkan ?error= / ?success= dari redirect server action. */
export function Flash({ searchParams }: { searchParams: { error?: string | string[]; success?: string | string[] } }) {
  const error = first(searchParams.error);
  const success = first(searchParams.success);
  if (!error && !success) return null;
  return (
    <Alert tone={error ? "error" : "success"} className="mb-4">
      {error ?? success}
    </Alert>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
