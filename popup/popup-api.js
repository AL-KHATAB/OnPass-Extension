// Wraps popup-facing API calls so the UI layer can validate tokens and fetch
// passwords without depending on the shared fallback-fetch implementation directly.
(function(globalScope) {
    const popupShared = globalScope.OnPassPopup || (globalScope.OnPassPopup = {});
    const shared = globalScope.OnPassShared || {};
    const constants = shared.constants || {
        VALIDATE_TIMEOUT_MS: 2000,
        PASSWORDS_TIMEOUT_MS: 5000
    };
    const apiClient = shared.api || null;

    // Performs a lightweight session check before the popup commits to the authenticated view.
    async function validateToken(token) {
        try {
            if (!apiClient || typeof apiClient.fetchWithFallback !== 'function') return false;
            const response = await apiClient.fetchWithFallback(
                '/validate',
                token,
                constants.VALIDATE_TIMEOUT_MS
            );
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Loads the current vault snapshot for popup rendering once the token is accepted.
    async function fetchPasswords(token) {
        if (!apiClient || typeof apiClient.fetchWithFallback !== 'function') {
            throw new Error('OnPass API client unavailable');
        }

        const response = await apiClient.fetchWithFallback(
            '/passwords',
            token,
            constants.PASSWORDS_TIMEOUT_MS
        );

        if (!response.ok) {
            throw new Error('Authentication failed');
        }

        return response.json();
    }

    popupShared.api = {
        validateToken,
        fetchPasswords
    };
})(window);
