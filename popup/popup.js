document.addEventListener('DOMContentLoaded', () => {
    const popupShared = window.OnPassPopup || {};
    const storage = popupShared.storage || {};
    const api = popupShared.api || {};
    const view = popupShared.view || {};

    const elements = view.getElements();
    let allPasswords = [];

    init();

    async function init() {
        try {
            const token = await storage.getAccessToken();
            if (token) {
                const isValid = await api.validateToken(token);
                if (isValid) {
                    view.showPasswordsContainer(elements);
                    await loadPasswords(token);
                } else {
                    await storage.clearAccessToken();
                    view.showLoginContainer(elements);
                }
            } else {
                view.showLoginContainer(elements);
            }
        } catch (error) {
            view.showLoginContainer(elements);
            view.displayError(elements, 'Failed to initialize the OnPass extension');
        }
    }

    async function loadPasswords(token) {
        view.clearError(elements);
        view.showLoading(elements);

        try {
            const passwords = await api.fetchPasswords(token);
            allPasswords = passwords;
            view.renderPasswords(elements, allPasswords, {
                onCopyUsername: (password) => {
                    navigator.clipboard.writeText(password.Username || '');
                    view.showCopiedPopup(elements);
                },
                onCopyPassword: (password) => {
                    navigator.clipboard.writeText(password.Password || '');
                    view.showCopiedPopup(elements);
                }
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                view.displayError(elements, 'Request timed out. Please try again.');
            } else if (error.message === 'Authentication failed') {
                view.displayError(elements, 'Authentication failed. Please login again.');
                await storage.clearAccessToken();
                view.showLoginContainer(elements);
            } else {
                view.showLoginContainer(elements);
                view.displayError(elements, 'Failed to fetch passwords from OnPass. Please try again.');
            }
            view.clearPasswordList(elements);
        }
    }

    elements.connectBtn.addEventListener('click', async () => {
        const accessToken = elements.accessKeyInput.value.trim();

        if (!accessToken) {
            view.displayError(elements, 'Please enter the OnPass Web Extension Key');
            return;
        }

        view.clearError(elements);
        elements.connectBtn.textContent = 'Connecting...';
        elements.connectBtn.disabled = true;

        try {
            const isValid = await api.validateToken(accessToken);
            if (!isValid) {
                throw new Error('Invalid access token');
            }

            await storage.saveAccessToken(accessToken);
            view.showPasswordsContainer(elements);
            await loadPasswords(accessToken);
        } catch (error) {
            view.displayError(elements, 'Failed to connect. Please make sure CyberVault is running and the key is correct.');
        } finally {
            elements.connectBtn.textContent = 'Connect to CyberVault';
            elements.connectBtn.disabled = false;
        }
    });

    elements.accessKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.connectBtn.click();
        }
    });

    elements.searchInput.addEventListener('input', view.debounce((e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredPasswords = allPasswords.filter((password) =>
            (password.Name && password.Name.toLowerCase().includes(searchTerm)) ||
            (password.Website && password.Website.toLowerCase().includes(searchTerm)) ||
            (password.Username && password.Username.toLowerCase().includes(searchTerm))
        );
        view.renderPasswords(elements, filteredPasswords, {
            onCopyUsername: (password) => {
                navigator.clipboard.writeText(password.Username || '');
                view.showCopiedPopup(elements);
            },
            onCopyPassword: (password) => {
                navigator.clipboard.writeText(password.Password || '');
                view.showCopiedPopup(elements);
            }
        });
    }, 300));
});
