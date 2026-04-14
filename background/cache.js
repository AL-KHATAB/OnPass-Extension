// Holds the short-lived background cache so repeated popup requests do not
// refetch the full password list on every interaction.
const ONPASS_BG_CACHE_CONSTANTS = (self.OnPassShared && self.OnPassShared.constants) || {
    CACHE_EXPIRY_MS: 5 * 60 * 1000
};

// The cache is keyed by time only because the extension serves one active desktop session at a time.
var passwordsCache = {
    data: null,
    timestamp: 0,
    expiryTime: ONPASS_BG_CACHE_CONSTANTS.CACHE_EXPIRY_MS
};
