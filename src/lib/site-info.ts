import type { Settings } from "@/lib/settings/schema";

/** A setting the operator has not filled in yet: empty, or the "[…]" placeholder of the defaults. */
export function isUnfilled(value: string | null | undefined): boolean {
  const v = value?.trim() ?? "";
  return v === "" || /^\[.*\]$/.test(v);
}

/** Operator details for footers and legal texts; unfilled ones become `missing`. */
export function operatorDetails(settings: Settings, missing: string) {
  const pick = (v: string) => (isUnfilled(v) ? missing : v);
  return {
    operator: pick(settings.operator_name),
    companyId: pick(settings.operator_id),
    address: pick(settings.operator_address),
    email: pick(settings.contact_email),
  };
}
