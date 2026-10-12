"use client";

import type { SelectHTMLAttributes } from "react";
import { Select } from "@noc/ui";

/** <Select> yang langsung men-submit form induknya saat nilainya berubah. */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
