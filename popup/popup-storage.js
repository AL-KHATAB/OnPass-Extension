(function(globalScope) {
    const popupShared = globalScope.OnPassPopup || (globalScope.OnPassPopup = {});

    function getAccessToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['onpassAccessToken'], (result) => {
                resolve(result.onpassAccessToken || null);
            });
        });
    }

    function saveAccessToken(token) {
        return new Promise((resolve) => {
            // The popup only persists the token locally; the background script
            // remains responsible for validating it before using it.
            chrome.storage.local.set({
                onpassAccessToken: token,
                tokenSavedTimestamp: Date.now()
            }, () => {
                resolve();
            });
        });
    }

    function clearAccessToken() {
        return new Promise((resolve) => {
            chrome.storage.local.remove(['onpassAccessToken', 'tokenSavedTimestamp'], () => {
                resolve();
            });
        });
    }

    popupShared.storage = {
        getAccessToken,
        saveAccessToken,
        clearAccessToken
    };
})(window);
