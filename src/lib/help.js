/**
 * The in-app guide. One section per feature, written for someone using the
 * product rather than reading the code. Keep each entry short: what it is, how
 * to use it, and the limit worth knowing.
 */
export const HELP = [
  {
    id: "start",
    title: "Sign in",
    intro: "Accounts are Base44 accounts. Signing in is what saves projects, files and memory.",
    steps: [
      "Open /login and use Continue with Apple, Continue with Google, or an email and password.",
      "Signed out you can still prompt: the trial gives 20 turns a day and carries into the first project you save.",
      "Forgotten your password? /forgot-password emails a reset link.",
      "A member's role (user or admin) is set in the Base44 builder's Members area.",
    ],
  },
  {
    id: "projects",
    title: "Projects and the workspace",
    intro: "A project is a folder of files, a conversation and a memory that outlives the chat.",
    steps: [
      "Type a prompt on the home page and press send — that creates the project and opens it.",
      "The workspace has chat on the left, files on the right, and a preview tab that renders the project.",
      "On a phone the workspace shows one pane at a time, with chat / files / preview on a bar at the bottom; the menu's “layout” switch can force the desktop layout (or back) and remembers the choice on that device.",
      "Click the project name at the top to rename it. Delete is in the toolbar, or on the dashboard card.",
      "Every finished turn is written by the server: closing the tab does not lose the answer or its files.",
      "The clock in the prompt opens the prompt history: click a prompt to load it back, × to delete it from the list, or pin it as a task.",
      "An error or notice above the prompt has its own ×, and the next message opens it again.",
    ],
  },
  {
    id: "plan",
    title: "Plan or build",
    intro: "The toggle beside send decides whether the model may change files.",
    steps: [
      "plan asks for a written plan and touches nothing — no files, no generated media.",
      "build lets it write files and run the tools.",
      "The choice is sent with the turn; plan mode is enforced in the app, not just asked for.",
    ],
  },
  {
    id: "models",
    title: "Choosing a model",
    intro: "Auto is the default. You can pin one provider and model whenever you want.",
    steps: [
      "Auto answers from the fastest reachable hosted provider, walks down by speed, and uses this server last.",
      "A refusal or an error from a hosted model falls through the chain and lands on the local model.",
      "A provider that answers 429 or “no credit” cools down for ten minutes and moves to the bottom.",
      "To pin: tap the model chip, expand a provider, tap a model. The chip then reads “manual · provider · model”.",
      "To go back: pick “use auto” in the picker header, or tap the top auto row.",
      "A saved pick is dropped if that provider or model disappears.",
      "Pasted images prefer a vision-capable model; a text-only pin is swapped for one that can see, and the strip says so.",
    ],
  },
  {
    id: "keys",
    title: "Your own provider keys",
    intro:
      "Keys are optional — the keyless providers answer without one. Adding keys makes the chain faster and gives you the bigger models.",
    steps: [
      "Open /connections, paste a key for a provider, save. It stays on that device and is sent once per turn over HTTPS.",
      "Free tiers exist at Groq, Google AI, Mistral, Cerebras, OpenRouter and Z.ai; OpenAI and Anthropic are paid.",
      "The picker lists only models the provider actually reported to this deployment.",
      "For a shared key that covers every visitor, use the provider-key card in /admin (admin only).",
    ],
  },
  {
    id: "images",
    title: "Images in the prompt",
    intro: "Paste or attach a picture and the model describes and reasons about it.",
    steps: [
      "Paste into the prompt, or use the paperclip to pick a photo.",
      "Images are downscaled to 1280px JPEG before sending, so a phone screenshot travels small.",
      "Thumbnails sit above the prompt with an × to remove one.",
      "A picture with no text still sends: it asks the model to analyse the image.",
    ],
  },
  {
    id: "media",
    title: "Generating images, clips and music",
    intro: "The server runs the models itself on CPU, so it is serial and honest about time.",
    steps: [
      "Open the image button beside the paperclip in a project: choose image, clip or music.",
      "Images take seconds, a short track about two minutes, clips take minutes.",
      "Music renders in 30-second windows and can run to eight minutes.",
      "Results are saved into the project under assets/generated and play in the chat.",
      "The agent can generate too: ask for an image, clip or music and it marks the reply; the app makes the file.",
      "Signed out, the trial allows small images and short tracks, a few a day.",
    ],
  },
  {
    id: "publish",
    title: "Publishing a project",
    intro: "A project can be served by this server at its own address.",
    steps: [
      "Every finished turn writes the files it produced to /srv/xecutr/projects on the VPS as well as to the project.",
      "“publish” in a project's toolbar copies the whole project there and returns https://xecutr.cloud/<project>.",
      "The server serves index.html at that address, other files by path, and falls back to index.html for unknown paths.",
      "The app's own paths (projects, tasks, help, profile, admin, api…) always stay the app's, even if a project shares the name.",
      "A subdomain form (project.xecutr.cloud) also works if a wildcard DNS record is ever added — nothing else has to change.",
    ],
  },
  {
    id: "context",
    title: "Context and memory",
    intro: "The conversation lives on the server, and the parts that leave the prompt window are condensed rather than lost.",
    steps: [
      "Every turn is written to the project as it finishes, so closing the browser, switching device or coming back tomorrow carries the thread on.",
      "A request sends the newest turns (about 15,000 tokens), a digest of the older ones, the pinned tasks and the memory notes. The deployment can move that window with the XECUTR_CONTEXT_TOKENS secret.",
      "The digest keeps what was asked and what was decided, not the code — the code lives in the project's files.",
      "This server's own models get a shorter tail of the thread: their context is small and prompt evaluation on a CPU is the slow part.",
      "The project toolbar shows the thread's length next to the file count.",
    ],
  },
  {
    id: "tasks",
    title: "The pinned task list",
    intro: "Under the prompt, each project keeps a short list of what must not be forgotten.",
    steps: [
      "The harness adds a step when a reply marks one, and closes it when the work is done.",
      "Add a step yourself, rename one (pencil or double-click), tick it, or delete it with ×.",
      "A past prompt that describes work still to do can become a step: open the prompt history (the clock in the prompt) and press its pin button.",
      "The list is sent with every turn, so trimming the conversation never loses it.",
      "Open tasks are also visible on the /tasks board across projects.",
    ],
  },
  {
    id: "github",
    title: "GitHub",
    intro: "Save a project to your own account, or start one from a repository.",
    steps: [
      "In a project, “connect github” links your account once; then “update repo” pushes the files.",
      "On /projects, “import repo” takes any GitHub link — someone else's public repository needs no account; connect GitHub for your own list and private ones.",
      "The GitHub link is per user, never shared between members.",
    ],
  },
  {
    id: "telegram",
    title: "Telegram",
    intro: "Talk to the harness from a chat app, with no browser and no Base44 session.",
    steps: [
      "Create a bot with @BotFather and put the token, a webhook secret and your chat id in the gateway's env file.",
      "Point Telegram at https://xecutr.cloud/api/telegram/<secret> with setWebhook.",
      "Message the bot: text, photos, /reset to forget the chat, /preview <project id> for a link.",
      "It answers through the same chain as the app; a refusal still lands on the local model.",
      "It answers as the harness, it does not edit project files.",
      "Once it is set up, /profile has an “open bot” button that opens the bot in Telegram.",
    ],
  },
  {
    id: "siri",
    title: "Siri",
    intro: "One Shortcut turns a dictated question into a spoken answer.",
    steps: [
      "Shortcut: Dictate Text → Get Contents of URL (POST https://xecutr.cloud/api/voice/<secret>, JSON body text) → dictionary value “reply” → Speak Text.",
      "Name it “Ask Xecutr”, then say “Hey Siri, Ask Xecutr”.",
      "The secret is the same webhook secret used for Telegram.",
      "On an iPhone or iPad, /profile has an “open in siri” button that runs the shortcut.",
    ],
  },
  {
    id: "admin",
    title: "Admin",
    intro: "The admin page is for whoever the platform marks as admin.",
    steps: [
      "Gateway health, anonymous trial usage, and the live build label.",
      "Publishing: the live Base44 site updates when you publish from the builder — /admin shows the steps.",
      "Provider keys: copy-ready commands for a site-wide Groq or OpenAI key.",
    ],
  },
  {
    id: "limits",
    title: "Limits and troubleshooting",
    intro: "What is deliberately capped, and what to check when something looks stuck.",
    steps: [
      "Signed out: 20 turns a day per address; signed in: unlimited turns.",
      "A long local answer shows “executing” with a seconds counter — pause stops it and frees the CPU.",
      "A provider that keeps failing cools down for ten minutes; the chain moves on.",
      "Empty picker? No provider could list models — add a key under /connections or check the gateway.",
      "Nothing saved? Open /admin and check the gateway health line.",
    ],
  },
];
