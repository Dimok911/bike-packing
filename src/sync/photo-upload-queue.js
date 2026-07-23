const DEFAULT_PHOTO_UPLOAD_CONCURRENCY = 2;

export async function uploadPhotoBatchQueue(photos, {
  concurrency = DEFAULT_PHOTO_UPLOAD_CONCURRENCY,
  fallbackErrorMessage = "Could not upload the photo.",
  shouldUploadPhoto = () => true,
  uploadPhoto = async () => false,
  onUnexpectedError = () => {}
} = {}) {
  const queue = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  if (!queue.length) return { attempted: 0, uploaded: false, errors: [] };

  const workerCount = Math.max(1, Math.min(
    queue.length,
    Math.trunc(Number(concurrency)) || DEFAULT_PHOTO_UPLOAD_CONCURRENCY
  ));
  const errors = [];
  let cursor = 0;
  let attempted = 0;
  let uploaded = false;

  async function runWorker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const photo = queue[index];
      if (!shouldUploadPhoto(photo)) continue;
      attempted += 1;
      try {
        uploaded = Boolean(await uploadPhoto(photo, index)) || uploaded;
      } catch (error) {
        errors.push({ photo, error, index });
        markPhotoUploadQueueError(photo, error, { fallbackErrorMessage });
        onUnexpectedError(photo, error, index);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return { attempted, uploaded, errors };
}

export function markPhotoUploadQueueError(photo, error, {
  fallbackErrorMessage = "Could not upload the photo.",
  nowIsoValue = new Date().toISOString()
} = {}) {
  if (!photo) return false;
  photo.status = "error";
  photo.error = error?.message || fallbackErrorMessage;
  photo.updatedAt = nowIsoValue;
  if (Object.prototype.hasOwnProperty.call(photo, "uploadProgress")) delete photo.uploadProgress;
  return true;
}

export async function uploadPhotoWithOneRetry(photo, {
  retryDelayMs = 700,
  shouldRetryPhoto = (candidate) => Boolean(candidate?.uploadRetryPending),
  uploadPhotoAttempt = async () => false,
  wait = (delay) => new Promise((resolve) => globalThis.setTimeout(resolve, delay))
} = {}) {
  const firstResult = await uploadPhotoAttempt(photo, {
    attempt: 1,
    retryTemporaryUploadFailure: true
  });
  if (!shouldRetryPhoto(photo)) return firstResult;
  if (retryDelayMs > 0) await wait(retryDelayMs);
  return uploadPhotoAttempt(photo, {
    attempt: 2,
    retryTemporaryUploadFailure: false
  });
}
