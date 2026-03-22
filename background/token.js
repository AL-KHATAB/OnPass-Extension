const ONPASS_BG_TOKEN_SHARED = self.OnPassShared || {};
const ONPASS_BG_TOKEN_CONSTANTS = ONPASS_BG_TOKEN_SHARED.constants || {
    VALIDATE_TIMEOUT_MS: 2000
};
const ONPASS_BG_TOKEN_API = ONPASS_BG_TOKEN_SHARED.api || null;

function getAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['onpassAccessToken'], (result) => {
            if (result.onpassAccessToken) {
                resolve(result.onpassAccessToken);
            } else {
                reject(new Error('No access token found'));
            }
        });
    });
}

async function validateToken(token) {
    try {
        // Background code treats the shared API client as optional so startup
        // can fail closed instead of crashing if scripts load out of order.
        if (!ONPASS_BG_TOKEN_API || typeof ONPASS_BG_TOKEN_API.fetchWithFallback !== 'function') return false;
        const response = await ONPASS_BG_TOKEN_API.fetchWithFallback(
            '/validate',
            token,
            ONPASS_BG_TOKEN_CONSTANTS.VALIDATE_TIMEOUT_MS
        );
        return response.ok;
    } catch (error) {
        return false;
    }
}

function clearStoredToken() {
    return new Promise((resolve) => {
        chrome.storage.local.remove(['onpassAccessToken', 'tokenSavedTimestamp'], () => {
            resolve();
        });
    });
}

async function checkTokenValidity() {
    try {
        const token = await getAccessToken();
        const isValid = await validateToken(token);

        if (!isValid) {
            // Clearing the cache here prevents stale credentials from surviving
            // after the desktop app rotates or revokes the access token.
            await clearStoredToken();
            passwordsCache.data = null;
            passwordsCache.timestamp = 0;
        }
    } catch (error) {
    }
}
