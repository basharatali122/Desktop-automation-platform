
class AccountManager {
    constructor() {
        this.accounts = [];
        this.selectedAccounts = new Set();
    }

    async init() {
        await this.loadAccounts();
        this.renderAccounts();
        this.setupEventListeners();
        this.setupBulkModalListeners();
    }

    async loadAccounts() {
        try {
            this.accounts = await window.electronAPI.accounts.getAll();
            this.renderAccounts();
            this.updateStats();
        } catch (error) {
            this.showError('Failed to load accounts: ' + error.message);
        }
    }

    setupEventListeners() {
        // Add account form submission
        document.getElementById('addAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAccount();
        });

        // Bulk account generation
        document.getElementById('generateAccounts').addEventListener('click', () => {
            this.showBulkModal();
        });

        // Bulk actions
        document.getElementById('selectAllAccounts').addEventListener('click', () => {
            this.selectAllAccounts();
        });

        document.getElementById('deselectAllAccounts').addEventListener('click', () => {
            this.deselectAllAccounts();
        });

        document.getElementById('deleteSelectedAccounts').addEventListener('click', () => {
            this.deleteSelectedAccounts();
        });

        // Settings toggle
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.toggleSettings();
        });

        // Save settings
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });
    }

    setupBulkModalListeners() {
        // Update username preview in real-time
        const updatePreview = () => {
            const prefix = document.getElementById('bulkPrefix').value.trim() || 'user';
            const start = parseInt(document.getElementById('startRange').value) || 1;
            const end = parseInt(document.getElementById('endRange').value) || 10;
            const total = end - start + 1;
            
            document.getElementById('totalAccountsPreview').textContent = total;
            
            if (total <= 5) {
                const usernames = [];
                for (let i = start; i <= end; i++) {
                    usernames.push(`${prefix}${i}`);
                }
                document.getElementById('usernamePreview').textContent = usernames.join(', ');
            } else {
                document.getElementById('usernamePreview').textContent = 
                    `${prefix}${start}, ${prefix}${start + 1}, ..., ${prefix}${end}`;
            }
        };

        document.getElementById('bulkPrefix').addEventListener('input', updatePreview);
        document.getElementById('startRange').addEventListener('input', updatePreview);
        document.getElementById('endRange').addEventListener('input', updatePreview);

        // Initialize preview
        updatePreview();
    }

    async addAccount() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const score = parseInt(document.getElementById('score').value) || 0;

        if (!username || !password) {
            this.showError('Please enter both username and password');
            return;
        }

        // Validate username format
        if (!this.isValidUsername(username)) {
            this.showError('Invalid username format');
            return;
        }

        try {
            const account = await window.electronAPI.accounts.add({
                username,
                password,
                score
            });

            this.accounts.unshift(account);
            this.renderAccounts();
            this.clearForm();
            this.showSuccess(`Account added: ${username}`);
            
            // Emit event for other components
            this.emitAccountsUpdated();
        } catch (error) {
            this.showError('Failed to add account: ' + error.message);
        }
    }

    showBulkModal() {
        document.getElementById('bulkAccountModal').style.display = 'block';
    }

    hideBulkModal() {
        document.getElementById('bulkAccountModal').style.display = 'none';
    }

    async generateBulkAccounts() {
        const prefix = document.getElementById('bulkPrefix').value.trim() || 'user';
        const startRange = parseInt(document.getElementById('startRange').value) || 1;
        const endRange = parseInt(document.getElementById('endRange').value) || 10;
        const password = document.getElementById('bulkPassword').value.trim();
        const score = parseInt(document.getElementById('bulkScore').value) || 0;

        if (!password) {
            this.showError('Please enter a password for bulk accounts');
            return;
        }

        if (startRange > endRange) {
            this.showError('Start range cannot be greater than end range');
            return;
        }

        const totalAccounts = endRange - startRange + 1;
        if (totalAccounts > 1000) {
            this.showError('Cannot generate more than 1000 accounts at once');
            return;
        }

        this.showInfo(`🔄 Generating ${totalAccounts} accounts...`);

        const accounts = [];
        for (let i = startRange; i <= endRange; i++) {
            accounts.push({
                username: `${prefix}${i}`,
                password: password,
                score: score
            });
        }

        try {
            const result = await window.electronAPI.accounts.addBulk(accounts);
            
            this.showSuccess(`✅ Bulk accounts generated: ${result.added} added, ${result.duplicates} duplicates`);
            
            if (result.duplicates > 0) {
                this.showWarning(`⚠️ ${result.duplicates} duplicate accounts skipped`);
            }
            
            this.hideBulkModal();
            await this.loadAccounts(); // Reload accounts list
            
        } catch (error) {
            this.showError('❌ Failed to generate bulk accounts: ' + error.message);
        }
    }

    isValidUsername(username) {
        // Basic username validation - adjust as needed
        return username.length >= 3 && username.length <= 50;
    }

    clearForm() {
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('score').value = '0';
        document.getElementById('username').focus();
    }

    renderAccounts() {
        const container = document.getElementById('accountsList');
        container.innerHTML = '';

        if (this.accounts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">No accounts added yet</div>
                    <div class="empty-subtext">Add accounts individually or generate in bulk</div>
                </div>
            `;
            return;
        }

        this.accounts.forEach(account => {
            const accountEl = this.createAccountElement(account);
            container.appendChild(accountEl);
        });

        this.updateSelectionUI();
    }

    createAccountElement(account) {
        const accountEl = document.createElement('div');
        accountEl.className = `account-item ${this.selectedAccounts.has(account.id) ? 'selected' : ''}`;
        accountEl.innerHTML = `
            <div class="account-checkbox">
                <input type="checkbox" id="account-${account.id}" 
                    ${this.selectedAccounts.has(account.id) ? 'checked' : ''}>
            </div>
            <div class="account-info">
                <div class="account-header">
                    <span class="account-username">${this.escapeHtml(account.username)}</span>
                    <span class="account-score">💰 ${account.score}</span>
                </div>
                <div class="account-meta">
                    <span class="account-id">ID: ${account.id}</span>
                    <span class="account-password">MD5: ${account.password.substring(0, 8)}...</span>
                    <span class="account-status ${account.last_processed ? 'processed' : 'pending'}">
                        ${account.last_processed ? 'Processed' : 'Pending'}
                    </span>
                </div>
                <div class="account-dates">
                    Created: ${new Date(account.created_at).toLocaleDateString()}
                    ${account.updated_at && account.updated_at !== account.created_at ? 
                        ` | Updated: ${new Date(account.updated_at).toLocaleDateString()}` : ''}
                </div>
            </div>
            <div class="account-actions">
                <button class="btn-icon edit-account" title="Edit Account">
                    ✏️
                </button>
                <button class="btn-icon delete-account" title="Delete Account">
                    🗑️
                </button>
            </div>
        `;

        // Add event listeners
        const checkbox = accountEl.querySelector(`#account-${account.id}`);
        checkbox.addEventListener('change', (e) => {
            this.toggleAccountSelection(account.id, e.target.checked);
        });

        const editBtn = accountEl.querySelector('.edit-account');
        editBtn.addEventListener('click', () => {
            this.editAccount(account);
        });

        const deleteBtn = accountEl.querySelector('.delete-account');
        deleteBtn.addEventListener('click', () => {
            this.deleteAccount(account.id);
        });

        return accountEl;
    }

    toggleAccountSelection(accountId, selected) {
        if (selected) {
            this.selectedAccounts.add(accountId);
        } else {
            this.selectedAccounts.delete(accountId);
        }
        this.updateSelectionUI();
    }

    selectAllAccounts() {
        this.accounts.forEach(account => {
            this.selectedAccounts.add(account.id);
        });
        this.renderAccounts();
    }

    deselectAllAccounts() {
        this.selectedAccounts.clear();
        this.renderAccounts();
    }

    updateSelectionUI() {
        const selectedCount = this.selectedAccounts.size;
        document.getElementById('selectedCount').textContent = selectedCount;
        
        // Update bulk actions state
        document.getElementById('deleteSelectedAccounts').disabled = selectedCount === 0;
        
        // Emit selection change event
        this.emitSelectionChanged();
    }

    async deleteAccount(accountId) {
        if (!confirm('Are you sure you want to delete this account?')) {
            return;
        }

        try {
            await window.electronAPI.accounts.delete(accountId);
            this.accounts = this.accounts.filter(acc => acc.id !== accountId);
            this.selectedAccounts.delete(accountId);
            this.renderAccounts();
            this.showSuccess('Account deleted successfully');
            this.emitAccountsUpdated();
        } catch (error) {
            this.showError('Failed to delete account: ' + error.message);
        }
    }

    async deleteSelectedAccounts() {
        const selectedCount = this.selectedAccounts.size;
        if (selectedCount === 0) return;

        if (!confirm(`Are you sure you want to delete ${selectedCount} account(s)?`)) {
            return;
        }

        try {
            const accountIds = Array.from(this.selectedAccounts);
            await window.electronAPI.accounts.deleteMultiple(accountIds);
            
            // Reload accounts
            await this.loadAccounts();
            this.selectedAccounts.clear();
            this.showSuccess(`${selectedCount} account(s) deleted successfully`);
            this.emitAccountsUpdated();
        } catch (error) {
            this.showError('Failed to delete accounts: ' + error.message);
        }
    }

    editAccount(account) {
        // Populate edit form
        document.getElementById('editUsername').value = account.username;
        document.getElementById('editPassword').value = ''; // Clear password field for security
        document.getElementById('editScore').value = account.score;
        
        // Show edit modal
        const modal = document.getElementById('editAccountModal');
        modal.style.display = 'block';
        
        // Set up save handler
        const saveBtn = document.getElementById('saveEditAccount');
        saveBtn.onclick = async () => {
            await this.saveAccountEdit(account.id);
        };

        // Set up close handler
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.onclick = () => {
            this.hideEditModal();
        };
    }

    async saveAccountEdit(accountId) {
        const username = document.getElementById('editUsername').value.trim();
        const password = document.getElementById('editPassword').value.trim();
        const score = parseInt(document.getElementById('editScore').value) || 0;

        if (!username) {
            this.showError('Username is required');
            return;
        }

        try {
            const updateData = {
                id: accountId,
                username,
                score
            };

            // Only update password if provided
            if (password) {
                updateData.password = password;
            }

            const updatedAccount = await window.electronAPI.accounts.update(updateData);

            // Update local data
            const index = this.accounts.findIndex(acc => acc.id === accountId);
            if (index !== -1) {
                this.accounts[index] = updatedAccount;
            }

            this.renderAccounts();
            this.hideEditModal();
            this.showSuccess('Account updated successfully');
            this.emitAccountsUpdated();
        } catch (error) {
            this.showError('Failed to update account: ' + error.message);
        }
    }

    hideEditModal() {
        const modal = document.getElementById('editAccountModal');
        modal.style.display = 'none';
    }

    toggleSettings() {
        const settingsPanel = document.getElementById('settingsPanel');
        const isVisible = settingsPanel.style.display === 'block';
        settingsPanel.style.display = isVisible ? 'none' : 'block';
    }

    saveSettings() {
        const settings = {
            batchSize: parseInt(document.getElementById('batchSize').value) || 1,
            delayBetweenAccounts: parseInt(document.getElementById('delayBetweenAccounts').value) || 3000,
            maxRetries: parseInt(document.getElementById('maxRetries').value) || 3,
            timeout: parseInt(document.getElementById('timeout').value) || 30000,
            autoStart: document.getElementById('autoStart').checked,
            stopOnError: document.getElementById('stopOnError').checked
        };

        // Save settings to localStorage
        localStorage.setItem('processingSettings', JSON.stringify(settings));
        this.showSuccess('Settings saved successfully');
        this.toggleSettings();
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('processingSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            
            document.getElementById('batchSize').value = settings.batchSize || 1;
            document.getElementById('delayBetweenAccounts').value = settings.delayBetweenAccounts || 3000;
            document.getElementById('maxRetries').value = settings.maxRetries || 3;
            document.getElementById('timeout').value = settings.timeout || 30000;
            document.getElementById('autoStart').checked = settings.autoStart || false;
            document.getElementById('stopOnError').checked = settings.stopOnError !== false;
        }
    }

    updateStats() {
        document.getElementById('totalAccounts').textContent = this.accounts.length;
    }

    getSelectedAccounts() {
        return Array.from(this.selectedAccounts);
    }

    getSelectedAccountsCount() {
        return this.selectedAccounts.size;
    }

    getAllAccounts() {
        return this.accounts;
    }

    emitAccountsUpdated() {
        const event = new CustomEvent('accountsUpdated', {
            detail: { accounts: this.accounts }
        });
        document.dispatchEvent(event);
    }

    emitSelectionChanged() {
        const event = new CustomEvent('accountSelectionChanged', {
            detail: { 
                selectedAccounts: Array.from(this.selectedAccounts),
                selectedCount: this.selectedAccounts.size
            }
        });
        document.dispatchEvent(event);
    }

    showSuccess(message) {
        console.log('Success:', message);
        if (window.terminal) {
            window.terminal.addMessage('success', message);
        }
    }

    showError(message) {
        console.error('Error:', message);
        if (window.terminal) {
            window.terminal.addMessage('error', message);
        }
    }

    showWarning(message) {
        console.warn('Warning:', message);
        if (window.terminal) {
            window.terminal.addMessage('warning', message);
        }
    }

    showInfo(message) {
        console.log('Info:', message);
        if (window.terminal) {
            window.terminal.addMessage('info', message);
        }
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Make it globally available
window.AccountManager = AccountManager;