import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedX from "@/components/brand/AnimatedX";
import Composer from "@/components/workspace/Composer";
import MessageBubble from "@/components/workspace/MessageBubble";
import ModelPicker from "@/components/workspace/ModelPicker";
import PromptHistory from "@/components/workspace/PromptHistory";
import MediaDialog from "@/components/workspace/MediaDialog";
import ProjectTasks from "@/components/workspace/ProjectTasks";
import useXecutrChat from "@/hooks/use-xecutr-chat";
import useMediaJob from "@/hooks/use-media-job";
import { attachArtifact, xecutrCatalog } from "@/lib/chat";
import { mergeCatalog, modelLabel } from "@/lib/catalog";
import { isTextLike, readKeys, readSettings, saveSettings } from "@/lib/providers";
import { imageAttachment, imageFilesFrom } from "@/lib/images";
import { fileBlocks, textOfMessage } from "@/lib/text-segments";
import { addTrialMessage } from "@/lib/trial";

const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_INSPECT = 8 * 1024 * 1024;

/** A generated asset is saved with an extension its own element can play. */
const MEDIA_EXT = { image: "jpg", video: "mp4", music: "mp3" };

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });

/**
 * Every provider key saved on this device, sent once per turn and only over the
 * encrypted hop. The gateway uses them for the pinned provider and for automatic
 * routing, then forgets them — nothing is stored server-side.
 */
const keysFor = () => readKeys();

const labelFor = (settings, providers) => {
  const provider = providers.find((p) => p.id === settings.providerId);
  return {
    provider: provider?.label || "xecutr gateway",
    model: provider ? modelLabel(provider, settings.model) : "auto",
  };
};

/**
 * The one chat surface. Every turn streams from the xecutr gateway through the
 * server proxy; a saved project sends its files and memory along and keeps the
 * files the gateway writes.
 */
