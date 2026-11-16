'use strict';

/**
 * A Telegram front door for the harness, plus the little helpers the voice
 * endpoint needs.
 *
 * Telegram delivers updates to a webhook; this module turns a message into one
 * harness turn and sends the answer back. Conversation memory is per chat and
 * lives in this process — a restart forgets it, which is the honest trade for
 * not needing any database here.
 */

const API = 'https://api.telegram.org';

const MAX_TELEGRAM_CHARS = 3800; // Telegram caps a message at 4096
const MAX_HISTORY = 12; // turns kept per chat

/** Split a long answer on paragraph boundaries so Telegram accepts it. */
function chunk(text, limit = MAX_TELEGRAM_CHARS) {
  const out = [];
  let rest = String(text || '').trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function createTelegram({ token, allowedChats = [], runTurn, log = console.log }) {
  const history = new Map();
  let me = { at: 0, value: null };

  const configured = Boolean(token);

  const call = async (method, payload) => {
    const response = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Telegram ${method} answered ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
    }
    return response.json().catch(() => ({}));
  };

  const send = async (chatId, text) => {
    for (const part of chunk(text)) {
      await call('sendMessage', {
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
      });
    }
  };

  const downloadPhoto = async (fileId) => {
    const file = await call('getFile', { file_id: fileId });
    const path = file?.result?.file_path;
    if (!path) return null;
    const response = await fetch(`${API}/file/bot${token}/${path}`);
    if (!response.ok) return null;
    const type = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${buffer.toString('base64')}`;
  };

  const allowed = (chatId) => {
    if (!allowedChats.length) return true; // an unconfigured allow-list means "only whoever has the bot"
    return allowedChats.includes(String(chatId));
  };

  const handleMessage = async (message) => {
    const chatId = message?.chat?.id;
    if (!chatId) return;
    if (!allowed(chatId)) {
      await send(chatId, 'This bot is private. Ask the owner to add your chat id to TELEGRAM_ALLOWED_CHATS.');
      return;
    }

    const text = String(message.text || message.caption || '').trim();

    if (/^\/start\b/i.test(text) || /^\/help\b/i.test(text)) {
      await send(
        chatId,
        [
          'Xecutr is listening. Send a message and it goes through the model chain:',
          'fastest hosted provider first, then down by speed, and this server last.',
          '',
          '/reset — forget this conversation',
          '/preview <project id> — link to a project in the web app',
          '',
          'Photos are read too: send one with a caption and it answers about the picture.',
        ].join('\n'),
      );
      return;
    }

    if (/^\/reset\b/i.test(text)) {
      history.delete(String(chatId));
      await send(chatId, 'Conversation cleared.');
      return;
    }

    const previewMatch = /^\/preview\b\s*(\S+)?/i.exec(text);
    if (previewMatch) {
      const projectId = previewMatch[1];
      const base = process.env.APP_URL || 'https://xecutr.cloud';
      await send(
        chatId,
        projectId
          ? `Open it: ${base}/projects/${encodeURIComponent(projectId)}`
          : `Open the workspace: ${base}/projects`,
      );
      return;
    }

    if (!text && !message.photo?.length) return;

    const images = [];
    if (message.photo?.length) {
      // Telegram sends sizes smallest first; the last is the largest.
      const fileId = message.photo[message.photo.length - 1].file_id;
      const dataUrl = await downloadPhoto(fileId).catch(() => null);
      if (dataUrl) images.push(dataUrl);
    }

    const key = String(chatId);
    const turns = history.get(key) || [];
    const conversation = [
      ...turns,
      { role: 'user', text: text || 'Analyse the attached image.', images },
    ].slice(-MAX_HISTORY);

    await call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    // Long answers make the typing indicator expire; refresh it while we wait.
    const typing = setInterval(() => {
      call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    }, 4000);

    try {
      const answer = await runTurn({ messages: conversation, hasImages: images.length > 0 });
      const reply = String(answer?.text || '').trim() || 'The chain returned nothing. Try again in a moment.';
      history.set(
        key,
        [...conversation, { role: 'assistant', text: reply }].slice(-MAX_HISTORY),
      );
      await send(chatId, reply);
    } catch (err) {
      log(`[telegram] turn failed: ${err?.message || err}`);
      await send(chatId, `The harness could not answer: ${err?.message || err}`).catch(() => {});
    } finally {
      clearInterval(typing);
    }
  };

  /** Called with a parsed Telegram update; never throws at the route. */
  const handleUpdate = async (update) => {
    try {
      if (update?.message) await handleMessage(update.message);
      else if (update?.edited_message) await handleMessage(update.edited_message);
    } catch (err) {
      log(`[telegram] update failed: ${err?.message || err}`);
    }
  };

  /**
   * Who the bot is, so the app can offer a t.me link. Asked once and kept for
   * ten minutes: the username changes only if the owner renames the bot.
   */
  const whoAmI = async () => {
    if (!configured) return null;
    if (me.value && Date.now() - me.at < 10 * 60 * 1000) return me.value;
    try {
      const data = await call('getMe', {});
      const username = data?.result?.username || '';
      me = {
        at: Date.now(),
        value: username
          ? { username, name: data.result.first_name || '', link: `https://t.me/${username}` }
          : null,
      };
      return me.value;
    } catch {
      me = { at: Date.now(), value: null };
      return null;
    }
  };

  return { configured, handleUpdate, send, whoAmI };
}

module.exports = { createTelegram, chunk };
