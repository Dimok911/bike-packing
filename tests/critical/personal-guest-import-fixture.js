import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";

export function guestSelectionFixture({ existing = false } = {}) {
  const arrangement = (bag, item) => ({ rootContainerIds: [bag], containers: { [bag]: { parentId: "", childIds: [], itemIds: [item], order: [{ type: "item", id: item }] } },
    items: { [item]: bag }, itemQuantities: { [item]: 3 }, packedItems: { [item]: true } });
  const sourceState = { items: { item: { id: "item", name: "Guest tool", weight: 42, quantity: 1, containerId: "bag", _publicCopySourceKind: "item", _publicCopySourceId: "template-tool", photos: [{ id: "guest-original" }] } },
    containers: { bag: { id: "bag", name: "Guest bag", parentId: null, childIds: [], itemIds: ["item"], order: [{ type: "item", id: "item" }], _publicCopySourceKind: "container", _publicCopySourceId: "template-bag" } },
    layouts: { a: { id: "a", name: "Guest A", rootContainerIds: ["bag"], arrangement: arrangement("bag", "item") }, b: { id: "b", name: "Guest B", rootContainerIds: ["bag"], arrangement: arrangement("bag", "item") } },
    locations: [], categories: [], activeLayoutId: "b" };
  const basePayload = { items: {}, containers: {}, layouts: {}, locations: [], categories: [] };
  if (existing) {
    basePayload.items.privateItem = { ...structuredClone(sourceState.items.item), id: "privateItem", containerId: "privateBag", photos: [{ id: "already-private" }] };
    basePayload.containers.privateBag = { ...structuredClone(sourceState.containers.bag), id: "privateBag", itemIds: ["privateItem"], order: [{ type: "item", id: "privateItem" }] };
    basePayload.layouts.private = { id: "private", name: "Already personal", rootContainerIds: ["privateBag"], arrangement: arrangement("privateBag", "privateItem") };
  }
  const candidate = { sourceState, layouts: [{ layoutId: "a", layoutName: "Guest A" }, { layoutId: "b", layoutName: "Guest B" }], layoutId: "b", layoutName: "Guest B", displayPreferences: { showItemMeta: false } };
  const nowMs = Date.parse("2026-09-09T00:00:00Z"), user = { id: "actor", email: "owner@example.test" };
  const handoff = createGuestLoginHandoff({ candidate, eligibleLayoutIds: ["a", "b"], email: user.email, guestSessionId: "chosen-session", nowMs });
  return { binding: { environment: "bike-packing-experiment", actorId: user.id, listId: "list", scopeKey: "id:actor" }, user, handoff, candidate,
    basePayload, baseStateRevision: 7, layoutNames: ["Imported A", "Imported B"], editMeta: { createdAt: new Date(nowMs).toISOString() }, nowMs };
}
