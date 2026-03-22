(function(globalScope) {
    const popupShared = globalScope.OnPassPopup || (globalScope.OnPassPopup = {});

    function getElements() {
        return {
            loginContainer: document.querySelector('.login-container'),
            passwordsContainer: document.querySelector('.passwords-container'),
            accessKeyInput: document.getElementById('accessKeyInput'),
            connectBtn: document.getElementById('connectBtn'),
            searchInput: document.getElementById('searchInput'),
            passwordList: document.getElementById('passwordList'),
            errorMessageElements: document.querySelectorAll('.error-message'),
            copiedPopup: document.getElementById('copiedPopup')
        };
    }

    function showLoginContainer(elements) {
        elements.loginContainer.style.display = 'block';
        elements.passwordsContainer.style.display = 'none';
    }

    function showPasswordsContainer(elements) {
        elements.loginContainer.style.display = 'none';
        elements.passwordsContainer.style.display = 'block';
    }

    function showCopiedPopup(elements) {
        elements.copiedPopup.classList.add('show');
        setTimeout(() => {
            elements.copiedPopup.classList.remove('show');
        }, 1500);
    }

    function displayError(elements, message) {
        elements.errorMessageElements.forEach((el) => {
            el.textContent = message;
        });
    }

    function clearError(elements) {
        elements.errorMessageElements.forEach((el) => {
            el.textContent = '';
        });
    }

    function showLoading(elements) {
        elements.passwordList.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading passwords...</p>
            </div>
        `;
    }

    function clearPasswordList(elements) {
        elements.passwordList.innerHTML = '';
    }

    function renderPasswords(elements, passwords, handlers) {
        clearPasswordList(elements);

        if (passwords.length === 0) {
            const noPasswordsMsg = document.createElement('div');
            noPasswordsMsg.classList.add('no-passwords');
            noPasswordsMsg.textContent = 'No passwords found';
            elements.passwordList.appendChild(noPasswordsMsg);
            return;
        }

        passwords.forEach((password) => {
            const passwordItem = document.createElement('div');
            passwordItem.classList.add('password-item');

            const passwordDetails = document.createElement('div');
            passwordDetails.classList.add('password-item-details');

            const title = document.createElement('h3');
            title.textContent = password.Name || password.Website || 'Unnamed Entry';

            const websitePara = document.createElement('p');
            const websiteLabel = document.createElement('strong');
            websiteLabel.textContent = 'Website:';
            websitePara.appendChild(websiteLabel);
            websitePara.appendChild(document.createTextNode(` ${password.Website || 'No Website'}`));

            const usernamePara = document.createElement('p');
            const usernameLabel = document.createElement('strong');
            usernameLabel.textContent = 'Username:';
            usernamePara.appendChild(usernameLabel);
            usernamePara.appendChild(document.createTextNode(` ${password.Username || 'No Username'}`));

            const actionButtons = document.createElement('div');
            actionButtons.classList.add('action-buttons');

            const copyUsernameBtn = document.createElement('button');
            copyUsernameBtn.classList.add('copy-btn');
            copyUsernameBtn.textContent = 'Copy Username';
            copyUsernameBtn.addEventListener('click', () => handlers.onCopyUsername(password));

            const copyPasswordBtn = document.createElement('button');
            copyPasswordBtn.classList.add('copy-btn');
            copyPasswordBtn.textContent = 'Copy Password';
            copyPasswordBtn.addEventListener('click', () => handlers.onCopyPassword(password));

            passwordDetails.appendChild(title);
            passwordDetails.appendChild(websitePara);
            passwordDetails.appendChild(usernamePara);

            actionButtons.appendChild(copyUsernameBtn);
            actionButtons.appendChild(copyPasswordBtn);

            passwordItem.appendChild(passwordDetails);
            passwordItem.appendChild(actionButtons);

            elements.passwordList.appendChild(passwordItem);
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    popupShared.view = {
        getElements,
        showLoginContainer,
        showPasswordsContainer,
        showCopiedPopup,
        displayError,
        clearError,
        showLoading,
        clearPasswordList,
        renderPasswords,
        debounce
    };
})(window);
