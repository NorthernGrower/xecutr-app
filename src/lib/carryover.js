import { base44 } from "@/api/base44Client";
import { fileBlocks } from "@/lib/text-segments";
import { clearTrial, projectNameFrom, readTrial } from "@/lib/trial";

/**
 * A signed-out trial becomes the user's first project on their first visit
 * after signing up — same messages, same files, nothing retyped.
 */
export async function carryTrialIntoProject() {
  const trial = readTrial();
  if (!trial.messages?.length) return null;

  const firstUser = trial.messages.find((m) => m.role === "user");
  if (!firstUser) {
    clearTrial();
    return null;
  }

  const project = await base44.entities.Project.create({
    name: projectNameFrom(firstUser.content),
    summary: firstUser.content.slice(0, 300),
    message_count: trial.messages.length,
    last_activity: new Date().toISOString(),
  });

  for (const message of trial.messages) {
    await base44.entities.Message.create({
      project_id: project.id,
      role: message.role,
      content: message.content,
      ...(message.role === "assistant" ? { provider: "keyless gateway", model: "auto" } : {}),
    });

    if (message.role === "assistant") {
      for (const block of fileBlocks(message.content)) {
        await base44.entities.ProjectFile.create({
          project_id: project.id,
          path: block.path,
          content: block.content,
          size: block.content.length,
        });
      }
    }
  }

  const count = await base44.entities.ProjectFile.count({ project_id: project.id });
  await base44.entities.Project.update(project.id, { file_count: count });
  clearTrial();
  return project;
}