import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Paperclip, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Composer from "@/components/workspace/Composer";
import MessageBubble from "@/components/workspace/MessageBubble";
import ModelPicker from "@/components/workspace/ModelPicker";
import PromptHistory from "@/components/workspace/PromptHistory";
import useXecutrChat from "@/hooks/use-xecutr-chat";
import { attachArtifact, xecutrCatalog } from "@/lib/chat";
import { isTextLike, readKeys, readSettings, saveSettings } from "@/lib/providers";
import { fileBlocks, textOfMessage } from "@/lib/text-segments";
import { addTrialMessage } from "@/lib/trial";

const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_INSPECT = 8 * 1024 * 1024;

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });

const labelFor = (settings, catalog) => {
  const provider = (catalog?.providers || []).find((p) => p.id === settings.providerId);
  return {
    provider: provider?.id || "xecutr gateway",
    model: settings.model || provider?.defaultModel || "auto",
  };
};

/**
 * The one chat surface. Every turn streams from the xecutr gateway through the
 * server proxy; a saved project sends its files and memory along and keeps the
 * files the gateway writes.
 */
export default function ChatPane({ projectId, initialMessages = [], pendingPrompt, onSaved, trial = false, onOpenFile }) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [settings, setSettings] = useState({ providerId: "", model: "" });
  const [catalog, setCatalog] = useState({ providers: [] });
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [notice, setNotice] = useState(null);

  const projectRef = useRef(projectId);
  const settingsRef = useRef(settings);
  const savedRef = useRef(onSaved);
  const lastPromptRef = useRef("");
  const sentPending = useRef(false);
  const endRef = useRef(null);

  projectRef.current = projectId;
  settingsRef.current = settings;
  savedRef.current = onSaved;

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const next = await xecutrCatalog({ data: { keys: readKeys() } });
      setCatalog(next);
      if (next?.error) setNotice(next.error);
    } catch {
      setNotice("The provider catalogue could not be loaded.");
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
      if (!pid || trial) return;

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

  const persist = useCallback(
    async ({ text, provider, model }) => {
      const pid = projectRef.current;
      if (!text) return;

      if (trial || !pid) {
        addTrialMessage("assistant", text);
        return;
      }

      await base44.entities.Message.create({
        project_id: pid,
        role: "assistant",
        content: text,
        provider,
        model,
      });

      // Fallback for replies that declared files inline instead of through a tool.
      for (const block of fileBlocks(text)) {
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

  const { messages, send, isLoading, error } = useXecutrChat({
    initialMessages,
    onFiles: writeFiles,
    onFinish: (result) => {
      persist(result).catch(() => setNotice("Saved locally only — the project write failed."));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (pendingPrompt && !sentPending.current && !isLoading) {
      sentPending.current = true;
      lastPromptRef.current = pendingPrompt;
      send({
        text: pendingPrompt,
        providerId: settingsRef.current.providerId,
        model: settingsRef.current.model,
        projectId: projectRef.current || null,
        keys: readKeys(),
      });
    }
  }, [pendingPrompt, isLoading, send]);

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

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isLoading) return;
    const payload = attachments.map((a) => ({
      name: a.name,
      content: a.content || "",
      uploadId: a.uploadId || null,
    }));

    if (!trial && projectId) {
      await base44.entities.Message.create({
        project_id: projectId,
        role: "user",
        content: text,
        attachments: attachments.map((a) => ({ name: a.name, file_uri: a.file_uri })),
      });
    } else {
      addTrialMessage("user", text);
    }

    lastPromptRef.current = text;
    setPrompt("");
    setAttachments([]);
    await send({
      text,
      attachments: payload,
      providerId: settings.providerId,
      model: settings.model,
      projectId: projectId || null,
      keys: readKeys(),
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
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-1 py-4 sm:px-2">
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
                ? { ...message, ...labelFor(settings, catalog) }
                : message
            }
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#e0f7ff]" />
            streaming
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
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-[#b0c4de]/25 bg-white/[0.02] px-3 py-1.5">
            <Paperclip className="h-3 w-3 text-[#b0c4de]" />
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
              {attachments[0].name}
            </span>
            <button
              type="button"
              onClick={() => setAttachments([])}
              className="ml-auto text-muted-foreground hover:text-white"
              aria-label="Remove attachment"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <Composer
          value={prompt}
          onChange={setPrompt}
          onSubmit={submit}
          busy={isLoading}
          footer={
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white">
                <Paperclip className="h-3 w-3" strokeWidth={1.6} />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
              <PromptHistory prompts={promptHistory} onPick={setPrompt} />
              <ModelPicker
                catalog={catalog}
                value={settings}
                onChange={chooseModel}
                onRefresh={loadCatalog}
                busy={loadingCatalog}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}