import { fileBlocks, splitMedia, splitTasks } from "@/lib/text-segments";

/**
 * Saves a finished turn on the server, under the caller's own credentials.
 *
 * The browser used to do this after the reply arrived, which meant a closed tab
 * lost the answer, its files and its notes even though the model had finished.
 * Moving it here means the turn's results belong to the request that produced
 * them: the server writes them as it finishes, and the project is already up to
 * date whenever the person comes back.
 *
 * Returns true when the turn was written; false when there was nothing to write
 * to (no project, no signed-in user) so the browser can fall back.
 */
export async function saveTurn({ data, context, turn }) {
  const projectId = data?.projectId;
  if (!projectId || !turn?.text) return false;

  let base44;
  try {
    base44 = context.getBase44();
  } catch {
    return false;
  }

  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  // Entity rules are per user: without one, every write below would be refused.
  if (!user) return false;

  try {
    const { text: withoutMedia } = splitMedia(turn.text);
    const { text: withoutTasks, requests: taskRequests } = splitTasks(withoutMedia);
    const reply = withoutTasks || turn.text;
    const route = Array.isArray(turn.routes) ? turn.routes : [];

    const message = {
      project_id: projectId,
      role: "assistant",
      content: reply,
      provider: turn.providerName || "",
      model: turn.modelLabel || "",
    };
    try {
      await base44.entities.Message.create({ ...message, route });
    } catch {
      // A deployment whose Message schema does not know `route` yet still saves the turn.
      await base44.entities.Message.create(message);
    }

    // A plan turn never writes files, even if the model emitted blocks anyway.
    if (data.mode !== "plan") {
      for (const block of fileBlocks(turn.text)) {
        const existing = await base44.entities.ProjectFile.filter(
          { project_id: projectId, path: block.path },
          "-created_date",
          1,
        );
        if (existing?.[0]) {
          await base44.entities.ProjectFile.update(existing[0].id, {
            content: block.content,
            size: block.content.length,
          });
        } else {
          await base44.entities.ProjectFile.create({
            project_id: projectId,
            path: block.path,
            content: block.content,
            size: block.content.length,
          });
        }
      }
    }

    // The pinned task list: `[[task: …]]` adds a step, `[[done: …]]` closes one.
    if (taskRequests?.length) {
      const known = (await base44.entities.AgentTask.filter({ project_id: projectId }, "created_date", 100)) || [];
      const key = (value) => String(value || "").trim().toLowerCase();

      for (const request of taskRequests) {
        const title = request.text.trim();
        if (!title) continue;
        const match = known.find((task) => key(task.title) === key(title));

        if (request.kind === "done") {
          if (match && match.status !== "done") {
            await base44.entities.AgentTask.update(match.id, { status: "done" });
          }
          continue;
        }

        if (!match) {
          const created = await base44.entities.AgentTask.create({
            project_id: projectId,
            title,
            status: "queued",
            kind: "build",
          });
          known.push(created);
        }
      }
    }

    const asked =
      data.prompt ||
      [...(data.messages || [])].reverse().find((m) => m.role === "user")?.content ||
      "";

    await base44.entities.MemoryNote.create({
      project_id: projectId,
      note: `Asked: "${String(asked).slice(0, 160)}" — reply: ${reply.slice(0, 180)}`,
      provider: turn.providerName || "",
      model: turn.modelLabel || "",
    });

    const project = await base44.entities.Project.get(projectId).catch(() => null);
    const count = await base44.entities.ProjectFile.count({ project_id: projectId }).catch(() => 0);
    await base44.entities.Project.update(projectId, {
      provider: turn.providerName || "",
      model: turn.modelLabel || "",
      file_count: count,
      last_activity: new Date().toISOString(),
      message_count: (project?.message_count || 0) + 1,
    }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}
