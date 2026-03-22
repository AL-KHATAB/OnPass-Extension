if (typeof OnPassAutofill === 'undefined') {
    throw new Error('OnPassAutofill core must load first (engine).');
}

Object.assign(OnPassAutofill.prototype, {
    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #onpass-autofill-popup {
                position: absolute;
                background: white;
                border: 1px solid #3BA7FF;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 2147483647;
                width: 280px;
                max-height: 300px;
                overflow-y: auto;
                display: none;
                font-family: 'Inter', sans-serif;
                animation: onpass-fade-in 0.2s ease;
            }
            @keyframes onpass-fade-in {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .onpass-popup-item {
                padding: 12px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                transition: background-color 0.15s ease;
            }
            .onpass-popup-item:last-child { border-bottom: none; }
            .onpass-popup-item:hover { background-color: #f5f5f5; }
            .onpass-popup-item-icon {
                width: 24px;
                height: 24px;
                margin-right: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #3BA7FF;
                color: white;
                border-radius: 4px;
                font-weight: bold;
                font-size: 10px;
            }
            .onpass-popup-item-details { flex-grow: 1; }
            .onpass-popup-item-details strong {
                color: #3BA7FF;
                display: block;
                font-size: 14px;
                margin-bottom: 2px;
            }
            .onpass-popup-item-details small { color: #666; font-size: 12px; }
            #onpass-debug-panel {
                position: fixed;
                right: 12px;
                bottom: 12px;
                width: 320px;
                z-index: 2147483647;
                background: rgba(15, 23, 42, 0.92);
                color: #e2e8f0;
                font: 12px/1.4 Consolas, monospace;
                border-radius: 8px;
                padding: 10px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                display: none;
                white-space: pre-wrap;
            }
        `;
        document.head.appendChild(style);
    },


    createPopup() {
        this.popup = document.createElement('div');
        this.popup.id = 'onpass-autofill-popup';
        document.body.appendChild(this.popup);
        const interactionHandler = (e) => {
            this.lockPopupInteraction(900);
            // Keep the currently focused input stable while user chooses a credential.
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
        };
        this.popup.addEventListener('pointerdown', interactionHandler, true);
        this.popup.addEventListener('mousedown', interactionHandler, true);

        this.debugPanel = document.createElement('div');
        this.debugPanel.id = 'onpass-debug-panel';
        document.body.appendChild(this.debugPanel);
    },


    debugLog(event, payload = null) {
        if (!this.debugMode) return;
        const now = Date.now();
        if (now - this.lastDebugLog < 40) return;
        this.lastDebugLog = now;
        const line = payload ? `${event} ${JSON.stringify(payload)}` : event;
        console.debug('[OnPassAutofill]', line);
        this.debugPanel.style.display = 'block';
        this.debugPanel.textContent = line;
    },


    setState(nextState) {
        if (this.state === nextState) return;
        this.debugLog('state', { from: this.state, to: nextState });
        this.state = nextState;
    },


    attachEventListeners() {
        const focusHandler = (e, source) => {
            if (this.popup && this.popup.contains(e.target)) return;
            const targetField = this.resolveEventInputTarget(e);
            if (!this.isEditableField(targetField)) return;
            this.handlePotentialFieldFocus(targetField, source);
        };

        // Use both bubbling and capture-phase focus signals because many SPA
        // login forms swap or wrap the real input node during interaction.
        document.addEventListener('focusin', (e) => focusHandler(e, 'focusin'), true);
        document.addEventListener('focus', (e) => focusHandler(e, 'focus-capture'), true);
        document.addEventListener('click', (e) => {
            if (this.popup && this.popup.contains(e.target)) return;
            const targetField = this.resolveEventInputTarget(e);
            if (this.isEditableField(targetField)) {
                this.handlePotentialFieldFocus(targetField, 'click');
                return;
            }
            if (this.popup.style.display === 'block' && !this.popup.contains(e.target)) {
                this.maybeHidePopup('click-outside');
            }
        }, true);
        document.addEventListener('focusout', (e) => {
            if (this.popup.style.display !== 'block') return;
            if (this.isPopupInteractionLocked()) return;
            if (this.popup.contains(e.relatedTarget)) return;
            setTimeout(() => {
                if (this.isPopupInteractionLocked()) return;
                if (document.activeElement && this.isEditableField(document.activeElement)) return;
                this.maybeHidePopup('blur');
            }, 80);
        }, true);
    },


    maybeHidePopup(reason) {
        const elapsed = Date.now() - this.popupShownAt;
        if (elapsed < this.popupHideCooldownMs && reason !== 'selection' && reason !== 'autofill-complete') return;
        this.debugLog('hide popup', { reason });
        this.popupRequestSeq += 1;
        this.popup.style.display = 'none';
    },


    lockPopupInteraction(ms = 400) {
        const until = Date.now() + Math.max(0, ms);
        this.popupInteractionUntil = Math.max(this.popupInteractionUntil, until);
    },


    isPopupInteractionLocked() {
        return Date.now() < this.popupInteractionUntil;
    },


    shouldAcceptPopupResponse(requestId, field) {
        if (requestId !== this.popupRequestSeq) return false;
        if (this.isPopupInteractionLocked()) return false;
        // Re-resolve the field before using async password results because
        // React/Vue pages often replace the original DOM node after focus.
        const stableField = this.stabilizeElement(field, this.currentContext) || field;
        if (!stableField || !this.isEditableField(stableField)) return false;
        if (this.currentField && this.currentField !== stableField) return false;
        return true;
    },


    resolveEventInputTarget(event) {
        if (!event) return null;
        if (this.popup && this.popup.contains(event.target)) return null;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        // Walk the composed path so wrapped controls and shadow-root inputs
        // still resolve to the real editable element.
        for (const node of path) {
            const candidate = this.resolveEditableCandidate(node);
            if (candidate) return candidate;

            if (node && node.shadowRoot) {
                const shadowActive = this.resolveEditableCandidate(node.shadowRoot.activeElement);
                if (shadowActive) return shadowActive;
                const shadowCandidate = this.findEditableInRoot(node.shadowRoot);
                if (shadowCandidate) return shadowCandidate;
            }
        }
        const target = this.resolveEditableCandidate(event.target);
        if (target) return target;
        return this.resolveEditableCandidate(document.activeElement);
    },


    resolveEditableCandidate(node) {
        if (!node) return null;
        if (this.isEditableField(node)) return node;
        if (typeof node.closest === 'function') {
            const closest = node.closest('input, textarea, [contenteditable="true"], [role="textbox"]');
            if (this.isEditableField(closest)) return closest;
        }
        return null;
    },


    findEditableInRoot(root) {
        if (!root || typeof root.querySelector !== 'function') return null;
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"], [role="textbox"]';
        const active = root.activeElement;
        if (this.isEditableField(active)) return active;
        const candidate = root.querySelector(selector);
        return this.isEditableField(candidate) ? candidate : null;
    },


    handlePotentialFieldFocus(field, source = 'focusin') {
        const context = this.getLoginContext(field);
        const classification = this.classifyField(field, context, true);
        this.currentField = field;
        this.currentContext = context;

        this.updateContextMeta(context, field, classification);
        const meta = this.getContextMeta(context);

        if (classification.kind === 'password' || (classification.kind === 'username' && this.hasLoginSignals(context))) {
            meta.confidence = Math.max(meta.confidence, 65);
        }

        this.setState(meta.confidence >= this.contextLockThreshold ? 'CONTEXT_LOCKED' : 'FIELD_FOCUSED');

        if (this.shouldShowPopup(field, classification, meta)) {
            this.schedulePopupShow(field, context, classification, source);
        } else {
            this.maybeHidePopup('policy-suppress');
        }
        this.scheduleContextRescan(context, field);
    },


    shouldShowPopup(field, classification, meta) {
        if (!field || !classification) return false;
        if (classification.kind === 'search') return false;
        if (classification.kind === 'password') return true;
        if (classification.kind === 'username' && classification.score >= 45) return true;
        if (classification.kind === 'otp' && classification.score >= 45) return true;
        if (meta && meta.confidence >= this.contextLockThreshold && classification.kind !== 'other') return true;
        if (meta && meta.confidence >= this.contextLockThreshold && classification.kind === 'other') return this.isEditableField(field);
        return false;
    },


    schedulePopupShow(field, context, classification, source) {
        const attempts = [{ kind: 'raf' }, { kind: 'timeout', delay: 150 }, { kind: 'timeout', delay: 400 }];
        attempts.forEach((attempt, index) => {
            const run = () => {
                const stableField = this.stabilizeElement(field, context) || field;
                const stableContext = this.getLoginContext(stableField) || context;
                const stableClass = this.classifyField(stableField, stableContext, true);
                this.rebuildContextCandidates(stableContext, stableField);
                this.activeContextState = this.selectBestCredentialTargets(stableContext, stableField);
                const focused = document.activeElement === stableField;
                const visible = this.isUserVisible(stableField);
                const meta = this.getContextMeta(stableContext);
                const show = (focused || visible) && this.shouldShowPopup(stableField, stableClass, meta);

                // Multiple attempts cover frameworks that mount, animate, or
                // replace the login field shortly after the initial focus event.
                this.debugLog('popup-attempt', {
                    source,
                    slot: attempt.kind === 'raf' ? `raf-${index}` : `t${attempt.delay}`,
                    kind: stableClass.kind,
                    score: stableClass.score,
                    focused,
                    visible,
                    contextConfidence: meta.confidence,
                    signals: stableClass.signals
                });

                if (show) this.showAutofillOptions(stableField);
            };
            if (attempt.kind === 'raf') requestAnimationFrame(run);
            else setTimeout(run, attempt.delay);
        });
    },

    scheduleContextRescan(context, focusedField) {
        if (!context) return;
        setTimeout(() => {
            const stable = this.stabilizeElement(focusedField, context);
            if (stable && this.isEditableField(stable)) this.currentField = stable;
            this.rebuildContextCandidates(context, this.currentField || focusedField);
            this.activeContextState = this.selectBestCredentialTargets(context, this.currentField || focusedField);
        }, 200);
    },


    observeDynamicDom() {
        if (!document.body) return;
        this.globalObserver = new MutationObserver((mutations) => {
            this.pendingMutations.push(...mutations);
            if (this.mutationFlushTimer) return;
            // Batch mutations so the extension reacts to complex SPA updates
            // once per burst instead of rescanning on every single node change.
            this.mutationFlushTimer = setTimeout(() => {
                const batch = this.pendingMutations;
                this.pendingMutations = [];
                this.mutationFlushTimer = null;
                this.processMutationBatch(batch);
            }, 120);
        });

        this.globalObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['type', 'name', 'id', 'class', 'placeholder', 'autocomplete', 'aria-label', 'aria-labelledby', 'role', 'contenteditable']
        });
    },


    processMutationBatch(mutations) {
        if (!Array.isArray(mutations) || !mutations.length) return;
        let touchedActiveContext = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    touchedActiveContext = touchedActiveContext || this.isMutationNearContext(mutation, this.currentContext);
                    for (const node of mutation.addedNodes) {
                        if (!(node instanceof Element)) continue;
                        const fields = this.collectEditableFields(node);
                        for (const field of fields) {
                            const ctx = this.getLoginContext(field);
                            const cls = this.classifyField(field, ctx, true);
                            this.updateContextMeta(ctx, field, cls);
                        }
                    }
                }
            } else if (mutation.type === 'attributes') {
                const target = mutation.target;
                if (!this.isEditableField(target)) continue;
                this.invalidateClassification(target);
                const ctx = this.getLoginContext(target);
                const cls = this.classifyField(target, ctx, true);
                this.updateContextMeta(ctx, target, cls);
                touchedActiveContext = touchedActiveContext || (ctx && ctx === this.currentContext);
            }
        }

        if (touchedActiveContext && this.currentContext) {
            this.rebuildContextCandidates(this.currentContext, this.currentField);
            this.activeContextState = this.selectBestCredentialTargets(this.currentContext, this.currentField);
            if (this.currentField && this.isEditableField(this.currentField)) {
                const cls = this.classifyField(this.currentField, this.currentContext, true);
                if (this.shouldShowPopup(this.currentField, cls, this.getContextMeta(this.currentContext))) {
                    this.schedulePopupShow(this.currentField, this.currentContext, cls, 'mutation');
                }
            }
        }
    },


    isMutationNearContext(mutation, context) {
        if (!context) return false;
        const target = mutation.target;
        return context === target || (target instanceof Element && context.contains(target));
    },


    hookRouteChanges() {
        const self = this;
        const wrap = (fnName) => {
            const original = history[fnName];
            history[fnName] = function() {
                const ret = original.apply(this, arguments);
                self.onRouteChange();
                return ret;
            };
        };
        // SPAs often change login screens without a full reload, so route
        // changes reset cached field/context assumptions.
        wrap('pushState');
        wrap('replaceState');
        window.addEventListener('popstate', () => this.onRouteChange());
    },


    onRouteChange() {
        this.debugLog('route-change', { url: location.href });
        this.setState('IDLE');
        this.currentField = null;
        this.currentContext = null;
        this.activeContextState = null;
        this.classificationCache = new WeakMap();
        this.contextMeta = new WeakMap();
    },


    invalidateClassification(el) {
        if (el && this.classificationCache.has(el)) this.classificationCache.delete(el);
    },

});
