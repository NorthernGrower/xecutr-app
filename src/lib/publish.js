/**
 * How the live Base44 copy gets the current code.
 *
 * Kept beside build.js on purpose: the steps and the build label that proves a
 * publish landed are one thing. The owner's copy-ready version is the scratchpad
 * note /scratchpad/base44-publish.txt.
 */
export const PUBLISH = {
  intro:
    "The live copy is a Base44 deployment of this repository, so it only changes when Base44 builds main.",
  steps: [
    "Open the app in the Base44 builder and sync the repository from GitHub (main) if the builder is behind.",
    "Press Deploy / Publish and wait for it to finish.",
    "Open /admin on the live site and read “app build” — it must match the label below.",
  ],
  command: "base44 login && base44 link && base44 deploy",
  commandNote: "Or from a terminal, in the repository, with the Base44 CLI signed in.",
  after: [
    "the model picker lists only models that can actually answer",
    "every reply shows a routing strip: model, why, and any escalation",
  ],
  vpsNote:
    "https://xecutr.cloud needs no publish step — it pulls main by itself every five minutes.",
};
