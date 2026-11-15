# The Xecutr harness — roadmap

The goal: the best AI harness in the world. Not a chat wrapper — the layer that
takes an intent, decides which model and which tools should do the work, runs
them, checks the result actually works, and leaves real files in the project.

This file is the plan of record. Everything is in checkboxes so it can be
chipped away at, one line at a time, and every item is written so its value is
visible to the person using the product.

## Principles

1. **The user's intent beats the model's preference.** A model that refuses or
   stalls is a routing problem, not a dead end.
2. **Best model first, cheapest model that works.** Route by task, not by habit.
3. **Local when it can, hosted when it must.** Local models carry the private,
   unrestricted and free work; hosted models carry the hard, one-shot work.
4. **Nothing is "done" until it runs.** A harness that cannot build or test what
   it wrote is a text generator.
5. **Every decision is visible.** Which model answered, why it was chosen, what
   was escalated and why — shown in the UI and stored with the project.
6. **The project is the memory.** Files, notes, decisions and generated assets
   outlive the conversation and travel with the project.

## What exists today (baseline)

- Plan / build mode in the composer; plan never writes and never generates.
- Project chat with streamed replies, file blocks written into the project,
  memory notes carried between turns, and an inline fallback file writer.
- A local model gateway (`deploy/gateway`) in front of Ollama on the VPS:
  chat, providers, uploads, media pass-through, Base44 proxying.
- Media service (`deploy/media`) on CPU: images (SD-Turbo), clips
  (AnimateDiff-Lightning) and music (MusicGen-small, 5 s to 8 min, MP3 out).
- Media is a tool the model can call with markers (`[[image: …]]`,
  `[[video: …]]`, `[[music: …]]`) and a panel a person can drive directly.
- Signed-out trial: 20 chat turns and 3 media generations a day per address.
- Auto-deploy: push to `main`, the VPS rebuilds and restarts within 5 minutes.

## Phase 1 — Routing and escalation (the core of the harness)

- [x] Gateway picks a model from the prompt when none is pinned (fast default
      vs. routed model for long or heavy turns).
- [x] Refusal detection: a short apologetic reply is treated as a refusal.
- [x] Automatic escalation to the local **9B abliterated coder**
      (`huihui_ai/qwen3.5-abliterated:9b-OmniCoder`) — the biggest model this
      CPU answers in a usable time — with the fallback marked in the reply
      label. Files from the escalated answer land in the project like any other.
- [x] **Shared-CPU discipline:** a closed reader aborts its upstream stream (a
      tab no longer leaves a model generating for minutes), and starting a media
      job asks Ollama to unload first so the track or clip gets the whole box.
- [ ] **Provider-aware routing.** Route to the user's own keys (OpenAI,
      Anthropic, Google, Groq, Cerebras, OpenRouter, OVH…) with a per-provider
      capability table (context, tool support, cost per 1k, latency class).
- [ ] **Task classifier.** One cheap local pass that labels the turn: `code`,
      `design`, `research`, `media`, `ops`, `chat`. Routing uses the label, not
      only prompt length.
- [ ] **Cost and latency budget.** Each turn carries a budget; the router picks
      the cheapest model that fits, and escalates only when verification fails.
- [ ] **Escalation ladder, not a single fallback.**
      `pinned → routed → local 7B → local 9B abliterated (OmniCoder)`, each step
      recorded with a reason (`refusal`, `timeout`, `test failure`, `context
      overflow`). The 27B sits outside the ladder on purpose: at this CPU speed a
      turn on it costs minutes, so it stays a manual pick and is never chosen
      automatically.
- [ ] **Refusal corpus.** Store every refusal and escalation (prompt hash, model,
      reason) so routing improves from real traffic.
- [ ] **UI:** a small "routing" strip on the reply — model, why, and the
      escalation trail when there was one.

## Phase 2 — Verification (what makes it a harness, not a chatbot)

- [ ] **Sandboxed run.** A per-task container that runs the project's build and
      tests after a build turn (`npm test`, `pytest`, `go test`, …), with a time
      limit and no network by default.
- [ ] **Outcome captured in the turn.** Pass/fail, the failing lines, and the
      logs stored with the message, not thrown away.
- [ ] **Self-repair loop.** On failure, feed the error back to the same model
      once; if it fails again, escalate one rung for the next attempt.
- [ ] **Diff review.** Every written file shown as a diff with an undo per turn;
      "revert this turn" restores the previous file set.
- [ ] **Screenshot check for web projects.** Build the preview, load it headless
      (Playwright in the same container), fail the turn on a blank page or a
      console error.
- [ ] **Definition of done per project type**, kept in the project (a static
      site: builds, loads, no console errors; a CLI: `--help` runs).

## Phase 3 — Memory and context

- [ ] **Retrieval instead of dumping.** Embed project files and notes; send the
      best 10 chunks rather than the first 40 files.
- [ ] **Decision log.** Every plan, approval and escalation stored as a note the
      harness reads back before the next build.
- [ ] **Symbol map.** A cheap AST index of the project so "where does `login`
      live?" is answered without a full read.
