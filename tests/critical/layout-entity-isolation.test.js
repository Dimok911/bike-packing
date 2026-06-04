import test from "node:test";
import assert from "node:assert/strict";
import {
  findLinkedLayoutEntityIds,
  isolateLinkedLayoutEntities
} from "../../src/state/layout-entity-isolation.js";
import { removeLayoutTreeFromState } from "../../src/state/layout-delete.js";

function placement({ parentId = "", itemIds = [], childIds = [] } = {}) {
  return {
    parentId,
    itemIds,
    childIds,
    order: [
      ...itemIds.map((id) => ({ type: "item", id })),
      ...childIds.map((id) => ({ type: "container", id }))
    ]
  };
}

test("CRITICAL catalog model: layouts may share global item and container ids", () => {
  const state = {
    containers: {
      "shared-root": {
        id: "shared-root",
        parentId: null,
        itemIds: ["shared-item"],
        childIds: [],
        order: [{ type: "item", id: "shared-item" }]
      }
    },
    items: {
      "shared-item": { id: "shared-item", name: "Stove", containerId: "shared-root" }
    },
    collapsedContainers: { "shared-root": true },
    packedItems: { "shared-item": true },
    layouts: {
      "layout-private": {
        id: "layout-private",
        rootContainerIds: ["shared-root"],
        arrangement: {
          rootContainerIds: ["shared-root"],
          containers: { "shared-root": placement({ itemIds: ["shared-item"] }) },
          items: { "shared-item": "shared-root" },
          packedItems: { "shared-item": true }
        }
      },
      "layout-template": {
        id: "layout-template",
        adminSharedSourceId: "published-a",
        rootContainerIds: ["shared-root"],
        arrangement: {
          rootContainerIds: ["shared-root"],
          containers: { "shared-root": placement({ itemIds: ["shared-item"] }) },
          items: { "shared-item": "shared-root" },
          packedItems: { "shared-item": true }
        }
      }
    },
    activeLayoutId: "layout-private"
  };

  assert.deepEqual(findLinkedLayoutEntityIds(state), {
    containers: ["shared-root"],
    items: ["shared-item"]
  });

  const report = isolateLinkedLayoutEntities(state);

  assert.equal(report.clonedContainers, 0);
  assert.equal(report.clonedItems, 0);
  assert.equal(report.mergedContainers, 0);
  assert.equal(report.mergedItems, 0);
  assert.equal(state.layouts["layout-template"].rootContainerIds[0], "shared-root");
  assert.equal(state.layouts["layout-template"].arrangement.containers["shared-root"].itemIds[0], "shared-item");
  assert.deepEqual(findLinkedLayoutEntityIds(state), {
    containers: ["shared-root"],
    items: ["shared-item"]
  });

  assert.equal(removeLayoutTreeFromState(state, "layout-template"), true);
  assert.ok(state.layouts["layout-private"]);
  assert.ok(state.containers["shared-root"]);
  assert.ok(state.items["shared-item"]);
  assert.equal(state.items["shared-item"].containerId, "shared-root");
});

test("CRITICAL catalog model: nested shared ids survive template delete", () => {
  const state = {
    containers: {
      "private-root": {
        id: "private-root",
        parentId: null,
        itemIds: [],
        childIds: ["shared-child"],
        order: [{ type: "container", id: "shared-child" }]
      },
      "template-root": {
        id: "template-root",
        parentId: null,
        itemIds: [],
        childIds: ["shared-child"],
        order: [{ type: "container", id: "shared-child" }]
      },
      "shared-child": {
        id: "shared-child",
        parentId: "private-root",
        itemIds: ["shared-item"],
        childIds: [],
        order: [{ type: "item", id: "shared-item" }]
      }
    },
    items: {
      "shared-item": { id: "shared-item", name: "Pump", containerId: "shared-child" }
    },
    collapsedContainers: {},
    packedItems: {},
    layouts: {
      "layout-private": {
        id: "layout-private",
        rootContainerIds: ["private-root"],
        arrangement: {
          rootContainerIds: ["private-root"],
          containers: {
            "private-root": placement({ childIds: ["shared-child"] }),
            "shared-child": placement({ parentId: "private-root", itemIds: ["shared-item"] })
          },
          items: { "shared-item": "shared-child" },
          packedItems: {}
        }
      },
      "layout-template": {
        id: "layout-template",
        adminTemplateCopy: true,
        rootContainerIds: ["template-root"],
        arrangement: {
          rootContainerIds: ["template-root"],
          containers: {
            "template-root": placement({ childIds: ["shared-child"] }),
            "shared-child": placement({ parentId: "template-root", itemIds: ["shared-item"] })
          },
          items: { "shared-item": "shared-child" },
          packedItems: {}
        }
      }
    },
    activeLayoutId: "layout-private"
  };

  const report = isolateLinkedLayoutEntities(state);

  assert.equal(report.clonedContainers, 0);
  assert.equal(report.clonedItems, 0);
  assert.equal(state.layouts["layout-template"].arrangement.containers["template-root"].childIds[0], "shared-child");
  assert.equal(state.layouts["layout-template"].arrangement.containers["shared-child"].itemIds[0], "shared-item");

  assert.equal(removeLayoutTreeFromState(state, "layout-template"), true);
  assert.ok(state.containers["private-root"]);
  assert.ok(state.containers["shared-child"]);
  assert.ok(state.items["shared-item"]);
  assert.equal(state.containers["private-root"].childIds[0], "shared-child");
  assert.equal(state.items["shared-item"].containerId, "shared-child");
});

