if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new OnPassAutofill());
} else {
    new OnPassAutofill();
}
