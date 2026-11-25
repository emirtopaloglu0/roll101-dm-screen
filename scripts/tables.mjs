/**
 * Rolling tables without posting to chat, plus copy and whisper helpers.
 */

const TAG_RE = /<[^>]*>/g;

function stripHTML(html) {
  if (typeof html !== "string") return "";
  return html.replace(TAG_RE, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Plain text of a TableResult. Reads `name` and `description` (v13+) and falls back to
 * the raw source `text`, so the deprecated `text` getter is never touched.
 */
export function resultText(result) {
  return result?.name
    || stripHTML(result?.description)
    || stripHTML(result?._source?.text)
    || "";
}

/**
 * Roll a table without drawing (results are not marked as drawn) and without chat.
 * Nested tables are resolved by Foundry's own recursive roll.
 * @returns {Promise<{name: string, texts: string[]}>}
 */
export async function rollTableByUuid(uuid) {
  const table = await fromUuid(uuid).catch(() => null);
  if (!table || table.documentName !== "RollTable") throw new Error("missing");
  const { results } = await table.roll();
  const texts = (results ?? []).map(resultText).filter(Boolean);
  return { name: table.name, texts };
}

export async function copyText(text) {
  try {
    if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(text);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Whisper a result to every GM. Players never receive it. */
export async function whisperToGM(title, text) {
  const whisper = game.users.filter(u => u.isGM).map(u => u.id);
  return ChatMessage.create({
    content: `<p><strong>${escapeHTML(title)}</strong></p>`
      + String(text).split("\n").map(line => `<p>${escapeHTML(line)}</p>`).join(""),
    whisper,
    speaker: { alias: game.i18n.localize("R101DMSCREEN.Title") }
  });
}
