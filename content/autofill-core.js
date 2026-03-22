class OnPassAutofill {
    constructor() {
        this.debugMode = false;
        // The engine behaves like a small state machine so popup timing and
        // dynamic DOM rescans stay coordinated across focus, blur, and mutation events.
        this.state = 'IDLE';
        this.currentField = null;
        this.currentContext = null;
        this.activeContextState = null;
        this.popupShownAt = 0;
        this.popupHideCooldownMs = 250;
        this.contextLockThreshold = 60;
        this.classificationCache = new WeakMap();
        this.contextMeta = new WeakMap();
        this.loginKeywords = ['login', 'log in', 'sign in', 'signin', 'auth', 'account', 'username', 'email', 'password'];
        this.searchKeywords = ['search', 'query', 'find', 'filter', 'lookup', 'browse'];
        this.lastDebugLog = 0;
        this.pendingMutations = [];
        this.mutationFlushTimer = null;
        this.popupRequestSeq = 0;
        this.popupInteractionUntil = 0;

        this.createStyles();
        this.createPopup();
        this.attachEventListeners();
        this.observeDynamicDom();
        this.hookRouteChanges();
    }

}

globalThis.OnPassAutofill = OnPassAutofill;
