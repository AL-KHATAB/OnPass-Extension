(function(globalScope) {
    const shared = globalScope.OnPassShared || (globalScope.OnPassShared = {});
    const defaultConstants = {
        API_PORTS: [8765, 8766],
        VALIDATE_TIMEOUT_MS: 2000,
        PASSWORDS_TIMEOUT_MS: 5000
    };
    const constants = shared.constants || defaultConstants;

    async function fetchWithFallback(pathname, token, timeoutMs) {
        const ports = Array.isArray(constants.API_PORTS) && constants.API_PORTS.length
            ? constants.API_PORTS
            : defaultConstants.API_PORTS;
        let lastError = null;

        // The desktop companion can come up on either local port, so the
        // extension probes them in order before giving up.
        for (const port of ports) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(`http://localhost:${port}${pathname}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                lastError = error;
            }
        }

        throw lastError || new Error('Unable to reach OnPass local service');
    }

    shared.api = {
        fetchWithFallback
    };
})(typeof self !== 'undefined' ? self : window);
