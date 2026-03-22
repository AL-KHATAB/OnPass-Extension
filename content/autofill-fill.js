if (typeof OnPassAutofill === 'undefined') {
    throw new Error('OnPassAutofill core must load first (fill).');
}

Object.assign(OnPassAutofill.prototype, {
    showAutofillOptions(field) {
        if (!field || !this.isEditableField(field) || !this.isUserVisible(field)) {
            this.maybeHidePopup('invalid-field');
            return;
        }
        if (this.isPopupInteractionLocked()) return;
        const requestId = ++this.popupRequestSeq;

        chrome.runtime.sendMessage({ type: 'GET_SAVED_PASSWORDS', url: window.location.href }, (response) => {
            if (!this.shouldAcceptPopupResponse(requestId, field)) return;
            if (chrome.runtime.lastError) {
                this.maybeHidePopup('runtime-error');
                return;
            }
            if (response && response.passwords && response.passwords.length) {
                const ranked = this.rankByDomainMatch(response.passwords, window.location.href);
                const matchesToRender = ranked.some((item) => item.score > 0)
                    ? ranked.filter((item) => item.score > 0).map((item) => item.password)
                    : ranked.map((item) => item.password);
                if (matchesToRender.length) this.renderPopup(matchesToRender, field, requestId);
                else this.maybeHidePopup('no-domain-matches');
            } else {
                // If the background domain filter yields nothing, request the
                // full list and rank locally so the popup can still recover.
                chrome.runtime.sendMessage({ type: 'GET_SAVED_PASSWORDS' }, (fullResponse) => {
                    if (!this.shouldAcceptPopupResponse(requestId, field)) return;
                    if (chrome.runtime.lastError) {
                        this.maybeHidePopup('runtime-error-2');
                        return;
                    }
                    if (fullResponse && fullResponse.passwords) {
                        const rankedFallback = this.rankByDomainMatch(fullResponse.passwords, window.location.href);
                        const matches = rankedFallback.some((item) => item.score > 0)
                            ? rankedFallback.filter((item) => item.score > 0).map((item) => item.password)
                            : rankedFallback.map((item) => item.password);
                        if (matches.length) this.renderPopup(matches, field, requestId);
                        else this.maybeHidePopup('no-passwords');
                    } else {
                        this.maybeHidePopup('no-passwords-response');
                    }
                });
            }
        });
    },

    renderPopup(passwords, field, requestId = this.popupRequestSeq) {
        if (requestId !== this.popupRequestSeq) return;
        if (this.isPopupInteractionLocked()) return;
        this.popup.innerHTML = '';
        const rect = field.getBoundingClientRect();
        this.popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
        this.popup.style.left = `${rect.left + window.scrollX}px`;
        this.popup.style.minWidth = `${Math.max(rect.width, 220)}px`;

        if (passwords.length > 1) {
            const header = document.createElement('div');
            header.style.padding = '10px';
            header.style.borderBottom = '1px solid #eee';
            header.style.fontSize = '12px';
            header.style.color = '#666';
            header.style.textAlign = 'center';
            header.textContent = 'Select credentials to autofill';
            this.popup.appendChild(header);
        }

        passwords.forEach((password) => {
            const item = document.createElement('div');
            item.className = 'onpass-popup-item';
            const siteName = password.Name || this.extractDomainFromUrl(password.Website) || 'Unnamed Entry';
            const firstLetter = siteName.charAt(0).toUpperCase();

            const icon = document.createElement('div');
            icon.className = 'onpass-popup-item-icon';
            icon.textContent = firstLetter;

            const details = document.createElement('div');
            details.className = 'onpass-popup-item-details';

            const title = document.createElement('strong');
            title.textContent = siteName;

            const username = document.createElement('small');
            username.textContent = password.Username || 'No username';

            details.appendChild(title);
            details.appendChild(username);
            item.appendChild(icon);
            item.appendChild(details);
            let selectionHandled = false;
            const handleSelection = (e) => {
                if (selectionHandled) return;
                selectionHandled = true;
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                e.stopPropagation();
                // Handle pointerdown/mousedown before blur hides the popup on
                // sites that move focus as soon as the user clicks a choice.
                this.lockPopupInteraction(800);
                this.autofill(password);
                this.maybeHidePopup('selection');
                setTimeout(() => {
                    selectionHandled = false;
                }, 500);
            };
            item.addEventListener('pointerdown', handleSelection);
            item.addEventListener('mousedown', handleSelection);
            item.addEventListener('click', handleSelection);
            this.popup.appendChild(item);
        });

        this.popup.style.display = 'block';
        this.popupShownAt = Date.now();
        this.adjustPopupPosition(this.popup, field);
    },


    adjustPopupPosition(popup, field) {
        const popupRect = popup.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let newLeft = fieldRect.left + window.scrollX;
        let newTop = fieldRect.bottom + window.scrollY + 5;
        if (newLeft + popupRect.width > viewportWidth - 10) newLeft = viewportWidth - popupRect.width - 10;
        if (newLeft < 10) newLeft = 10;
        if (newTop + popupRect.height > viewportHeight - 10) newTop = fieldRect.top + window.scrollY - popupRect.height - 5;
        if (newTop < 10) newTop = 10;
        popup.style.left = `${newLeft}px`;
        popup.style.top = `${newTop}px`;
    },


    autofill(credentials) {
        const context = this.currentContext || (this.currentField ? this.getLoginContext(this.currentField) : null);
        const targets = this.resolveLatestCredentialTargets(context, this.currentField);
        let usernameFilled = false;
        let passwordFilled = false;

        if (targets) {
            if (targets.usernameField && credentials.Username != null) {
                this.setValueAndTriggerEvents(targets.usernameField, credentials.Username);
                usernameFilled = true;
            }
            if (targets.passwordField && credentials.Password != null) {
                this.setValueAndTriggerEvents(targets.passwordField, credentials.Password);
                targets.passwordField.focus();
                passwordFilled = true;
            }
        }

        if (!passwordFilled && credentials.Password != null) {
            const fallbackPasswordField = this.resolveLatestPasswordField(context, this.currentField);
            if (fallbackPasswordField) {
                this.setValueAndTriggerEvents(fallbackPasswordField, credentials.Password);
                fallbackPasswordField.focus();
                passwordFilled = true;
            } else {
                this.fillPasswordWithRetries(credentials.Password, context, this.currentField);
            }
        }

        if (!usernameFilled && !passwordFilled && this.currentField) {
            const cls = this.classifyField(this.currentField, context, true);
            if (cls.kind === 'password') this.setValueAndTriggerEvents(this.currentField, credentials.Password || '');
            else if (cls.kind === 'username') this.setValueAndTriggerEvents(this.currentField, credentials.Username || '');
        }

        this.maybeHidePopup('autofill-complete');
    },


    resolveLatestCredentialTargets(context, focusedField) {
        const stabilizedFocus = this.stabilizeElement(focusedField, context) || focusedField;
        const latestContext = (stabilizedFocus && this.getLoginContext(stabilizedFocus)) || context || this.currentContext;
        if (!latestContext) return null;

        this.rebuildContextCandidates(latestContext, stabilizedFocus || focusedField);
        return this.selectBestCredentialTargets(latestContext, stabilizedFocus || focusedField);
    },


    resolveLatestPasswordField(context, focusedField) {
        const candidates = [];
        const contextsToTry = [];
        if (context) contextsToTry.push(context);
        if (focusedField) {
            const focusedContext = this.getLoginContext(focusedField);
            if (focusedContext && !contextsToTry.includes(focusedContext)) contextsToTry.push(focusedContext);
        }
        if (this.currentContext && !contextsToTry.includes(this.currentContext)) contextsToTry.push(this.currentContext);

        contextsToTry.forEach((ctx) => {
            const contextFields = this.collectEditableFields(ctx).filter((field) => this.classifyField(field, ctx, true).kind === 'password');
            candidates.push(...contextFields);
        });

        if (!candidates.length && document.body) {
            const pageFields = this.collectEditableFields(document.body).filter((field) => this.classifyField(field, this.getLoginContext(field), true).kind === 'password');
            candidates.push(...pageFields);
        }

        const unique = candidates.filter((field, index, arr) => arr.indexOf(field) === index);
        if (!unique.length) return null;

        const reference = focusedField || this.currentField;
        if (!reference) return unique[0];

        const referenceContext = this.getLoginContext(reference) || context || document.body;
        const referenceIndex = this.getFieldOrderIndex(referenceContext, reference);

        unique.sort((a, b) => {
            const aAutocomplete = (a.getAttribute('autocomplete') || '').toLowerCase();
            const bAutocomplete = (b.getAttribute('autocomplete') || '').toLowerCase();
            const aBoost = (aAutocomplete.includes('current-password') ? 50 : 0) + (aAutocomplete.includes('password') ? 20 : 0);
            const bBoost = (bAutocomplete.includes('current-password') ? 50 : 0) + (bAutocomplete.includes('password') ? 20 : 0);
            if (bBoost !== aBoost) return bBoost - aBoost;

            const aIndex = this.getFieldOrderIndex(referenceContext, a);
            const bIndex = this.getFieldOrderIndex(referenceContext, b);
            if (referenceIndex !== -1 && aIndex !== -1 && bIndex !== -1) {
                return Math.abs(referenceIndex - aIndex) - Math.abs(referenceIndex - bIndex);
            }
            return 0;
        });

        return unique[0];
    },


    fillPasswordWithRetries(password, context, referenceField) {
        if (password == null || password === '') return;
        let filled = false;
        const delays = [120, 300, 600];

        // Multi-step logins often mount the password field after the username
        // step submits, so retry briefly instead of giving up immediately.
        delays.forEach((delay) => {
            setTimeout(() => {
                if (filled) return;
                const latestTargets = this.resolveLatestCredentialTargets(context, this.currentField || referenceField);
                const passwordField = (latestTargets && latestTargets.passwordField) ||
                    this.resolveLatestPasswordField(context, this.currentField || referenceField);
                if (!passwordField) return;

                this.setValueAndTriggerEvents(passwordField, password);
                passwordField.focus();
                filled = true;
                this.debugLog('password retry fill success', { delay });
            }, delay);
        });
    },


    setValueAndTriggerEvents(field, value) {
        if (!field || !this.isEditableField(field)) return;
        const nextValue = value == null ? '' : String(value);
        const tag = field.tagName ? field.tagName.toLowerCase() : '';

        // Use native setters so React/Vue controlled inputs detect the value
        // change instead of ignoring a plain property assignment.
        if (tag === 'input') {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(field, nextValue);
            else field.value = nextValue;
        } else if (tag === 'textarea') {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(field, nextValue);
            else field.value = nextValue;
        } else if (field.isContentEditable || (field.getAttribute && field.getAttribute('contenteditable') === 'true')) {
            field.textContent = nextValue;
        }

        field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter' }));
    },


    rankByDomainMatch(passwords, currentUrl) {
        if (!Array.isArray(passwords) || !passwords.length) return [];
        const currentDomain = this.extractDomainFromUrl(currentUrl);
        const normalizedCurrentUrl = this.normalizeUrl(currentUrl);
        return passwords.map((password, index) => {
            const savedDomain = this.extractDomainFromUrl(password.Website || '');
            const normalizedSavedUrl = this.normalizeUrl(password.Website || '');
            const score = this.getDomainMatchScore(currentDomain, savedDomain, normalizedCurrentUrl, normalizedSavedUrl);
            return { password, score, index };
        }).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.index - b.index;
        });
    },


    getDomainMatchScore(currentDomain, savedDomain, normalizedCurrentUrl = '', normalizedSavedUrl = '') {
        if (!currentDomain || !savedDomain) return 0;
        if (currentDomain === savedDomain) return 100;
        if (currentDomain.endsWith('.' + savedDomain)) return 90;
        if (savedDomain.endsWith('.' + currentDomain)) return 80;
        const currentBase = this.getRegistrableDomain(currentDomain);
        const savedBase = this.getRegistrableDomain(savedDomain);
        if (currentBase && savedBase && currentBase === savedBase) return 70;
        if (normalizedCurrentUrl && normalizedSavedUrl) {
            if (normalizedCurrentUrl === normalizedSavedUrl) return 65;
            if (normalizedCurrentUrl.startsWith(normalizedSavedUrl + '/') || normalizedSavedUrl.startsWith(normalizedCurrentUrl + '/')) return 55;
        }
        return 0;
    },

    getRegistrableDomain(domain) {
        if (!domain) return '';
        const clean = domain.toLowerCase().replace(/\.+$/, '');
        if (clean === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return clean;
        const parts = clean.split('.').filter(Boolean);
        if (parts.length < 2) return clean;
        const multi = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz', 'co.jp', 'ne.jp', 'or.jp', 'com.br', 'net.br', 'com.mx']);
        const tail2 = parts.slice(-2).join('.');
        if (multi.has(tail2) && parts.length >= 3) return parts.slice(-3).join('.');
        return tail2;
    },


    extractDomainFromUrl(url) {
        try {
            if (!url) return '';
            let fullUrl = url;
            if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
            const hostname = new URL(fullUrl).hostname.toLowerCase().replace(/\.+$/, '');
            return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
        } catch {
            return (url || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0].split(':')[0].replace(/\.+$/, '');
        }
    },


    normalizeUrl(url) {
        try {
            if (!url) return '';
            let fullUrl = url;
            if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
            const obj = new URL(fullUrl);
            let domain = obj.hostname.toLowerCase();
            if (domain.startsWith('www.')) domain = domain.slice(4);
            let path = obj.pathname.toLowerCase();
            if (path === '/' || path === '') path = '';
            else if (path.endsWith('/')) path = path.slice(0, -1);
            return domain + path;
        } catch {
            return (url || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('?')[0].split('#')[0].replace(/\/$/, '');
        }
    },
});
