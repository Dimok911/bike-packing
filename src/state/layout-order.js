export const LAYOUT_ORDER_SECTION_DEMO = "demo";
export const LAYOUT_ORDER_SECTION_SHARED = "shared";
export const LAYOUT_ORDER_SECTION_PERSONAL = "personal";
export const LAYOUT_ORDER_PUBLIC_DEMO_PREFIX = "public-demo:";
export const LAYOUT_ORDER_PUBLIC_SHARED_PREFIX = "public-shared:";

const SECTION_RANK = {
  [LAYOUT_ORDER_SECTION_DEMO]: 0,
  [LAYOUT_ORDER_SECTION_SHARED]: 1,
  [LAYOUT_ORDER_SECTION_PERSONAL]: 2
};

export function layoutOrderSection(layout, { guestDemoCopyFlag = "" } = {}) {
  if (!layout) return "";
  if (layout.adminDemo) return LAYOUT_ORDER_SECTION_DEMO;
  if (layout.adminSharedSourceId) return LAYOUT_ORDER_SECTION_SHARED;
  if (!layout.adminDemo && !layout.adminSharedSourceId) return LAYOUT_ORDER_SECTION_PERSONAL;
  if (guestDemoCopyFlag && layout?.[guestDemoCopyFlag]) return LAYOUT_ORDER_SECTION_PERSONAL;
  return "";
}