test("CRITICAL catalog repair: accidental isolated copies are rewritten to original ids", () => {
  const state = {
    containers: {
      "shared-root": {
        id: "shared-root",
        parentId: null,
        itemIds: ["shared-item"],
        childIds: [],
        order: [{ type: "item", id: "shared-item" }]
      },
      "container-shared-root-isolated-1": {
        id: "container-shared-root-isolated-1",
        parentId: null,
        itemIds: ["item-shared-item-isolated-1"],
        childIds: [],
        order: [{ type: "item", id: "item-shared-item-isolated-1" }]
      }
    },
    items: {
      "shared-item": { id: "shared-item", name: "Bottle", containerId: "shared-root" },
      "item-shared-item-isolated-1": {
        id: "item-shared-item-isolated-1",
        name: "Bottle",
        containerId: "container-shared-root-isolated-1"
      }
    },
    collapsedContainers: { "container-shared-root-isolated-1": true },
    packedItems: { "item-shared-item-isolated-1": true },
    layouts: {
      "layout-private": {
        id: "layout-private",
        rootContainerIds: ["shared-root"],
        arrangement: {
          rootContainerIds: ["shared-root"],
          containers: { "shared-root": placement({ itemIds: ["shared-item"] }) },
          items: { "shared-item": "shared-root" },
          packedItems: {}
        }
      },
      "layout-template": {
        id: "layout-template",
        rootContainerIds: ["container-shared-root-isolated-1"],
        arrangement: {
          rootContainerIds: ["container-shared-root-isolated-1"],
          containers: {
            "container-shared-root-isolated-1": placement({ itemIds: ["item-shared-item-isolated-1"] })
          },
          items: { "item-shared-item-isolated-1": "container-shared-root-isolated-1" },
          packedItems: { "item-shared-item-isolated-1": true }
        }
      }
    },
    activeLayoutId: "layout-private"
  };

  const report = isolateLinkedLayoutEntities(state);

  assert.equal(report.clonedContainers, 0);
  assert.equal(report.clonedItems, 0);
  assert.equal(report.mergedContainers, 1);
  assert.equal(report.mergedItems, 1);
  assert.deepEqual(report.layoutIds, ["layout-template"]);
  assert.equal(state.containers["container-shared-root-isolated-1"], undefined);
  assert.equal(state.items["item-shared-item-isolated-1"], undefined);
  assert.equal(state.layouts["layout-template"].rootContainerIds[0], "shared-root");
  assert.equal(state.layouts["layout-template"].arrangement.containers["shared-root"].itemIds[0], "shared-item");
  assert.equal(state.layouts["layout-template"].arrangement.items["shared-item"], "shared-root");
  assert.equal(state.packedItems["shared-item"], true);
  assert.equal(state.collapsedContainers["shared-root"], true);
});

test("CRITICAL catalog model: unreferenced managed template entities are still removed", () => {
  const state = {
    containers: {
      "private-root": { id: "private-root", itemIds: [], childIds: [], order: [] },
      "template-root": {
        id: "template-root",
        itemIds: ["template-item"],
        childIds: [],
        order: [{ type: "item", id: "template-item" }]
      }
    },
    items: {
      "template-item": { id: "template-item", name: "Draft-only item", containerId: "template-root" }
    },
    collapsedContainers: { "template-root": true },
    packedItems: { "template-item": true },
    layouts: {
      "layout-private": {
        id: "layout-private",
        rootContainerIds: ["private-root"],
        arrangement: {
          rootContainerIds: ["private-root"],
          containers: { "private-root": placement() },
          items: {},
          packedItems: {}
        }
      },
      "layout-template": {
        id: "layout-template",
        adminTemplateCopy: true,
        rootContainerIds: ["template-root"],
        arrangement: {
          rootContainerIds: ["template-root"],
          containers: { "template-root": placement({ itemIds: ["template-item"] }) },
          items: { "template-item": "template-root" },
          packedItems: { "template-item": true }
        }
      }
    },
    activeLayoutId: "layout-private"
  };

  assert.equal(removeLayoutTreeFromState(state, "layout-template"), true);
  assert.ok(state.containers["private-root"]);
  assert.equal(state.containers["template-root"], undefined);
  assert.equal(state.items["template-item"], undefined);
  assert.equal(state.collapsedContainers["template-root"], undefined);
  assert.equal(state.packedItems["template-item"], undefined);
});
