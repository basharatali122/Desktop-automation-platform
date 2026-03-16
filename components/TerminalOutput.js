class TerminalOutput {
    constructor() {
        this.messages = [];
        this.maxMessages = 1000;
        this.filters = {
            info: true,
            success: true,
            warning: true,
            error: true,
            debug: false
        };
    }

    init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.render();
    }

    setupEventListeners() {
        // Clear terminal
        document.getElementById('clearTerminal').addEventListener('click', () => {
            this.clear();
        });

        // Export logs
        document.getElementById('exportLogs').addEventListener('click', () => {
            this.exportLogs();
        });

        // Filter toggles
        document.querySelectorAll('.filter-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.toggleFilter(type);
                e.target.classList.toggle('active');
            });
        });

        // Search functionality
        document.getElementById('terminalSearch').addEventListener('input', (e) => {
            this.filterMessages(e.target.value);
        });

        // Auto-scroll toggle
        document.getElementById('autoScroll').addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        });

        // Pause/Resume
        document.getElementById('pauseTerminal').addEventListener('click', (e) => {
            this.togglePause();
            e.target.textContent = this.isPaused ? 'Resume' : 'Pause';
        });
    }

    setupIPCListeners() {
        window.electronAPI.onProcessingTerminal((event, data) => {
            this.addMessage(data.type, data.message, data.timestamp);
        });

        // Listen for account updates
        document.addEventListener('accountsUpdated', (event) => {
            this.addMessage('info', `Accounts updated: ${event.detail.accounts.length} accounts loaded`);
        });

        document.addEventListener('accountSelectionChanged', (event) => {
            if (event.detail.selectedCount > 0) {
                this.addMessage('info', `${event.detail.selectedCount} account(s) selected for processing`);
            }
        });
    }

    addMessage(type, message, timestamp = null) {
        if (!this.filters[type] && type !== 'always') {
            return;
        }

        const messageObj = {
            id: Date.now() + Math.random(),
            type: type,
            message: message,
            timestamp: timestamp || new Date().toISOString(),
            visible: true
        };

        this.messages.push(messageObj);

        // Limit messages to prevent memory issues
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(-this.maxMessages);
        }

        this.renderMessage(messageObj);

        if (this.autoScroll && !this.isPaused) {
            this.scrollToBottom();
        }
    }

    renderMessage(messageObj) {
        if (this.isPaused) return;

        const terminal = document.getElementById('terminalOutput');
        const messageEl = this.createMessageElement(messageObj);
        terminal.appendChild(messageEl);

        // Apply search filter if active
        if (this.currentSearch) {
            this.applySearchFilterToMessage(messageEl, messageObj);
        }
    }

    createMessageElement(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `terminal-line ${message.type}`;
        messageEl.dataset.messageId = message.id;

        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const typeIcon = this.getTypeIcon(message.type);

        messageEl.innerHTML = `
            <span class="terminal-timestamp">[${timestamp}]</span>
            <span class="terminal-type">${typeIcon}</span>
            <span class="terminal-message">${this.escapeHtml(message.message)}</span>
        `;

        return messageEl;
    }

    getTypeIcon(type) {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            debug: '🐛'
        };
        return icons[type] || '📝';
    }

    render() {
        const terminal = document.getElementById('terminalOutput');
        terminal.innerHTML = '';

        this.messages.forEach(message => {
            if (message.visible) {
                const messageEl = this.createMessageElement(message);
                terminal.appendChild(messageEl);
            }
        });

        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    clear() {
        this.messages = [];
        this.render();
        this.addMessage('info', 'Terminal cleared');
    }

    toggleFilter(type) {
        this.filters[type] = !this.filters[type];
        this.applyFilters();
    }

    applyFilters() {
        this.messages.forEach(message => {
            message.visible = this.filters[message.type] || message.type === 'always';
        });
        this.render();
    }

    filterMessages(searchTerm) {
        this.currentSearch = searchTerm.toLowerCase();
        
        this.messages.forEach(message => {
            const matchesSearch = !this.currentSearch || 
                message.message.toLowerCase().includes(this.currentSearch);
            const matchesFilter = this.filters[message.type];
            
            message.visible = matchesSearch && matchesFilter;
        });

        this.render();
    }

    applySearchFilterToMessage(messageEl, message) {
        const matchesSearch = !this.currentSearch || 
            message.message.toLowerCase().includes(this.currentSearch);
        const matchesFilter = this.filters[message.type];
        
        messageEl.style.display = (matchesSearch && matchesFilter) ? 'block' : 'none';
    }

    scrollToBottom() {
        const terminal = document.getElementById('terminalOutput');
        terminal.scrollTop = terminal.scrollHeight;
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseBtn = document.getElementById('pauseTerminal');
        
        if (this.isPaused) {
            pauseBtn.classList.add('paused');
            this.addMessage('warning', 'Terminal output paused');
        } else {
            pauseBtn.classList.remove('paused');
            this.addMessage('info', 'Terminal output resumed');
            this.scrollToBottom();
        }
    }

    async exportLogs() {
        try {
            const logData = this.messages.map(msg => ({
                timestamp: msg.timestamp,
                type: msg.type,
                message: msg.message
            }));

            const blob = new Blob([JSON.stringify(logData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `firekirin-logs-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.addMessage('success', 'Logs exported successfully');
        } catch (error) {
            this.addMessage('error', 'Failed to export logs: ' + error.message);
        }
    }

    getStats() {
        const stats = {
            total: this.messages.length,
            byType: {}
        };

        this.messages.forEach(msg => {
            stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1;
        });

        return stats;
    }

    showStats() {
        const stats = this.getStats();
        let statsMessage = 'Terminal Statistics:\n';
        
        Object.keys(stats.byType).forEach(type => {
            statsMessage += `  ${type}: ${stats.byType[type]}\n`;
        });
        
        statsMessage += `  Total: ${stats.total}`;
        
        this.addMessage('info', statsMessage);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, '<br>');
    }
}

// Utility function to format large messages
TerminalOutput.prototype.formatLargeMessage = function(message, maxLength = 500) {
    if (message.length <= maxLength) {
        return message;
    }
    
    return message.substring(0, maxLength) + '... [truncated]';
};