// Centralizes background event handlers that answer popup and content-script
// requests and keep cached session data aligned with token lifecycle changes.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SAVED_PASSWORDS') {
        // Domain filtering happens here so content scripts receive a smaller,
        // more relevant candidate set before local fallback ranking kicks in.
        fetchPasswords(request.forceRefresh)
            .then(passwords => {
                const requestUrl = request.url || sender?.url || sender?.tab?.url;
                if (requestUrl) {
                    try {
                        const currentUrl = new URL(requestUrl);
                        const currentDomain = normalizeDomainLike(currentUrl.hostname);

                        // Match by related hostnames so saved entries still show up
                        // for subdomains and lightly normalized website values.
                        const matchedPasswords = passwords.filter(password => {
                            if (!password.Website) return false;

                            let passwordUrl = password.Website;
                            if (!passwordUrl.startsWith('http') && !passwordUrl.includes('://')) {
                                passwordUrl = 'https://' + passwordUrl;
                            }

                            try {
                                const passwordUrlObj = new URL(passwordUrl);
                                const passwordDomain = normalizeDomainLike(passwordUrlObj.hostname);
                                return domainsRelated(currentDomain, passwordDomain);
                            } catch {
                                const fallbackSiteDomain = normalizeDomainLike(password.Website);
                                return domainsRelated(currentDomain, fallbackSiteDomain);
                            }
                        });

                        sendResponse({ success: true, passwords: matchedPasswords });
                    } catch (error) {
                        sendResponse({ success: false, error: 'Invalid URL' });
                    }
                } else {
                    sendResponse({ success: true, passwords });
                }
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true;
    }

    if (request.type === 'CLEAR_CACHE') {
        // Popup and settings actions can explicitly invalidate cached passwords after token or vault changes.
        passwordsCache.data = null;
        passwordsCache.timestamp = 0;
        sendResponse({ success: true });
        return false;
    }

    if (request.type === 'VALIDATE_TOKEN') {
        // Validation lets the popup confirm the desktop session is still alive without fetching passwords first.
        getAccessToken()
            .then(token => validateToken(token))
            .then(isValid => {
                if (!isValid) {
                    clearStoredToken();
                }
                sendResponse({ success: true, valid: isValid });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

// Any token change invalidates cached password results immediately so the extension never serves stale data.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.onpassAccessToken) {
        // Token changes invalidate any cached password payloads immediately.
        passwordsCache.data = null;
        passwordsCache.timestamp = 0;
    }
});

// Startup validation clears broken sessions before the user opens the popup on a page.
chrome.runtime.onStartup.addListener(() => {
    checkTokenValidity();
});

chrome.runtime.onInstalled.addListener(() => {
});
