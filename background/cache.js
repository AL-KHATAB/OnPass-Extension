const ONPASS_BG_CACHE_CONSTANTS = (self.OnPassShared && self.OnPassShared.constants) || {
    CACHE_EXPIRY_MS: 5 * 60 * 1000
};

var passwordsCache = {
    data: null,
    timestamp: 0,
    expiryTime: ONPASS_BG_CACHE_CONSTANTS.CACHE_EXPIRY_MS
};
