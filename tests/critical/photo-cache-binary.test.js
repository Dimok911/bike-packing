import test from "node:test";
import assert from "node:assert/strict";
import { encodePhotoCacheBinary, decodePhotoCacheBinary } from "../../src/sync/photo-cache-binary.js";

test("opt-in photo cache encoding preserves exact full/thumb bytes, MIME and metadata without native Blob persistence", async () => {
  const record = { id: "local", fileName: "Фото.png", fullBlobVerified: true,
    blob: new Blob([new Uint8Array([0, 255, 1])], { type: "image/png" }), thumbBlob: new Blob(["thumb"], { type: "image/webp" }) };
  const encoded = await encodePhotoCacheBinary(record);
  assert.equal(Object.hasOwn(encoded, "blob"), false); assert.equal(Object.hasOwn(encoded, "thumbBlob"), false);
  const restored = decodePhotoCacheBinary(structuredClone(encoded));
  assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()), new Uint8Array([0, 255, 1]));
  assert.equal(restored.blob.type, "image/png"); assert.equal(await restored.thumbBlob.text(), "thumb"); assert.equal(restored.thumbBlob.type, "image/webp");
  assert.equal(restored.fileName, "Фото.png"); assert.equal(restored.fullBlobVerified, true); assert.equal(record.blob.size, 3);
});
test("legacy Blob cache rows and explicitly absent thumbnails remain compatible", async () => {
  const record = { id: "old", blob: new Blob(["file"], { type: "image/jpeg" }) };
  assert.equal(decodePhotoCacheBinary(record), record);
  const encoded = await encodePhotoCacheBinary(record), restored = decodePhotoCacheBinary(encoded);
  assert.equal(encoded.binaryPhotoCache.thumb, null); assert.equal(restored.thumbBlob, null); assert.equal(await restored.blob.text(), "file");
});
test("binary cache corruption is refused without silently treating a thumbnail or other type as the original", async () => {
  const encoded = await encodePhotoCacheBinary({ blob: new Blob(["file"], { type: "image/png" }) });
  for (const mutate of [r => { r.binaryPhotoCache.version++; }, r => { r.binaryPhotoCache.file.bytes = "bad"; },
    r => { r.binaryPhotoCache.file.type = "text/plain"; }, r => { r.binaryPhotoCache.thumb = undefined; },
    r => { r.blob = new Blob(["other"]); }]) {
    const broken = structuredClone(encoded); mutate(broken);
    assert.throws(() => decodePhotoCacheBinary(broken)); assert.equal(broken.binaryPhotoCache.file.bytes === "bad" || broken.binaryPhotoCache.file.bytes instanceof ArrayBuffer, true);
  }
  await assert.rejects(encodePhotoCacheBinary({ blob: new Blob([]) }));
  await assert.rejects(encodePhotoCacheBinary({ blob: new Blob(["text"], { type: "text/plain" }) }));
});
