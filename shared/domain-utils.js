(function(globalScope) {
    const shared = globalScope.OnPassShared || (globalScope.OnPassShared = {});

    function normalizeDomainLike(value) {
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
    }

    function isHostLike(value) {
        if (!value) return false;
        if (value === 'localhost') return true;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
        const parts = value.split('.').filter(Boolean);
        return parts.length >= 2;
    }

    function domainsRelated(a, b) {
        if (!a || !b) return false;
        if (!isHostLike(a) || !isHostLike(b)) return false;
        // Treat parent/subdomain pairs as related so stored entries can match
        // across login hosts like auth.example.com and example.com.
        return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
    }

    shared.domain = {
        normalizeDomainLike,
        isHostLike,
        domainsRelated
    };
})(typeof self !== 'undefined' ? self : window);
