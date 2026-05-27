export function applyStaticTranslationsUi({
  activeReadOnlyLayoutId = () => "",
  canOpenAdminPublishedEdit = () => false,
  demoCopyActionText = () => "",
  demoSharedLayoutId = "",
  documentRef = document,
  isSharedLayoutView = () => false,
  refs = {},
  t = (key) => key,
  uiLanguage = "ru"
} = {}) {
  documentRef.documentElement.lang = uiLanguage;
  documentRef.title = t("app.title");
  const appTitle = documentRef.querySelector(".topbar h1");
  const authGateTitle = documentRef.querySelector(".auth-gate h2");
  const authGateText = documentRef.querySelector(".auth-gate p");
  const languageLabel = documentRef.querySelector("#languageSelectLabel");
  const layoutLabel = documentRef.querySelector(".layout-select-control");
  const searchLabel = documentRef.querySelector("#searchFilterLabel");
  const locationLabel = documentRef.querySelector("#locationFilterLabel");
  const categoryLabel = documentRef.querySelector("#categoryFilterLabel");
  if (appTitle) appTitle.textContent = t("app.title");
  if (authGateTitle) authGateTitle.textContent = uiLanguage === "en" ? "Sign in to open your packing lists" : "Войдите, чтобы открыть сборы";
  if (authGateText) {
    authGateText.textContent = uiLanguage === "en"
      ? "Layouts, weight and storage places will be available after signing in with a magic link."
      : "Укладка, вес и места хранения будут доступны после входа по magic link.";
  }
  if (refs.authGateBtn) refs.authGateBtn.textContent = uiLanguage === "en" ? "Get sign-in link" : "Получить ссылку для входа";
  if (refs.syncBtn) refs.syncBtn.textContent = t("buttons.sync");
  if (refs.sharedLayoutsBtn) refs.sharedLayoutsBtn.textContent = t("menu.sharedLayouts");
  if (refs.shareListBtn) refs.shareListBtn.textContent = t("menu.shareList");
  if (refs.adminReportsBtn) refs.adminReportsBtn.textContent = t("menu.adminReports");
  if (refs.helpLimitsBtn) refs.helpLimitsBtn.textContent = t("menu.help");
  documentRef.querySelector("#exportBtn")?.replaceChildren(documentRef.createTextNode(t("menu.print")));
  if (languageLabel) languageLabel.textContent = t("menu.language");
  if (layoutLabel?.firstChild) layoutLabel.firstChild.textContent = `${t("labels.layout")}\n          `;
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === demoSharedLayoutId && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  if (refs.editLayoutBtn) refs.editLayoutBtn.textContent = uiLanguage === "en" ? "Edit" : "Редактировать";
  if (searchLabel?.firstChild) searchLabel.firstChild.textContent = `${t("labels.search")}\n            `;
  refs.searchInput.placeholder = t("placeholders.search");
  if (locationLabel?.firstChild) locationLabel.firstChild.textContent = `${t("labels.storage")}\n          `;
  if (categoryLabel?.firstChild) categoryLabel.firstChild.textContent = `${t("labels.category")}\n          `;
  documentRef.querySelectorAll(".tabs .tab").forEach((tab) => {
    const key = `tabs.${tab.dataset.view}`;
    tab.textContent = t(key);
  });
  if (refs.copySharedLayoutBtn) refs.copySharedLayoutBtn.textContent = uiLanguage === "en" ? "Copy whole layout" : "Скопировать всю укладку";
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
}