- [ ] **Long-conversation compaction.** Summarise older turns into structured
      facts (files touched, decisions, open questions) instead of truncating.
- [ ] **Cross-project memory.** Conventions the user repeats (naming, stack,
      style) remembered per account and applied by default.

## Phase 4 — Providers and keys

- [ ] **Server-side key handling.** Keys registered per account (encrypted at
      rest), never in the browser, used by the gateway for that turn only.
- [ ] **Per-provider adapters.** OpenAI-compatible ones share one adapter;
      Anthropic and Gemini get their own message shapes and streaming.
- [ ] **Capability matrix in the UI.** Which provider can do tools, images,
      long context, and what it roughly costs.
- [ ] **Free-tier first.** The harness prefers free/keyless endpoints when the
      task fits, and says so.
- [ ] **Key health.** A failing key is set aside with a visible reason instead of
      failing the turn.

## Phase 5 — Tools (the harness's hands)

- [x] File write + inline file blocks, media generation markers.
- [ ] **A real tool loop.** Model requests a tool, harness runs it, result
      returned, repeated until done — with a step budget.
- [ ] **Tool set:** read file, write file, list files, search, run command (in
      the sandbox), fetch URL, generate media, inspect image, query docs.
- [ ] **Tool permissions per project.** A project declares what the harness may
      touch; writes outside are refused before they happen.
- [x] **Media as first-class assets.** Music renders 5 s to 8 min in 30 s
      windows (crossfaded, MP3 out); images, clips and tracks are saved into the
      project and play in the chat.
- [ ] Media gallery per project, regenerate and delete, and assets stored by
      reference (not as base64 in a database field).
- [x] **Standalone media.** The media tool works signed-out (image and short
      music, three a day, no clips). Next: a scratch workspace with no project
      at all that can later be promoted into one.

## Phase 6 — Multi-agent

- [ ] **Planner / builder / reviewer split.** The planner writes the plan, the
      builder writes the files, the reviewer fails it with reasons.
- [ ] **Parallel fan-out.** Independent files built in parallel by separate
      model calls, merged by the harness, conflicts surfaced.
- [ ] **Long jobs as tasks.** A task that outlives the chat (a refactor, a media
      batch) with progress, cancellation and a result the chat picks up.

## Phase 7 — Evals and telemetry

- [ ] **A small eval set per capability** (build a page, fix a bug, add a test,
      generate a track) run against every model on demand.
- [ ] **Model scoreboard** per capability, per provider, with cost and latency.
- [ ] **Turn telemetry:** tokens, seconds, escalations, tool calls, verification
      outcome — visible in `/admin` per day.
- [ ] **Regression gate.** A prompt that used to work and now fails surfaces on
      the admin page.

## Phase 8 — Safety, quotas, operations

- [ ] **Sandbox egress rules.** Generated code may not reach the user's keys or
      the internet unless a tool is granted.
- [ ] **Per-account quotas** on expensive tools (clips, long music, builds).
- [ ] **Abuse limits** on the public trial: per address, per day, per minute.
- [ ] **Backup and restore** for projects, files and generated assets.
- [ ] **Media storage cap** with the oldest outputs pruned first.

## Near-term backlog (next 10 chips)

- [ ] Browser test of the media panel and the routing labels (last unchecked
      manual step from the previous session).
- [ ] Multi-provider routing with keys (Phase 1) — the biggest single jump.
- [ ] Sandboxed build + test after a build turn (Phase 2) — the second biggest.
- [ ] Media gallery per project with delete/regenerate (Phase 5).
- [ ] Assets by reference instead of base64 (Phase 5).
- [ ] Routing strip in the reply UI (Phase 1).
- [ ] Admin: media health, routing counts, escalation reasons (Phase 7).
- [ ] Retrieval over project files (Phase 3).
- [ ] Diff + undo per turn (Phase 2).
- [ ] README/AGENTS update for the deploy layout (housekeeping).

## Decisions made with the owner

- Music: 5 s to **8 minutes**, rendered in 30 s windows and crossfaded; MP3 out.
  Measured on this CPU: 10 s ≈ 73 s, 35 s ≈ 3.5 min, 60 s ≈ 6.3 min, so a full
  8-minute track is roughly 45-50 minutes of CPU. Faster needs a GPU, a
  quantized MusicGen, or a hosted model.
- Media works **in projects and standalone** (trial: image and music, no clips).
- The harness **picks the best model first**, then falls back to the local
  abliterated model when a turn is refused or fails; its files join the project.
- The local abliterated rung is the **9B coder**
  (`huihui_ai/qwen3.5-abliterated:9b-OmniCoder`). It is the largest local model
  that still answers quickly here, and it is what both routing and escalation use
  today (`OLLAMA_ROUTE_MODEL` and `OLLAMA_FALLBACK_MODEL` on the VPS).
- The **27B** (`coder:latest`) is not used for routing or fallback: it responds
  too slowly on this CPU. It stays available as a manual pick in the model list,
  and can be removed from the list entirely if the owner prefers.
- Signed-in is the unlimited path; the trial keeps its daily caps.
- Default model stays the fast local 7B; OmniCoder stays pickable.
