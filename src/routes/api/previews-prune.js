import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";

/** Preview addresses past their expiry serve nothing, so they are cleared here. */
export const Route = createFileRoute("/api/previews-prune")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ context }) => {
        if (context.user?.role !== "admin") {
          return Response.json({ error: "Only an admin can clear previews." }, { status: 403 });
        }

        const admin = context.getBase44().asServiceRole;
        const now = new Date().toISOString();
        const stale = { expires_at: { $lt: now } };

        const count = await admin.entities.PreviewSession.count(stale);
        if (count > 0) await admin.entities.PreviewSession.deleteMany(stale);

        return Response.json({ deleted: count, at: now });
      },
    },
  },
});