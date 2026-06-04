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

test("CRITICAL layout isolation: old root links between private layouts and templates are split before delete", () => {
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
  const templateRootId = state.layouts["layout-template"].rootContainerIds[0];
  const templateItemId = state.layouts["layout-template"].arrangement.containers[templateRootId].itemIds[0];

  assert.equal(report.clonedContainers, 1);
  assert.equal(report.clonedItems, 1);
  assert.deepEqual(report.layoutIds, ["layout-template"]);
  assert.notEqual(templateRootId, "shared-root");
  assert.notEqual(templateItemId, "shared-item");
  assert.equal(state.items[templateItemId].containerId, templateRootId);
  assert.deepEqual(findLinkedLayoutEntityIds(state), { containers: [], items: [] });

  assert.equal(removeLayoutTreeFromState(state, "layout-template"), true);
  assert.ok(state.layouts["layout-private"]);
  assert.ok(state.containers["shared-root"]);
  assert.ok(state.items["shared-item"]);
  assert.equal(state.items["shared-item"].containerId, "shared-root");
  assert.equal(state.containers[templateRootId], undefined);
  assert.equal(state.items[templateItemId], undefined);
});

test("CRITICAL layout isolation: old nested links are split even when root ids differ", () => {
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
  const templatePlacement = state.layouts["layout-template"].arrangement.containers["template-root"];
  const templateChildId = templatePlacement.childIds[0];
  const templateItemId = state.layouts["layout-template"].arrangement.containers[templateChildId].itemIds[0];

  assert.equal(report.clonedContainers, 1);
  assert.equal(report.clonedItems, 1);
  assert.notEqual(templateChildId, "shared-child");
  assert.notEqual(templateItemId, "shared-item");
  assert.equal(state.containers[templateChildId].parentId, "template-root");
  assert.equal(state.items[templateItemId].containerId, templateChildId);
  assert.deepEqual(findLinkedLayoutEntityIds(state), { containers: [], items: [] });

  assert.equal(removeLayoutTreeFromState(state, "layout-template"), true);
  assert.ok(state.containers["private-root"]);
  assert.ok(state.containers["shared-child"]);
  assert.ok(state.items["shared-item"]);
  assert.equal(state.containers["private-root"].childIds[0], "shared-child");
  assert.equal(state.items["shared-item"].containerId, "shared-child");
});
