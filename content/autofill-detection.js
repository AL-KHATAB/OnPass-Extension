// Classifies editable fields, builds login context confidence, and keeps track
// of the best username/password targets as modern pages re-render around them.
if (typeof OnPassAutofill === 'undefined') {
    throw new Error('OnPassAutofill core must load first (detection).');
}

Object.assign(OnPassAutofill.prototype, {
    // Filters down to inputs the engine can meaningfully inspect and autofill.
    isEditableField(element) {
        if (!element || typeof element.tagName !== 'string') return false;
        if (element.disabled || element.readOnly) return false;
        const tag = element.tagName.toLowerCase();
        if (tag === 'input') {
            const t = (element.type || 'text').toLowerCase();
            return !['hidden', 'submit', 'button', 'reset', 'file', 'image'].includes(t);
        }
        if (tag === 'textarea') return true;
        const role = (element.getAttribute('role') || '').toLowerCase();
        const ce = (element.getAttribute('contenteditable') || '').toLowerCase();
        return ce === 'true' || role === 'textbox';
    },


    isUserVisible(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') return false;
        // Focus wins over transient layout states because animated logins can
        // briefly report zero size while the user is actively typing into them.
        if (document.activeElement === element) return true;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            if (style.position === 'fixed' || style.position === 'absolute') {
                return rect.bottom >= -40 && rect.top <= window.innerHeight + 40;
            }
            return false;
        }
        return true;
    },


    isSearchLike(el, textBlob) {
        const type = (el.type || '').toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        if (type === 'search' || role === 'searchbox' || role === 'search' || ac.includes('search')) return true;
        return this.searchKeywords.some((k) => textBlob.includes(k));
    },


    getLabelText(el) {
        const chunks = [];
        const direct = el.closest('label');
        if (direct && direct.textContent) chunks.push(direct.textContent);
        if (el.id) {
            const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : el.id;
            const linked = document.querySelector(`label[for="${safeId}"]`);
            if (linked && linked.textContent) chunks.push(linked.textContent);
        }
        const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
        if (labelledBy) {
            labelledBy.split(/\s+/).forEach((idRef) => {
                const node = document.getElementById(idRef);
                if (node && node.textContent) chunks.push(node.textContent);
            });
        }
        return chunks.join(' ').toLowerCase();
    },


    getNearbyText(el, context) {
        const ctx = context || this.getLoginContext(el) || el.parentElement;
        if (!ctx) return '';
        const txt = (ctx.textContent || '').toLowerCase();
        return txt.slice(0, 600);
    },

    getFieldOrderIndex(context, field) {
        const fields = this.collectEditableFields(context);
        return fields.indexOf(field);
    },


    // Combines strong signals, nearby text, and page context to decide what kind of field the user is on.
    classifyField(el, context = null, useCache = true) {
        if (!this.isEditableField(el)) return { kind: 'other', score: 0, signals: [] };
        if (useCache && this.classificationCache.has(el)) return this.classificationCache.get(el);

        const ctx = context || this.getLoginContext(el);
        const signals = [];
        let username = 0;
        let password = 0;
        let otp = 0;

        const type = (el.type || '').toLowerCase();
        const inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
        const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
        const attrs = [el.name || '', el.id || '', el.placeholder || '', el.getAttribute('aria-label') || '', el.className || ''].join(' ').toLowerCase();
        const labelText = this.getLabelText(el);
        const nearby = this.getNearbyText(el, ctx);
        const blob = `${attrs} ${labelText}`;

        // Strong signals first: these can dominate classification immediately.
        if (type === 'password') { password += 200; signals.push('type=password'); }
        if (autocomplete.includes('current-password')) { password += 120; signals.push('autocomplete=current-password'); }
        if (autocomplete.includes('new-password')) { password += 90; signals.push('autocomplete=new-password'); }
        if (autocomplete.includes('username')) { username += 95; signals.push('autocomplete=username'); }
        if (autocomplete.includes('email')) { username += 90; signals.push('autocomplete=email'); }
        if (autocomplete.includes('one-time-code')) { otp += 120; signals.push('autocomplete=one-time-code'); }

        if (this.isSearchLike(el, blob)) {
            const result = { kind: 'search', score: 100, signals: ['search-signals'] };
            if (useCache) this.classificationCache.set(el, result);
            return result;
        }

        // Medium and contextual signals improve reliability on custom component trees.
        const usernameTerms = ['user', 'username', 'email', 'login', 'signin', 'account', 'identifier'];
        const passwordTerms = ['password', 'passcode', 'passwd', 'pwd'];
        const otpTerms = ['otp', 'code', 'verification', '2fa', 'one time'];
        if (usernameTerms.some((t) => blob.includes(t))) { username += 42; signals.push('keyword=username'); }
        if (passwordTerms.some((t) => blob.includes(t))) { password += 45; signals.push('keyword=password'); }
        if (otpTerms.some((t) => blob.includes(t))) { otp += 46; signals.push('keyword=otp'); }
        if (type === 'email' || inputMode === 'email') { username += 25; signals.push('email-mode'); }

        if (labelText) {
            if (usernameTerms.some((t) => labelText.includes(t))) { username += 18; signals.push('label=username'); }
            if (passwordTerms.some((t) => labelText.includes(t))) { password += 20; signals.push('label=password'); }
            if (otpTerms.some((t) => labelText.includes(t))) { otp += 20; signals.push('label=otp'); }
        }
        if (nearby) {
            if (usernameTerms.some((t) => nearby.includes(t))) { username += 10; signals.push('nearby=username'); }
            if (passwordTerms.some((t) => nearby.includes(t))) { password += 12; signals.push('nearby=password'); }
            if (otpTerms.some((t) => nearby.includes(t))) { otp += 12; signals.push('nearby=otp'); }
        }

        const ctxMeta = this.getContextMeta(ctx);
        if (ctx && this.hasLoginSignals(ctx)) {
            username += 12;
            password += 12;
            otp += 8;
            signals.push('context=auth-signals');
        }

        // Pairing bias: username fields usually appear before password fields.
        if (ctxMeta.passwordCandidates.size > 0 && type !== 'password') {
            const nearestPassword = this.findNearestField(el, [...ctxMeta.passwordCandidates], ctx);
            if (nearestPassword) {
                const elIndex = this.getFieldOrderIndex(ctx, el);
                const pwIndex = this.getFieldOrderIndex(ctx, nearestPassword);
                if (elIndex !== -1 && pwIndex !== -1 && elIndex < pwIndex) {
                    username += 16;
                    signals.push('order-before-password');
                }
            }
        }

        let kind = 'other';
        let score = Math.max(username, password, otp, 0);
        if (type === 'password' || password >= 60) {
            kind = 'password';
            score = Math.max(password, 60);
        } else if (otp >= 45) {
            kind = 'otp';
            score = otp;
        } else if (username >= 45) {
            kind = 'username';
            score = username;
        }

        const result = { kind, score, signals };
        if (useCache) this.classificationCache.set(el, result);
        return result;
    },


    hasLoginSignals(ctx) {
        if (!ctx) return false;
        const blob = [ctx.id || '', ctx.className || '', ctx.getAttribute ? (ctx.getAttribute('aria-label') || '') : '', ctx.textContent ? ctx.textContent.slice(0, 500) : '']
            .join(' ')
            .toLowerCase();
        let hits = 0;
        for (const token of this.loginKeywords) {
            if (blob.includes(token)) hits += 1;
        }
        return hits >= 2;
    },


    // Finds the most likely login container when a site does not use a traditional form element.
    getLoginContext(el) {
        if (!el) return null;
        if (el.form) return el.form;

        // Prefer explicit auth containers, then fall back to the nearest
        // reasonable structural wrapper when sites avoid real forms.
        const authSelectors = [
            '[data-login]', '[data-auth]', '[id*="login" i]', '[id*="signin" i]', '[id*="auth" i]',
            '[class*="login" i]', '[class*="signin" i]', '[class*="auth" i]',
            '[role="dialog"][aria-label*="sign in" i]', '[role="dialog"][aria-label*="login" i]'
        ];
        const authContainer = el.closest(authSelectors.join(','));
        if (authContainer) return authContainer;

        let current = el;
        let depth = 0;
        while (current && depth < 6) {
            if (current.matches && current.matches('section, main, article, div, fieldset')) return current;
            current = current.parentElement;
            depth += 1;
        }
        return el.parentElement || document.body;
    },


    isLoginContext(ctx) {
        if (!ctx) return false;
        const fields = this.collectEditableFields(ctx);
        const hasPassword = fields.some((f) => this.classifyField(f, ctx, true).kind === 'password');
        const hasUsername = fields.some((f) => this.classifyField(f, ctx, true).kind === 'username');
        const hasSubmit = this.findSubmitButtons(ctx).length > 0;
        const hasSignals = this.hasLoginSignals(ctx);
        return hasPassword || (hasUsername && hasSubmit) || hasSignals;
    },


    getContextMeta(ctx) {
        if (!ctx) {
            return { confidence: 0, lastSeen: Date.now(), usernameCandidates: new Set(), passwordCandidates: new Set(), otpCandidates: new Set() };
        }
        if (!this.contextMeta.has(ctx)) {
            this.contextMeta.set(ctx, { confidence: 0, lastSeen: Date.now(), usernameCandidates: new Set(), passwordCandidates: new Set(), otpCandidates: new Set() });
        }
        return this.contextMeta.get(ctx);
    },


    // Scores how likely a container is to be a real authentication surface.
    scoreLoginContext(ctx) {
        if (!ctx) return 0;
        const fields = this.collectEditableFields(ctx);
        const passwordCount = fields.filter((f) => this.classifyField(f, ctx, true).kind === 'password').length;
        const usernameCount = fields.filter((f) => this.classifyField(f, ctx, true).kind === 'username').length;
        const submitButtons = this.findSubmitButtons(ctx).length;
        let score = 0;
        if (passwordCount > 0) score += 45;
        if (usernameCount > 0) score += 25;
        if (submitButtons > 0) score += 20;
        if (this.hasLoginSignals(ctx)) score += 20;
        if (this.isLoginContext(ctx)) score += 10;
        return Math.min(100, score);
    },


    updateContextMeta(ctx, field, classification = null) {
        if (!ctx || !field) return;
        const meta = this.getContextMeta(ctx);
        const cls = classification || this.classifyField(field, ctx, true);
        meta.lastSeen = Date.now();
        meta.confidence = Math.max(meta.confidence, this.scoreLoginContext(ctx));
        if (cls.kind === 'username') meta.usernameCandidates.add(field);
        if (cls.kind === 'password') meta.passwordCandidates.add(field);
        if (cls.kind === 'otp') meta.otpCandidates.add(field);
    },

    // Walks the context tree, including shadow roots, to build the candidate field set for pairing logic.
    collectEditableFields(root) {
        const out = [];
        const visit = (node, depth = 0) => {
            if (!node || depth > 6) return;
            if (node instanceof Element && this.isEditableField(node)) out.push(node);

            const children = (node && node.children) ? Array.from(node.children) : [];
            for (const child of children) visit(child, depth + 1);

            if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot, depth + 1);
        };
        visit(root, 0);
        // Keep hidden placeholders out of the candidate graph unless they are
        // currently focused, which avoids pairing against fake framework inputs.
        return out.filter((el, idx, arr) => arr.indexOf(el) === idx).filter((el) => this.isUserVisible(el) || document.activeElement === el);
    },


    // Captures the username, password, and OTP candidates in one structure so later steps can choose the best pair.
    buildFieldGraph(context) {
        const fields = this.collectEditableFields(context);
        const nodes = fields.map((field, index) => ({ field, index, classification: this.classifyField(field, context, true) }));
        return {
            context,
            nodes,
            usernameCandidates: nodes.filter((n) => n.classification.kind === 'username'),
            passwordCandidates: nodes.filter((n) => n.classification.kind === 'password'),
            otpCandidates: nodes.filter((n) => n.classification.kind === 'otp')
        };
    },


    // Chooses the most plausible username/password targets for autofill within the active login context.
    selectBestCredentialTargets(context, focusedField) {
        const graph = this.buildFieldGraph(context);
        if (!graph.nodes.length) return null;

        const focusedNode = graph.nodes.find((n) => n.field === focusedField);
        let passwordTarget = null;
        let usernameTarget = null;

        if (focusedNode && focusedNode.classification.kind === 'password') {
            passwordTarget = focusedNode;
        } else if (graph.passwordCandidates.length) {
            passwordTarget = graph.passwordCandidates.slice().sort((a, b) => b.classification.score - a.classification.score)[0];
        }

        if (graph.usernameCandidates.length) {
            // Prefer username candidates that are nearest before the chosen password.
            if (passwordTarget) {
                const before = graph.usernameCandidates
                    .filter((n) => n.index <= passwordTarget.index)
                    .sort((a, b) => {
                        const distA = Math.abs(passwordTarget.index - a.index);
                        const distB = Math.abs(passwordTarget.index - b.index);
                        if (distA !== distB) return distA - distB;
                        return b.classification.score - a.classification.score;
                    });
                usernameTarget = before[0] || null;
            }
            if (!usernameTarget && focusedNode && focusedNode.classification.kind === 'username') usernameTarget = focusedNode;
            if (!usernameTarget) usernameTarget = graph.usernameCandidates.slice().sort((a, b) => b.classification.score - a.classification.score)[0];
        }

        return {
            context,
            usernameField: usernameTarget ? usernameTarget.field : null,
            passwordField: passwordTarget ? passwordTarget.field : null,
            focusedField,
            confidence: this.getContextMeta(context).confidence
        };
    },


    rebuildContextCandidates(context, focusedField) {
        if (!context) return;
        const meta = this.getContextMeta(context);
        meta.usernameCandidates.clear();
        meta.passwordCandidates.clear();
        meta.otpCandidates.clear();

        const graph = this.buildFieldGraph(context);
        graph.usernameCandidates.forEach((n) => meta.usernameCandidates.add(n.field));
        graph.passwordCandidates.forEach((n) => meta.passwordCandidates.add(n.field));
        graph.otpCandidates.forEach((n) => meta.otpCandidates.add(n.field));
        meta.confidence = this.scoreLoginContext(context);
        this.activeContextState = this.selectBestCredentialTargets(context, focusedField);
    },


    findNearestField(baseField, candidates, context) {
        if (!baseField || !candidates.length) return null;
        const baseIdx = this.getFieldOrderIndex(context, baseField);
        let best = null;
        let bestDist = Infinity;
        for (const c of candidates) {
            const idx = this.getFieldOrderIndex(context, c);
            if (idx === -1 || baseIdx === -1) continue;
            const dist = Math.abs(baseIdx - idx);
            if (dist < bestDist) {
                bestDist = dist;
                best = c;
            }
        }
        return best;
    },


    // Recovers a replacement field when frameworks detach and recreate the original DOM node after focus.
    stabilizeElement(el, context) {
        if (!el) return null;
        if (el.isConnected) return el;
        const ctx = context || this.getLoginContext(el);
        if (!ctx || !ctx.querySelectorAll) return null;

        // When a framework replaces the field node, recover the best matching
        // successor inside the same context using stable attributes.
        const type = (el.type || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        const placeholder = (el.placeholder || '').toLowerCase();
        const pool = this.collectEditableFields(ctx);
        let best = null;
        let score = -1;
        for (const candidate of pool) {
            let s = 0;
            if ((candidate.type || '').toLowerCase() === type) s += 30;
            if ((candidate.name || '').toLowerCase() === name && name) s += 20;
            if ((candidate.id || '').toLowerCase() === id && id) s += 20;
            if ((candidate.getAttribute('autocomplete') || '').toLowerCase() === ac && ac) s += 15;
            if ((candidate.placeholder || '').toLowerCase() === placeholder && placeholder) s += 10;
            if (document.activeElement === candidate) s += 25;
            if (s > score) {
                score = s;
                best = candidate;
            }
        }
        return best;
    },

    // Finds likely submit actions to strengthen login-context scoring on pages without semantic forms.
    findSubmitButtons(ctx) {
        if (!ctx || !ctx.querySelectorAll) return [];
        const nodes = Array.from(ctx.querySelectorAll('button, input[type="submit"], [role="button"]'));
        const terms = ['sign in', 'log in', 'signin', 'login', 'continue', 'next', 'submit'];
        return nodes.filter((n) => {
            const text = `${n.textContent || ''} ${n.value || ''}`.toLowerCase().trim();
            return terms.some((t) => text.includes(t));
        });
    },

});
