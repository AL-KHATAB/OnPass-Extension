chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SAVED_PASSWORDS') {
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
        passwordsCache.data = null;
        passwordsCache.timestamp = 0;
        sendResponse({ success: true });
        return false;
    }

    if (request.type === 'VALIDATE_TOKEN') {
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

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.onpassAccessToken) {
        // Token changes invalidate any cached password payloads immediately.
        passwordsCache.data = null;
        passwordsCache.timestamp = 0;
    }
});

chrome.runtime.onStartup.addListener(() => {
    checkTokenValidity();
});

chrome.runtime.onInstalled.addListener(() => {
});
