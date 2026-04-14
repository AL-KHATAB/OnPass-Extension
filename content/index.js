// Boots the autofill engine once the page DOM is ready enough to inspect fields.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new OnPassAutofill());
} else {
    new OnPassAutofill();
}
