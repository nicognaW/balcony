// The pairing token. The QR code `balcony` prints opens
// `http://<mac>:<port>/#token=…`; the token is kept on the phone so later
// visits open straight into the list.
//
// It lives in localStorage rather than an HttpOnly cookie: the server serves
// this page and nothing else runs on it, the Android app keeps the same token
// itself, and the WebSocket sends it as a query parameter, which needs it
// readable here.
const STORAGE_KEY = "balcony:token";

export const loadToken = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const saveToken = (token: string) => {
  try {
    // oxlint-disable-next-line react-doctor/auth-token-in-web-storage -- see the top of this file.
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Private mode: the token lasts as long as the page.
  }
};

export const forgetToken = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
};

/**
 * Takes a token from the address's fragment (`#token=…`), stores it, and
 * removes it from the address bar so it isn't bookmarked or shared.
 */
export const takeTokenFromUrl = (): string | null => {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");

  if (token === null || token === "") {
    return null;
  }

  saveToken(token);
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search
  );

  return token;
};
