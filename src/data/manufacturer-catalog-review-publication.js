import receipts from './manufacturer-catalog-review-publications.js';

// Match the saved decision, so a later review of the same model is not mistaken
// for a decision already included in the current published catalog.
export function catalogReviewPublication(item, publications = receipts) {
  return publications.find(receipt => receipt.scanId === (item.scanId || item.reviewScanId)
    && receipt.changeId === (item.changeId || item.id)
    && Number.isFinite(Date.parse(item.reviewedAt))
    && Date.parse(receipt.reviewedAt) === Date.parse(item.reviewedAt)) || null;
}
