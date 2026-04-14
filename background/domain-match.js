// Provides fallback domain helpers for the background worker when the shared
// utilities bundle has not yet attached its reusable implementations.
const ONPASS_BG_DOMAIN = (self.OnPassShared && self.OnPassShared.domain) || {};

// Normalizes stored sites and active-tab URLs to comparable host-like values.
var normalizeDomainLike = ONPASS_BG_DOMAIN.normalizeDomainLike || function(value) {
    if (!value || typeof value !== 'string') return '';
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return '';
    try {
        const url = cleaned.includes('://') ? cleaned : `https://${cleaned}`;
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
    } catch {
        return cleaned
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .split(':')[0]
            .replace(/^www\./, '')
            .replace(/\.+$/, '');
    }
};

// Rejects values that do not look like real hosts before attempting related-domain checks.
var isHostLike = ONPASS_BG_DOMAIN.isHostLike || function(value) {
    if (!value) return false;
    if (value === 'localhost') return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
    const parts = value.split('.').filter(Boolean);
    return parts.length >= 2;
};

// Treats exact matches and simple subdomain relationships as related login contexts.
var domainsRelated = ONPASS_BG_DOMAIN.domainsRelated || function(a, b) {
    if (!a || !b) return false;
    if (!isHostLike(a) || !isHostLike(b)) return false;
    return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
};
