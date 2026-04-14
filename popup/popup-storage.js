// Persists the popup token locally so the UI can restore the last successful
// desktop connection between popup openings.
(function(globalScope) {
    const popupShared = globalScope.OnPassPopup || (globalScope.OnPassPopup = {});

    // Reads the saved extension key from local storage during popup startup.
    function getAccessToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['onpassAccessToken'], (result) => {
                resolve(result.onpassAccessToken || null);
            });
        });
    }

    // Stores the token together with a timestamp so the popup can resume quickly on the next open.
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

    // Clears saved token state after logout or failed validation.
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
