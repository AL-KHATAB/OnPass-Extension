(function(globalScope) {
    const shared = globalScope.OnPassShared || (globalScope.OnPassShared = {});
    // Freeze shared settings once so every background/popup module reads the
    // same timeout and fallback-port values.
    shared.constants = Object.freeze({
        API_PORTS: [9876, 9877],
        VALIDATE_TIMEOUT_MS: 2000,
        PASSWORDS_TIMEOUT_MS: 5000,
        CACHE_EXPIRY_MS: 5 * 60 * 1000
    });
})(typeof self !== 'undefined' ? self : window);
