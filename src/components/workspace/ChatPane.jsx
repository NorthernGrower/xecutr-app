import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@tanstack/ai-react";
import { AlertTriangle, Paperclip, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Composer from "@/components/workspace/Composer";
import MessageBubble from "@/components/workspace/MessageBubble";
import ModelPicker from "@/components/workspace/ModelPicker";
import { streamTurn, discoverModels } from "@/lib/chat";
import {
  GATEWAY,
  isTextLike,
  providerById,
  readKeys,
  readModelCache,
  readSettings,
  saveModelCache,
  saveSettings,
} from "@/lib/providers";
import { fileBlocks, textOfMessage } from "@/lib/text-segments";
import { addTrialMessage } from "@/lib/trial";

const MAX_UPLOAD = 25 * 1024 * 1024;

const labelFor = (settings) => {
  if (settings.providerId === GATEWAY.id) {
    const auto = !settings.model || settings.model === "automatic";
    return { provider: "keyless gateway", model: auto ? "auto" : settings.model };
  }
  return { provider: providerById(settings.providerId)?.label || settings.providerId, model: settings.model };
};

/**
 * The one chat surface: the signed-out trial and a saved project both stream
 * through the same server turn.
 */
export default function ChatPane({ projectId, initialMessages = [], pendingPrompt, onSaved, trial = false, onOpenFile }) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [settings, setSettings] = useState({ providerId: GATEWAY.id, model: "automatic" });
  const [models, setModels] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [notice, setNotice] = useState(null);

  const projectRef = useRef(projectId);
  const settingsRef = useRef(settings);
  const attachRef = useRef([]);
  const savedRef = useRef(onSaved);
  const sentPending = useRef(false);
  const endRef = useRef(null);

  projectRef.current = projectId;
  settingsRef.current = settings;
  savedRef.current = onSaved;

  const fetcher = useCallback((input, { signal }) => {
    const keys = readKeys();
    const active = settingsRef.current;
    return streamTurn({
      data: {
        messages: input.messages
          .map((m) => ({ role: m.role, content: textOfMessage(m) }))
          .filter((m) => m.content)
          .slice(-20),
        projectId: projectRef.current || null,
        providerId: active.providerId,
        model: active.model || null,
        apiKey: active.providerId === GATEWAY.id ? null : keys[active.providerId] || null,
        attachments: attachRef.current.map((a) => ({ name: a.name, content: a.content || "" })),
      },
      signal,
    });
  }, []);

  const persist = useCallback(
    async (text) => {
      const pid = projectRef.current;
      const labels = labelFor(settingsRef.current);
      if (!text) return;

      if (trial || !pid) {
        addTrialMessage("assistant", text);
        return;
      }

      await base44.entities.Message.create({
        project_id: pid,
        role: "assistant",
        content: text,
        provider: labels.provider,
        model: labels.model,
      });

      // Fallback for replies that declared files inline instead of through tools.
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

      const project = await base44.entities.Project.get(pid);
      const count = await base44.entities.ProjectFile.count({ project_id: pid });
      await base44.entities.Project.update(pid, {
        provider: labels.provider,
        model: labels.model,
        file_count: count,
        last_activity: new Date().toISOString(),
        message_count: (project?.message_count || 0) + 1,
      });

      savedRef.current?.();
    },
    [trial],
  );

  const { messages, sendMessage, isLoading, error } = useChat({
    initialMessages,
    fetcher,
    onFinish: (message) => {
      const text = textOfMessage(message);
      if (text) persist(text).catch(() => setNotice("Saved locally only — the project write failed."));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (pendingPrompt && !sentPending.current && !isLoading) {
      sentPending.current = true;
      sendMessage(pendingPrompt);
    }
  }, [pendingPrompt, isLoading, sendMessage]);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      setNotice("That file is over the 25 MB limit.");
      return;
    }
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const content = isTextLike(file.name) && file.size < 200000 ? await file.text() : "";
      setAttachments([{ name: file.name, file_uri, content }]);
      setNotice(null);
    } catch {
      setNotice("Upload failed — try again.");
    }
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isLoading) return;
    attachRef.current = attachments;

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

    setPrompt("");
    setAttachments([]);
    await sendMessage(text);
    attachRef.current = [];
    savedRef.current?.();
  };

  const scope = projectId || "trial";

  useEffect(() => {
    const stored = readSettings(scope);
    if (stored?.providerId) setSettings(stored);
  }, [scope]);

  const chooseModel = (next) => {
    setSettings(next);
    saveSettings(scope, next);
  };

  const runDiscovery = async () => {
    const key = readKeys()[settings.providerId];
    if (!key) return;
    setDiscovering(true);
    try {
      const res = await discoverModels({ data: { providerId: settings.providerId, apiKey: key } });
      setModels(res.models || []);
      if (res.models?.length) saveModelCache(settings.providerId, res.models);
      if (!res.models?.length) setNotice(res.error || "That provider returned no models.");
    } catch {
      setNotice("Model discovery failed.");
    } finally {
      setDiscovering(false);
    }
  };

  const cachedModels = readModelCache()[settings.providerId]?.models;

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
                ? { ...message, ...labelFor(settings) }
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
              {notice || error?.message || "The provider did not answer. Try again."}
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
              <ModelPicker
                value={settings}
                onChange={chooseModel}
                models={models ?? cachedModels}
                onDiscover={runDiscovery}
                busy={discovering}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}