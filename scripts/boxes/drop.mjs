/**
 * Turn sidebar or compendium drag data into a box definition.
 * Never throws. Returns null for anything the screen cannot use.
 */

function readDragData(event) {
  const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try {
    const data = TextEditor?.getDragEventData?.(event);
    if (data && typeof data === "object" && Object.keys(data).length) return data;
  } catch { /* fall through */ }
  try {
    return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
  } catch {
    return null;
  }
}

/**
 * @param {DragEvent} event
 * @returns {Promise<{type: string, data: object}|{error: string}|null>}
 */
export async function boxFromDrop(event) {
  const data = readDragData(event);
  if (!data || typeof data !== "object") return null;

  switch (data.type) {
    case "JournalEntry":
    case "JournalEntryPage":
      return data.uuid ? { type: "journal", data: { uuid: data.uuid } } : null;

    case "RollTable":
      return data.uuid ? { type: "table", data: { uuid: data.uuid } } : null;

    case "Folder": {
      if (!data.uuid) return null;
      let folder = null;
      try { folder = await fromUuid(data.uuid); } catch { folder = null; }
      if (folder?.type !== "RollTable") return { error: "DropFolderType" };
      return { type: "tableFolder", data: { source: "folder", uuid: data.uuid } };
    }

    case "Compendium": {
      const id = data.collection ?? data.pack ?? data.id;
      const pack = id ? game.packs.get(id) : null;
      if (!pack) return null;
      if (pack.documentName !== "RollTable") return { error: "DropPackType" };
      return { type: "tableFolder", data: { source: "pack", pack: pack.collection } };
    }

    default:
      return { error: "DropUnsupported" };
  }
}
