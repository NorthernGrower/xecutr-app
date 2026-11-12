import { getRequest } from "@tanstack/react-start/server";

/** Signed-out turns allowed per address per day on the shared keyless gateway. */
const LIMIT = 20;

const dayKey = () => new Date().toISOString().slice(0, 10);

const clientAddress = () => {
  try {
    const headers = getRequest()?.headers;
    const forwarded = (headers?.get("x-forwarded-for") || "").split(",")[0].trim();
    return headers?.get("cf-connecting-ip") || headers?.get("x-real-ip") || forwarded || "";
  } catch {
    return "";
  }
};

// The raw address is never stored — only a short hash, salted with the day so the
// table cannot be used to recognise a visitor across days.
const digest = async (value) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Counts one signed-out turn against the caller's daily allowance.
 * Returns false once the allowance is spent.
 */
export const spendTrialTurn = async (context) => {
  const admin = context.getBase44().asServiceRole;
  const day = dayKey();
  const ip_hash = await digest(`${clientAddress() || "unknown"}:${day}`);

  const rows = await admin.entities.TrialQuota.filter({ day, ip_hash }, "-created_date", 1);
  const row = rows?.[0];

  if (!row) {
    await admin.entities.TrialQuota.create({ day, ip_hash, count: 1 });
    return true;
  }
  if ((row.count || 0) >= LIMIT) return false;
  await admin.entities.TrialQuota.update(row.id, { count: (row.count || 0) + 1 });
  return true;
};

export const TRIAL_LIMIT = LIMIT;