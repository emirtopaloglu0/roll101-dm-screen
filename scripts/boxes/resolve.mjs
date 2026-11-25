import { resultText } from "../tables.mjs";

/**
 * Build template data for linked boxes. Every function catches its own errors:
 * a deleted or broken document gives `{missing: true}`, never an exception.
 */

const MAX_TABLE_ROWS = 300;

/** Enriched HTML cache: page uuid -> {stamp, html}. Avoids re-enriching unchanged pages. */
const enrichCache = new Map();

const TextEditorImpl = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

async function safeFromUuid(uuid) {
  if (typeof uuid !== "string" || !uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}

async function enrichPage(page) {
  const stamp = page._stats?.modifiedTime ?? 0;
  const cached = enrichCache.get(page.uuid);
  if (cached && cached.stamp === stamp) return cached.html;
  let html = "";
  try {
    html = await TextEditorImpl().enrichHTML(page.text?.content ?? "", { secrets: true, relativeTo: page });
  } catch (err) {
    console.warn("roll101-dm-screen | Could not render journal page", page.uuid, err);
  }
  enrichCache.set(page.uuid, { stamp, html });
  return html;
}

async function pageContext(page) {
  const base = { name: page.name, uuid: page.uuid };
  if (page.type === "text") return { ...base, html: await enrichPage(page) };
  if (page.type === "image" && page.src) return { ...base, image: page.src, caption: page.image?.caption ?? "" };
  return { ...base, openOnly: true };
}

export async function journalContext(box) {
  const doc = await safeFromUuid(box.data.uuid);
  if (!doc || !["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return { missing: true };

  const pages = doc.documentName === "JournalEntryPage"
    ? [doc]
    : doc.pages.contents.slice().sort((a, b) => a.sort - b.sort);
  return {
    name: doc.name,
    uuid: doc.uuid,
    showPageNames: pages.length > 1,
    pages: await Promise.all(pages.map(pageContext))
  };
}

function rangeLabel(result) {
  const [lo, hi] = result.range ?? [];
  if (lo === undefined) return "";
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

export async function tableContext(box) {
  const table = await safeFromUuid(box.data.uuid);
  if (!table || table.documentName !== "RollTable") return { missing: true };

  const all = table.results.contents.slice().sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  return {
    name: table.name,
    uuid: table.uuid,
    formula: table.formula,
    rows: all.slice(0, MAX_TABLE_ROWS).map(r => ({
      range: rangeLabel(r),
      text: resultText(r),
      drawn: !!r.drawn
    })),
    truncated: all.length > MAX_TABLE_ROWS ? all.length - MAX_TABLE_ROWS : 0
  };
}

/* -------------------------------------------- */
/*  Table folder tree                           */
/* -------------------------------------------- */

const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);

/**
 * @param {{id: string, name: string, parentId: string|null}[]} folders
 * @param {{uuid: string, name: string, folderId: string|null}[]} entries
 * @param {string|null} rootId
 */
function buildTree(folders, entries, rootId) {
  const childFolders = new Map();
  for (const f of folders) {
    const key = f.parentId ?? null;
    if (!childFolders.has(key)) childFolders.set(key, []);
    childFolders.get(key).push(f);
  }
  const childEntries = new Map();
  for (const e of entries) {
    const key = e.folderId ?? null;
    if (!childEntries.has(key)) childEntries.set(key, []);
    childEntries.get(key).push(e);
  }

  let count = 0;
  const seen = new Set();
  const build = (id, depth) => {
    // Depth limit and seen-set guard against broken parent loops.
    if (depth > 20 || seen.has(id)) return { folders: [], tables: [] };
    seen.add(id);
    const tables = (childEntries.get(id) ?? []).slice().sort(byName).map(e => ({ uuid: e.uuid, name: e.name }));
    count += tables.length;
    const subs = (childFolders.get(id) ?? []).slice().sort(byName).map(f => ({
      name: f.name,
      ...build(f.id, depth + 1)
    }));
    return { folders: subs.filter(s => s.folders.length || s.tables.length), tables };
  };
  const tree = build(rootId, 0);
  return { tree, count };
}

async function packTree(pack, rootId) {
  await pack.getIndex();
  const folders = pack.folders.map(f => ({ id: f.id, name: f.name, parentId: f._source?.folder ?? null }));
  const entries = pack.index.map(e => ({
    uuid: e.uuid ?? `Compendium.${pack.collection}.RollTable.${e._id}`,
    name: e.name,
    folderId: e.folder ?? null
  }));
  return buildTree(folders, entries, rootId);
}

function worldTree(rootId) {
  const folders = game.folders
    .filter(f => f.type === "RollTable")
    .map(f => ({ id: f.id, name: f.name, parentId: f._source?.folder ?? null }));
  const entries = game.tables.map(t => ({ uuid: t.uuid, name: t.name, folderId: t._source?.folder ?? null }));
  return buildTree(folders, entries, rootId);
}

export async function tableFolderContext(box) {
  const data = box.data;
  try {
    if (data.source === "pack") {
      const pack = game.packs.get(data.pack);
      if (!pack || pack.documentName !== "RollTable") return { missing: true };
      const { tree, count } = await packTree(pack, null);
      return { name: pack.title, tree, count };
    }

    const folder = await safeFromUuid(data.uuid);
    if (!folder || folder.documentName !== "Folder" || folder.type !== "RollTable") return { missing: true };
    const pack = folder.pack ? game.packs.get(folder.pack) : null;
    const { tree, count } = pack ? await packTree(pack, folder.id) : worldTree(folder.id);
    return { name: folder.name, tree, count };
  } catch (err) {
    console.warn("roll101-dm-screen | Could not read table folder", err);
    return { missing: true };
  }
}
