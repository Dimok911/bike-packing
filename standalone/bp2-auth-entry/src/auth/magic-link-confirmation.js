function cleanToken(value = "") {
  return String(value || "")
    .trim()
    .replace(/^[<('"\[]+/, "")
    .replace(/[>)'"\].,;]+$/, "");
}

function tokenFromUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    return cleanToken(url.searchParams.get("token"));
  } catch {
    return "";
  }
}

export function magicLinkTokenFromInput(value, {
  baseUrl = "https://example.invalid/"
} = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const directUrlToken = tokenFromUrl(raw, baseUrl);
  if (directUrlToken) return directUrlToken;

  const embeddedUrl = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0] || "";
  const embeddedUrlToken = tokenFromUrl(embeddedUrl, baseUrl);
  if (embeddedUrlToken) return embeddedUrlToken;

  const queryToken = raw.match(/(?:^|[?&#\s])token=([^\s&#]+)/i)?.[1] || "";
  if (queryToken) {
    try {
      return cleanToken(decodeURIComponent(queryToken));
    } catch {
      return cleanToken(queryToken);
    }
  }

  const token = cleanToken(raw);
  return /^[a-z0-9_-]{20,512}$/i.test(token) ? token : "";
}

export function magicLinkErrorI18nKey(code) {
  const normalized = String(code || "").trim().toLowerCase();
  if (normalized === "magic_link_used") return "auth.magicLinkUsed";
  if (normalized === "magic_link_expired") return "auth.magicLinkExpired";
  if (normalized === "magic_link_token_missing") return "auth.magicLinkRequired";
  if (normalized === "magic_link_invalid") return "auth.magicLinkInvalid";
  return "auth.magicLinkConfirmFailed";
}
