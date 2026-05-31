import assert from "node:assert/strict";
import test from "node:test";

import { publishedPhotoUploadRequest } from "../../src/public/published-photo-upload.js";

test("admin demo template dialog photos use the published demo photo endpoint", () => {
  const request = publishedPhotoUploadRequest(
    { id: "layout-demo", adminDemo: true, adminDemoLanguage: "ru", adminDemoListId: "public-demo-state-ru-alt" },
    {
      demoAdminPathForPublicListId: (suffix, listId, language) => `/bike-packing/admin/demo/${language}/${listId}${suffix}`,
      publicListIdForPublishedTarget: (target) => target.demoListId,
      publishedLayoutTarget: (layout) => ({
        type: "demo",
        sharedId: "",
        language: layout.adminDemoLanguage,
        demoListId: layout.adminDemoListId
      }),
      uiLanguage: "ru"
    }
  );

  assert.deepEqual(request, {
    listId: "public-demo-state-ru-alt",
    path: "/bike-packing/admin/demo/ru/public-demo-state-ru-alt/photos",
    target: {
      type: "demo",
      sharedId: "",
      language: "ru",
      demoListId: "public-demo-state-ru-alt"
    }
  });
});

test("admin shared template dialog photos use the published shared photo endpoint", () => {
  const request = publishedPhotoUploadRequest(
    { id: "layout-shared", adminSharedSourceId: "template-copy-ru-123" },
    {
      demoAdminPathForPublicListId: () => "",
      publicListIdForPublishedTarget: (target) => `public-shared-layout-${target.sharedId}`,
      publishedLayoutTarget: (layout) => ({
        type: "shared",
        sharedId: layout.adminSharedSourceId
      })
    }
  );

  assert.deepEqual(request, {
    listId: "public-shared-layout-template-copy-ru-123",
    path: "/bike-packing/admin/shared-layouts/template-copy-ru-123/photos",
    target: {
      type: "shared",
      sharedId: "template-copy-ru-123"
    }
  });
});