export function layoutOrderValue(layout) {
  const value = Number(layout?.layoutOrder);
  return Number.isFinite(value) ? value : null;
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

export function layoutOrderPublicDemoId(listId = "") {
  const id = normalizeText(listId);
  return id ? `${LAYOUT_ORDER_PUBLIC_DEMO_PREFIX}${id}` : "";
}

export function layoutOrderPublicSharedId(sharedId = "") {
  const id = normalizeText(sharedId);
  return id ? `${LAYOUT_ORDER_PUBLIC_SHARED_PREFIX}${id}` : "";
}

export function publicLayoutOrderSourceForId(layoutId = "", layouts = {}) {
  const id = normalizeText(layoutId);
  if (id.startsWith(LAYOUT_ORDER_PUBLIC_DEMO_PREFIX)) {
    return {
      section: LAYOUT_ORDER_SECTION_DEMO,
      sourceId: id.slice(LAYOUT_ORDER_PUBLIC_DEMO_PREFIX.length)
    };
  }
  if (id.startsWith(LAYOUT_ORDER_PUBLIC_SHARED_PREFIX)) {
    return {
      section: LAYOUT_ORDER_SECTION_SHARED,
      sourceId: id.slice(LAYOUT_ORDER_PUBLIC_SHARED_PREFIX.length)
    };
  }
  const layout = layouts?.[id];
  if (layout?.adminDemo) {
    return {
      section: LAYOUT_ORDER_SECTION_DEMO,
      sourceId: normalizeText(layout.adminDemoListId || layout.demoListId || layout.id)
    };
  }
  if (layout?.adminSharedSourceId) {
    return {
      section: LAYOUT_ORDER_SECTION_SHARED,
      sourceId: normalizeText(layout.adminSharedSourceId)
    };
  }
  return {
    section: LAYOUT_ORDER_SECTION_PERSONAL,
    sourceId: id
  };
}

function publicDemoOrderRecord(entry) {
  const listId = normalizeText(entry?.listId || entry?.id);
  const id = layoutOrderPublicDemoId(listId);
  if (!id || entry?.missing) return null;
  return {
    id,
    name: normalizeText(entry?.name || entry?.title || listId) || listId,
    adminDemo: true,
    adminDemoListId: listId,
    adminDemoLanguage: normalizeText(entry?.language),
    layoutOrder: layoutOrderValue(entry),
    createdAt: normalizeText(entry?.createdAt || entry?.created_at),
    updatedAt: normalizeText(entry?.updatedAt || entry?.updated_at),
    publicTemplateOrderRecord: true
  };
}

function publicSharedOrderRecord(entry) {
  const sharedId = normalizeText(entry?.id || entry?.sharedLayoutId);
  const id = layoutOrderPublicSharedId(sharedId);
  if (!id) return null;
  return {
    id,
    name: normalizeText(entry?.name || entry?.title || sharedId) || sharedId,
    adminSharedSourceId: sharedId,
    language: normalizeText(entry?.language),
    layoutOrder: layoutOrderValue(entry),
    createdAt: normalizeText(entry?.createdAt || entry?.created_at),
    updatedAt: normalizeText(entry?.updatedAt || entry?.updated_at),
    publicTemplateOrderRecord: true
  };
}

function compareLayoutOrderEntries(a, b, locale = "ru") {
  const sectionOrder = (SECTION_RANK[a.section] ?? 99) - (SECTION_RANK[b.section] ?? 99);
  if (sectionOrder) return sectionOrder;
  const aOrder = layoutOrderValue(a.layout);
  const bOrder = layoutOrderValue(b.layout);
  if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
  if (aOrder !== null && bOrder === null) return -1;
  if (aOrder === null && bOrder !== null) return 1;
  return Number(a.index) - Number(b.index) ||
    String(a.layout?.name || "").localeCompare(String(b.layout?.name || ""), locale, { numeric: true, sensitivity: "base" });
}

export function compareLayoutsByOrder(a, b, locale = "ru") {
  const aSection = layoutOrderSection(a);
  const bSection = layoutOrderSection(b);
  return compareLayoutOrderEntries(
    { layout: a, section: aSection, index: 0 },
    { layout: b, section: bSection, index: 0 },
    locale
  );
}

export function orderedLayoutEntries(layouts = {}, {
  guestDemoCopyFlag = "",
  includeLayout = () => true,
  locale = "ru"
} = {}) {
  return Object.values(layouts || {})
    .map((layout, index) => ({
      id: layout?.id || "",
      layout,
      index,
      section: layoutOrderSection(layout, { guestDemoCopyFlag })
    }))
    .filter((entry) => entry.id && entry.section && includeLayout(entry.layout))
    .sort((a, b) => compareLayoutOrderEntries(a, b, locale));
}

export function orderedLayouts(layouts = {}, options = {}) {
  return orderedLayoutEntries(layouts, options).map((entry) => entry.layout);
}

export function layoutOrderSections(layouts = {}, options = {}) {
  const sectionMap = {
    [LAYOUT_ORDER_SECTION_DEMO]: [],
    [LAYOUT_ORDER_SECTION_SHARED]: [],
    [LAYOUT_ORDER_SECTION_PERSONAL]: []
  };
  orderedLayoutEntries(layouts, options).forEach((entry) => {
    sectionMap[entry.section].push(entry.layout);
  });
  return [
    { id: LAYOUT_ORDER_SECTION_DEMO, layouts: sectionMap[LAYOUT_ORDER_SECTION_DEMO] },
    { id: LAYOUT_ORDER_SECTION_SHARED, layouts: sectionMap[LAYOUT_ORDER_SECTION_SHARED] },
    { id: LAYOUT_ORDER_SECTION_PERSONAL, layouts: sectionMap[LAYOUT_ORDER_SECTION_PERSONAL] }
  ];
}

export function layoutOrderSectionsFromSources({
  layouts = {},
  demoTemplates = [],
  sharedTemplates = [],
  includeLayout = () => true,
  guestDemoCopyFlag = "",
  locale = "ru"
} = {}) {
  const orderLayouts = {};
  (Array.isArray(demoTemplates) ? demoTemplates : []).forEach((entry) => {
    const record = publicDemoOrderRecord(entry);
    if (record) orderLayouts[record.id] = record;
  });
  (Array.isArray(sharedTemplates) ? sharedTemplates : []).forEach((entry) => {
    const record = publicSharedOrderRecord(entry);
    if (record) orderLayouts[record.id] = record;
  });
  Object.values(layouts || {}).forEach((layout) => {
    if (!layout?.id || !includeLayout(layout)) return;
    if (layout.adminDemo) {
      const demoId = layoutOrderPublicDemoId(layout.adminDemoListId || layout.demoListId || layout.id);
      if (demoId) delete orderLayouts[demoId];
    }
    if (layout.adminSharedSourceId) {
      const sharedId = layoutOrderPublicSharedId(layout.adminSharedSourceId);
      if (sharedId) delete orderLayouts[sharedId];
    }
    orderLayouts[layout.id] = layout;
  });
  return layoutOrderSections(orderLayouts, {
    guestDemoCopyFlag,
    includeLayout: () => true,
    locale
  });
}

export function layoutOrderIdsFromSections(sections = []) {
  return sections.flatMap((section) => (section?.layouts || []).map((layout) => layout?.id).filter(Boolean));
}

export function moveLayoutWithinSections(sections = [], layoutId = "", delta = 0) {
  const next = sections.map((section) => ({ ...section, layouts: [...(section.layouts || [])] }));
  const section = next.find((entry) => entry.layouts.some((layout) => layout?.id === layoutId));
  if (!section) return next;
  const from = section.layouts.findIndex((layout) => layout?.id === layoutId);
  const to = Math.max(0, Math.min(section.layouts.length - 1, from + Number(delta || 0)));
  if (from < 0 || from === to) return next;
  const [layout] = section.layouts.splice(from, 1);
  section.layouts.splice(to, 0, layout);
  return next;
}

export function moveLayoutBeforeInSections(sections = [], layoutId = "", beforeLayoutId = "") {
  if (!layoutId || !beforeLayoutId || layoutId === beforeLayoutId) return sections;
  const next = sections.map((section) => ({ ...section, layouts: [...(section.layouts || [])] }));
  const section = next.find((entry) =>
    entry.layouts.some((layout) => layout?.id === layoutId) &&
    entry.layouts.some((layout) => layout?.id === beforeLayoutId)
  );
  if (!section) return next;
  const from = section.layouts.findIndex((layout) => layout?.id === layoutId);
  const [layout] = section.layouts.splice(from, 1);
  const to = section.layouts.findIndex((entry) => entry?.id === beforeLayoutId);
  section.layouts.splice(to < 0 ? section.layouts.length : to, 0, layout);
  return next;
}

export function sortLayoutSectionByName(sections = [], sectionId = "", direction = "asc", locale = "ru") {
  const multiplier = direction === "desc" ? -1 : 1;
  return sections.map((section) => {
    if (section?.id !== sectionId) return { ...section, layouts: [...(section.layouts || [])] };
    return {
      ...section,
      layouts: [...(section.layouts || [])].sort((a, b) =>
        multiplier * String(a?.name || "").localeCompare(String(b?.name || ""), locale, { numeric: true, sensitivity: "base" })
      )
    };
  });
}

export function layoutDateValue(layout) {
  const created = Date.parse(layout?.createdAt || "");
  if (Number.isFinite(created)) return created;
  const updated = Date.parse(layout?.updatedAt || "");
  return Number.isFinite(updated) ? updated : 0;
}

export function sortLayoutSectionByDate(sections = [], sectionId = "", direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;
  return sections.map((section) => {
    if (section?.id !== sectionId) return { ...section, layouts: [...(section.layouts || [])] };
    return {
      ...section,
      layouts: [...(section.layouts || [])].sort((a, b) =>
        multiplier * (layoutDateValue(a) - layoutDateValue(b)) ||
        String(a?.name || "").localeCompare(String(b?.name || ""), "ru", { numeric: true, sensitivity: "base" })
      )
    };
  });
}

export function applyLayoutOrderToState(targetState, orderedIds = [], {
  changedAt = "",
  markEdited = () => {}
} = {}) {
  const layouts = targetState?.layouts;
  if (!layouts || typeof layouts !== "object") return false;
  const knownIds = orderedIds.filter((id) => layouts[id]);
  if (!knownIds.length) return false;
  let changed = false;
  const nextLayouts = {};
  knownIds.forEach((id, index) => {
    const layout = layouts[id];
    const nextOrder = index + 1;
    if (layout.layoutOrder !== nextOrder) {
      layout.layoutOrder = nextOrder;
      markEdited(layout, changedAt);
      changed = true;
    }
    nextLayouts[id] = layout;
  });
  Object.keys(layouts).forEach((id) => {
    if (!nextLayouts[id]) nextLayouts[id] = layouts[id];
  });
  const previousIds = Object.keys(layouts);
  const nextIds = Object.keys(nextLayouts);
  if (previousIds.length !== nextIds.length || previousIds.some((id, index) => id !== nextIds[index])) changed = true;
  if (changed) targetState.layouts = nextLayouts;
  return changed;
}

function applyOrderToCatalog(catalog = [], orderBySourceId = new Map()) {
  let changed = false;
  const next = (Array.isArray(catalog) ? catalog : []).map((entry) => {
    const sourceId = normalizeText(entry?.listId || entry?.id || entry?.sharedLayoutId);
    if (!sourceId || !orderBySourceId.has(sourceId)) return entry;
    const nextOrder = orderBySourceId.get(sourceId);
    if (layoutOrderValue(entry) === nextOrder) return entry;
    changed = true;
    return { ...entry, layoutOrder: nextOrder };
  });
  return { catalog: next, changed };
}

export function applyLayoutOrderToSources(targetState, orderedIds = [], {
  demoTemplates = [],
  sharedTemplates = [],
  changedAt = "",
  markEdited = () => {}
} = {}) {
  const layouts = targetState?.layouts || {};
  const demoOrder = new Map();
  const sharedOrder = new Map();
  orderedIds.forEach((id, index) => {
    const source = publicLayoutOrderSourceForId(id, layouts);
    const order = index + 1;
    if (source.section === LAYOUT_ORDER_SECTION_DEMO && source.sourceId) demoOrder.set(source.sourceId, order);
    if (source.section === LAYOUT_ORDER_SECTION_SHARED && source.sourceId) sharedOrder.set(source.sourceId, order);
  });
  const stateChanged = applyLayoutOrderToState(targetState, orderedIds, { changedAt, markEdited });
  const demoResult = applyOrderToCatalog(demoTemplates, demoOrder);
  const sharedResult = applyOrderToCatalog(sharedTemplates, sharedOrder);
  return {
    changed: stateChanged || demoResult.changed || sharedResult.changed,
    stateChanged,
    demoTemplates: demoResult.catalog,
    demoTemplatesChanged: demoResult.changed,
    sharedTemplates: sharedResult.catalog,
    sharedTemplatesChanged: sharedResult.changed
  };
}
