// Pure binary inventory codec. The fixed caller validator supplies the action
// grammar; this layer cannot grant dispatch, database or cleanup authority.
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const mime = value => ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value);
const textBytes = value => new TextEncoder().encode(value);

export function createPersonalPhotoInventoryCodec({ validateIntent, invalid }) {
  return {
    async encode({ binding, action, snapshot, files }) {
      if (!Array.isArray(files) || !files.length || files.length > 50) invalid();
      const selected = files.map(part => ({ file: part?.file, thumb: part?.thumb ?? null }));
      const input = { binding, action, snapshot, files: files.map(part => ({ stage: part?.stage })) };
      validateIntent(input);
      const intent = clone(input);
      validateIntent(intent);
      if (textBytes(JSON.stringify(intent.snapshot)).byteLength > 2 * 1024 * 1024) invalid();
      let total = 0;
      const materialize = async blob => {
        if (!(blob instanceof Blob) || !mime(blob.type) || blob.size <= 0 || blob.size > 10 * 1024 * 1024) invalid();
        total += blob.size; if (total > 50 * 1024 * 1024) invalid();
        const bytes = await blob.arrayBuffer();
        return { bytes, metadata: { size: bytes.byteLength, type: blob.type, hash: await sha(bytes) } };
      };
      const bytes = [];
      for (const [index, part] of selected.entries()) {
        const file = await materialize(part.file), thumb = part.thumb ? await materialize(part.thumb) : null;
        Object.assign(intent.files[index], { file: file.metadata, thumb: thumb?.metadata || null });
        bytes.push({ stageOperationId: intent.files[index].stage.operationId, file: file.bytes, thumb: thumb?.bytes || null });
      }
      const bindingKey = JSON.stringify(intent.binding), intentJson = JSON.stringify(intent);
      return { version: 2, key: JSON.stringify([bindingKey, intent.action.operationId]), bindingKey, intentJson,
        intentHash: await sha(textBytes(intentJson)), files: bytes };
    },
    async decode(record, binding, operationId) {
      if (!Array.isArray(record?.files) || !record.files.length || record.files.length > 50 || typeof record.intentJson !== "string"
        || textBytes(record.intentJson).byteLength > 6 * 1024 * 1024
        || record.files.reduce((sum, part) => sum + (part?.file?.byteLength || 0) + (part?.thumb?.byteLength || 0), 0) > 50 * 1024 * 1024) invalid();
      // Both returned Blob bytes and their verification must use the same copy.
      record = structuredClone(record); binding = clone(binding);
      if (record.version !== 2 || !uuid(operationId) || record.bindingKey !== JSON.stringify(binding)
        || record.key !== JSON.stringify([record.bindingKey, operationId])
        || await sha(textBytes(record.intentJson)) !== record.intentHash) invalid();
      let intent; try { intent = JSON.parse(record.intentJson); } catch { invalid(); }
      validateIntent(intent);
      if (textBytes(JSON.stringify(intent.snapshot)).byteLength > 2 * 1024 * 1024
        || intent.action.operationId !== operationId || JSON.stringify(intent.binding) !== JSON.stringify(binding)
        || record.files.length !== intent.files.length) invalid();
      let total = 0;
      const verify = async (bytes, metadata) => {
        if (!metadata) { if (bytes !== null) invalid(); return null; }
        if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== metadata.size || metadata.size <= 0 || metadata.size > 10 * 1024 * 1024
          || !mime(metadata.type) || await sha(bytes) !== metadata.hash) invalid();
        total += bytes.byteLength; if (total > 50 * 1024 * 1024) invalid();
        return new Blob([bytes], { type: metadata.type });
      };
      const files = [];
      for (const [index, part] of intent.files.entries()) {
        const saved = record.files[index];
        if (saved?.stageOperationId !== part.stage.operationId || !part.file) invalid();
        files.push({ stage: part.stage, file: await verify(saved.file, part.file), thumb: await verify(saved.thumb, part.thumb),
          fileMetadata: part.file, thumbMetadata: part.thumb });
      }
      return { ...intent, intentHash: record.intentHash, files };
    }
  };
}
