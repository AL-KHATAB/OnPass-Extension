(function(globalScope) {
    const popupShared = globalScope.OnPassPopup || (globalScope.OnPassPopup = {});
    const shared = globalScope.OnPassShared || {};
    const constants = shared.constants || {
        VALIDATE_TIMEOUT_MS: 2000,
        PASSWORDS_TIMEOUT_MS: 5000
    };
    const apiClient = shared.api || null;

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
