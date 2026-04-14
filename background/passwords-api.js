// Retrieves passwords from the desktop app through the shared API client and
// keeps a short-lived cache so frequent popup requests do not flood localhost.
const ONPASS_BG_API_SHARED = self.OnPassShared || {};
const ONPASS_BG_API_CONSTANTS = ONPASS_BG_API_SHARED.constants || {
    PASSWORDS_TIMEOUT_MS: 5000
};
const ONPASS_BG_API_CLIENT = ONPASS_BG_API_SHARED.api || null;

// Validates the current token before returning cached or freshly loaded passwords to callers.
async function fetchPasswords(forceRefresh = false) {
    try {
        const now = Date.now();
        // The background worker caches passwords briefly so repeated popup/focus
        // events do not hammer the desktop app over localhost.
        if (!forceRefresh &&
            passwordsCache.data &&
            (now - passwordsCache.timestamp) < passwordsCache.expiryTime) {
            return passwordsCache.data;
        }

        const token = await getAccessToken();

        const isTokenValid = await validateToken(token);
        if (!isTokenValid) {
            await clearStoredToken();
            passwordsCache.data = null;
            passwordsCache.timestamp = 0;
            throw new Error('Invalid OnPass access token');
        }

        if (!ONPASS_BG_API_CLIENT || typeof ONPASS_BG_API_CLIENT.fetchWithFallback !== 'function') {
            throw new Error('OnPass API client is unavailable');
        }

        // Password requests use the shared fallback client because the desktop
        // app may be listening on either supported local port.
        const response = await ONPASS_BG_API_CLIENT.fetchWithFallback(
            '/passwords',
            token,
            ONPASS_BG_API_CONSTANTS.PASSWORDS_TIMEOUT_MS
        );

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const passwords = await response.json();

        passwordsCache.data = passwords;
        passwordsCache.timestamp = now;

        return passwords;
    } catch (error) {
        passwordsCache.data = null;
        passwordsCache.timestamp = 0;
        throw error;
    }
}
