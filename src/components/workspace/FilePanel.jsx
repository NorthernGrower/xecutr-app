import { useState } from "react";
import { Copy, Download, FileArchive, FolderGit2 } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import GitHubDialog from "@/components/workspace/GitHubDialog";
import { downloadZip } from "@/lib/zip";

export default function FilePanel({ project, files, selected, onSelect, onRefresh }) {
  const [openGitHub, setOpenGitHub] = useState(false);
  const active = files.find((f) => f.path === selected) || files[0] || null;

  const download = (file) => {
    const url = URL.createObjectURL(new Blob([file.content || ""], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className="label-mono">files</span>
        <span className="font-mono text-[10px] text-muted-foreground">{files.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => downloadZip(files, project?.name)}
            disabled={!files.length}
            title="Download the project as a zip"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <FileArchive className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={() => setOpenGitHub(true)}
            disabled={!files.length}
            title="Save to your GitHub"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <FolderGit2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <div className="max-h-[38%] shrink-0 overflow-auto border-b border-white/[0.07] py-1">
        {files.length === 0 && (
          <p className="px-3 py-3 font-body text-[12px] leading-relaxed text-muted-foreground">
            Files the agent writes appear here.
          </p>
        )}
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => onSelect(file.path)}
            className={`block w-full truncate px-3 py-1.5 text-left font-mono text-[11px] transition ${
              active?.path === file.path
                ? "bg-[#e0f7ff]/[0.07] text-[#e0f7ff]"
                : "text-[#9aa6b2] hover:bg-white/[0.03] hover:text-white"
            }`}
          >
            {file.path}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-1.5">
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                {active.path}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(active.content || "")}
                  title="Copy file"
                  className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
                >
                  <Copy className="h-3 w-3" strokeWidth={1.6} />
                </button>
                <button
                  type="button"
                  onClick={() => download(active)}
                  title="Download file"
                  className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
                >
                  <Download className="h-3 w-3" strokeWidth={1.6} />
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#c9d3de]">
              {active.content}
            </pre>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
              no file selected
            </p>
          </div>
        )}
      </div>

      <GitHubDialog
        open={openGitHub}
        onOpenChange={setOpenGitHub}
        project={project}
        onSaved={onRefresh}
      />
    </Panel>
  );
}