export default function ChatPane({
  projectId,
  initialMessages = [],
  pendingPrompt,
  onSaved,
  trial = false,
  onOpenFile,
  mode: initialMode = "build",
}) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [settings, setSettings] = useState({ providerId: "", model: "" });
  const [mode, setMode] = useState(initialMode);
  const [catalog, setCatalog] = useState({ providers: [] });
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [notice, setNotice] = useState(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Gateway catalogue plus the shipped provider/models list, so every free
  // model (OVH included) is pickable even before the catalogue answers.
  const providers = useMemo(() => mergeCatalog(catalog), [catalog]);

  const projectRef = useRef(projectId);
  const settingsRef = useRef(settings);
  const savedRef = useRef(onSaved);
  const lastPromptRef = useRef("");
  const sentPending = useRef(false);
  const endRef = useRef(null);
  const modeRef = useRef(initialMode);

  projectRef.current = projectId;
  settingsRef.current = settings;
  savedRef.current = onSaved;
  modeRef.current = mode;

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      // The shipped catalogue stands in when the gateway's live one is unreachable,
      // so a catalogue failure is never worth an error banner.
      const next = await xecutrCatalog({ data: { keys: readKeys() } });
      if (next?.providers?.length) setCatalog(next);
    } catch {
      /* keep the shipped list */
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  /** The gateway sends its whole working file set after each write. */
  const writeFiles = useCallback(
    async (incoming) => {
      const pid = projectRef.current;
      // A plan turn never writes, even if the model emits files anyway.
      if (!pid || trial || modeRef.current === "plan") return;

      for (const file of incoming) {
        if (!file?.path) continue;
        const content = typeof file.content === "string" ? file.content : "";
        const existing = await base44.entities.ProjectFile.filter(
          { project_id: pid, path: file.path },
          "-created_date",
          1,
        );
        if (existing[0]) {
          await base44.entities.ProjectFile.update(existing[0].id, { content, size: content.length });
        } else {
          await base44.entities.ProjectFile.create({
            project_id: pid,
            path: file.path,
            content,
            size: content.length,
          });
        }
      }
    },
    [trial],
  );

  // Generated media is written like any other file, and shown on the turn that asked for it.
  const attachRef = useRef(() => {});
  const { run: runMedia } = useMediaJob();

  const saveGenerated = useCallback(
    async (requests, messageId) => {
      const request = requests?.[0];
      if (!request) return;

      const done = await runMedia(request);
      if (!done) return;

      const content = done.dataUrl || done.url;
      if (!content) {
        setNotice("That file is on the server but too large to store in this project.");
        return;
      }

      const ext = MEDIA_EXT[done.kind] || "bin";
      const path = `assets/generated/${done.kind}-${done.id}.${ext}`;
      attachRef.current(messageId, [
        {
          kind: done.kind,
          path,
          dataUrl: done.dataUrl || null,
          url: done.url || null,
          prompt: done.prompt,
        },
      ]);
      // Only an inline copy can live in a project file; a long track stays on
      // the server and the message plays it from its address.
      if (done.dataUrl) {
        await writeFiles([{ path, content }]);
      } else {
        setNotice(`That track is on the server at ${done.url} — too long to store as a project file.`);
      }
    },
    [runMedia, writeFiles],
  );

  /** What the media panel makes lands in the project too. */
  const saveFromPanel = useCallback(
    async (done) => {
      if (!done?.dataUrl) {
        if (done?.url) setNotice(`That track is on the server at ${done.url} — too long to store as a project file.`);
        return;
      }
      const ext = MEDIA_EXT[done.kind] || "bin";
      await writeFiles([{ path: `assets/generated/${done.kind}-${done.id}.${ext}`, content: done.dataUrl }]);
      savedRef.current?.();
    },
    [writeFiles],
  );

  /**
   * The harness's pinned memory: `[[task: …]]` and `[[done: …]]` markers from a
   * reply become, or close, entries in this project's task list — the list that
   * rides along with every turn and survives context trimming.
   */
  const recordTasks = useCallback(
    async (requests) => {
      const pid = projectRef.current;
      if (!pid || trial || !requests?.length) return;

      const existing = await base44.entities.AgentTask.filter({ project_id: pid }, "created_date", 100);
      const key = (value) => String(value || "").trim().toLowerCase();

      for (const request of requests) {
        const title = request.text.trim();
        if (!title) continue;
        const match = existing.find((task) => key(task.title) === key(title));

        if (request.kind === "done") {
          if (match && match.status !== "done") {
            await base44.entities.AgentTask.update(match.id, { status: "done" });
          }
          continue;
        }

        if (!match) {
          const created = await base44.entities.AgentTask.create({
            project_id: pid,
            title,
            status: "queued",
            kind: "build",
          });
          existing.push(created);
        }
      }
    },
    [trial],
  );

  const persist = useCallback(
    async ({ text, provider, model, route }) => {
      const pid = projectRef.current;
      if (!text) return;

      if (trial || !pid) {
        addTrialMessage("assistant", text);
        return;
      }

      const turn = {
        project_id: pid,
        role: "assistant",
        content: text,
        provider,
        model,
      };

      try {
        // Which model answered, why it was chosen, and any escalation trail.
        await base44.entities.Message.create({ ...turn, route: Array.isArray(route) ? route : [] });
      } catch {
        // A deployment whose Message schema does not know `route` yet still saves the turn.
        await base44.entities.Message.create(turn);
      }

      // Fallback for replies that declared files inline instead of through a tool.
      // A plan turn never writes, even if the model emitted file blocks anyway.
      for (const block of modeRef.current === "plan" ? [] : fileBlocks(text)) {
        const existing = await base44.entities.ProjectFile.filter(
          { project_id: pid, path: block.path },
          "-created_date",
          1,
        );
        if (existing[0]) {
          await base44.entities.ProjectFile.update(existing[0].id, {
            content: block.content,
            size: block.content.length,
          });
        } else {
          await base44.entities.ProjectFile.create({
            project_id: pid,
            path: block.path,
            content: block.content,
            size: block.content.length,
          });
        }
      }

      // The gateway takes these notes back on later turns, so context survives.
      await base44.entities.MemoryNote.create({
        project_id: pid,
        note: `Asked: "${(lastPromptRef.current || "").slice(0, 160)}" — reply: ${text.slice(0, 180)}`,
        provider,
        model,
      });

      const project = await base44.entities.Project.get(pid);
      const count = await base44.entities.ProjectFile.count({ project_id: pid });
      await base44.entities.Project.update(pid, {
        provider,
        model,
        file_count: count,
        last_activity: new Date().toISOString(),
        message_count: (project?.message_count || 0) + 1,
      });

      savedRef.current?.();
    },
    [trial],
  );

  const { messages, send, cancel, isLoading, paused, error, attachMedia } = useXecutrChat({
    initialMessages,
    onFiles: writeFiles,
    onMedia: saveGenerated,
    onFinish: (result) => {
      // The server wrote the turn itself (so a closed tab loses nothing); the
      // browser only falls back when there was no project to write into.
      if (result.persisted) {
        savedRef.current?.();
        return;
      }
      persist(result)
        .then(() => (result.tasks?.length ? recordTasks(result.tasks) : undefined))
        .catch(() => setNotice("Saved locally only — the project write failed."));
    },
  });

  attachRef.current = attachMedia;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // A visible clock: a local model can take a minute, and a silent spinner looks
  // like a frozen page.
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (pendingPrompt && !sentPending.current && !isLoading) {
      sentPending.current = true;
      lastPromptRef.current = pendingPrompt;
      send({
        text: pendingPrompt,
        providerId: settingsRef.current.providerId,
        model: settingsRef.current.model,
        projectId: projectRef.current || null,
        keys: keysFor(settingsRef.current.providerId),
        mode,
      });
    }
  }, [pendingPrompt, isLoading, send, mode]);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      setNotice("That file is over the 25 MB limit.");
      return;
    }
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const content = isTextLike(file.name) && file.size < 200000 ? await file.text() : "";
      let uploadId = null;
      if (!content && file.size <= MAX_INSPECT) {
        // Artifacts go to the gateway's upload store so its tools can inspect them.
        const data = await readBase64(file);
        const ref = await attachArtifact({ data: { name: file.name, data } });
        uploadId = ref?.id || null;
      }
      setAttachments([{ name: file.name, file_uri, content, uploadId }]);
      setNotice(content || uploadId || file.size > MAX_INSPECT ? null : "This file is attached, but too large to inspect.");
    } catch {
      setNotice("Upload failed — try again.");
    }
  };

  /** A pasted or chosen image: a thumbnail here, its data URL on the turn. */
  const attachImage = async (file) => {
    try {
      const image = await imageAttachment(file);
      if (!image) return;

      // Keep the record usable in history even though the model gets the bytes.
      let file_uri = "";
      try {
        const uploaded = await base44.integrations.Core.UploadPrivateFile({ file });
        file_uri = uploaded?.file_uri || "";
      } catch {
        file_uri = "";
      }

      setAttachments((prev) =>
        [...prev.filter((a) => !a.image), { name: image.name, file_uri, content: "", uploadId: null, image: image.dataUrl }].slice(-3),
      );
      setNotice(null);
    } catch (err) {
      setNotice(err?.message || "That image could not be attached.");
    }
  };

  const onPaste = async (event) => {
    const files = imageFilesFrom(event);
    if (!files.length) return;
    event.preventDefault();
    for (const file of files) await attachImage(file);
  };

  const submit = async () => {
    const text = prompt.trim();
    const hasImage = attachments.some((a) => a.image);
    if ((!text && !hasImage) || isLoading) return;

    const payload = attachments.map((a) => ({
      name: a.name,
      content: a.content || "",
      uploadId: a.uploadId || null,
      image: a.image || "",
    }));

    const promptText = text || "Analyse the attached image and tell me what you see.";

    if (!trial && projectId) {
      await base44.entities.Message.create({
        project_id: projectId,
        role: "user",
        content: text || "[image]",
        attachments: attachments.map((a) => ({ name: a.name, file_uri: a.file_uri })),
      });
    } else {
      addTrialMessage("user", text || "[image]");
    }

    lastPromptRef.current = promptText;
    setPrompt("");
    setAttachments([]);
    await send({
      text: promptText,
      attachments: payload,
      providerId: settings.providerId,
      model: settings.model,
      projectId: projectId || null,
      keys: keysFor(settings.providerId),
      mode,
    });
    savedRef.current?.();
  };

  const scope = projectId || "trial";

  useEffect(() => {
    const stored = readSettings(scope);
    if (stored && typeof stored.providerId === "string") {
      // "gateway" was the old keyless route — now the gateway is the default ("").
      const providerId = stored.providerId === "gateway" ? "" : stored.providerId;
      setSettings({ providerId, model: stored.model || "" });
    }
  }, [scope]);

  /**
   * Auto is the default; a saved pick is only kept while it still exists. If the
   * provider went away or its model was retired, fall back to auto instead of
   * pinning a choice the gateway would silently ignore.
   */
  useEffect(() => {
    if (!settings.providerId || !providers.length) return;
    const provider = providers.find((p) => p.id === settings.providerId);
    const stillThere =
      provider && (!settings.model || provider.models.some((m) => m.id === settings.model));
    if (stillThere) return;
    setSettings({ providerId: "", model: "" });
    saveSettings(scope, { providerId: "", model: "" });
  }, [providers, scope, settings.providerId, settings.model]);

  const chooseModel = (next) => {
    setSettings(next);
    saveSettings(scope, next);
  };

  // Every prompt sent in this project, newest first, straight from the saved turns.
  const promptHistory = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 20; i -= 1) {
      const entry = messages[i];
      if (entry.role !== "user") continue;
      const text = textOfMessage(entry).trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain px-1 py-4 sm:px-2">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md py-10 text-center">
            <p className="label-mono">ready</p>
            <p className="mt-3 font-display text-[15px] uppercase tracking-[0.12em] text-white">
              describe what to build
            </p>
            <p className="mt-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">
              The agent writes real files into this project and remembers what it built.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            onOpenFile={onOpenFile}
            message={
              message.role === "assistant" && !message.provider
                ? { ...message, ...labelFor(settings, providers) }
                : message
            }
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <AnimatedX size={11} className="text-[#0e7490]" />
            <span>executing</span>
            <span className="tabular-nums text-muted-foreground/80">{elapsed}s</span>
            <span className="hidden text-muted-foreground/60 sm:inline">· runs on the server</span>
            <button
              type="button"
              onClick={cancel}
              className="ml-1 rounded-sm border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-red-500/40 hover:text-red-600"
            >
              pause
            </button>
          </div>
        )}
        {!isLoading && paused && (
          <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            paused
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 pb-1">
        {(error || notice) && (
          <div className="mb-2 flex items-start gap-2 rounded-sm border border-red-500/30 bg-red-500/[0.07] px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="font-body text-[12px] leading-relaxed text-red-300">
              {notice || (typeof error === "string" ? error : error?.message) || "The gateway did not answer. Try again."}
            </p>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-sm border border-[#b0c4de]/25 bg-white/[0.02] px-2.5 py-2">
            {attachments.map((item, index) =>
              item.image ? (
                <div key={`${item.name}-${index}`} className="relative">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-14 w-14 rounded-sm border border-white/10 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-white/20 bg-white p-0.5 text-muted-foreground shadow transition hover:text-red-600"
                    aria-label="Remove image"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
                <span
                  key={`${item.name}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Remove attachment"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={2.4} />
                  </button>
                </span>
              ),
            )}
          </div>
        )}

        <Composer
          value={prompt}
          onChange={setPrompt}
          onSubmit={submit}
          onPaste={onPaste}
          onPause={cancel}
          busy={isLoading}
          mode={mode}
          onModeChange={setMode}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white">
                <Paperclip className="h-3 w-3" strokeWidth={1.6} />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && String(file.type || "").startsWith("image/")) attachImage(file);
                    else upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {(trial || projectId) && (
                <button
                  type="button"
                  onClick={() => setMediaOpen(true)}
                  title="Generate an image, a clip or a track with this server's own models"
                  className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
                >
                  <ImageIcon className="h-3 w-3" strokeWidth={1.6} />
                </button>
              )}
              <PromptHistory prompts={promptHistory} onPick={setPrompt} />
              <ModelPicker
                providers={providers}
                value={settings}
                onChange={chooseModel}
                onRefresh={loadCatalog}
                busy={loadingCatalog}
              />
            </div>
          }
        />

        {!trial && projectId && <ProjectTasks projectId={projectId} />}
      </div>

      {(trial || projectId) && (
        <MediaDialog
          open={mediaOpen}
          onOpenChange={setMediaOpen}
          onGenerated={saveFromPanel}
          anonymous={trial}
        />
      )}
    </div>
  );
}