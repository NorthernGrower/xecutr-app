import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-middleware";

/**
 * Admin-only server function: recent anonymous trial usage, as the admin page's
 * usage table. Runs with the caller's identity (requireUser), refuses anyone
 * whose platform role isn't "admin", then reads quota rows with the service
 * role so entity access rules don't hide them.
 */
export const adminTrialUsage = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (context.user.role !== "admin") {
      throw Object.assign(new Error("Admins only"), { status: 403 });
    }
    const admin = context.getBase44().asServiceRole;
    const rows = await admin.entities.TrialQuota.filter({}, "-created_date", 50);
    return {
      limit: 20,
      rows: (rows || []).map((r) => ({
        id: r.id,
        day: r.day,
        ip_hash: (r.ip_hash || "").slice(0, 12),
        count: r.count || 0,
      })),
    };
  });
