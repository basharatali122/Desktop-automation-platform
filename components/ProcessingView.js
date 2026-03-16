class ProcessingView {
    constructor() {
        this.isProcessing = false;
        this.currentProgress = 0;
        this.totalAccounts = 0;
        this.stats = {
            successCount: 0,
            failCount: 0,
            confirmedBets: 0,
            assumedBets: 0
        };
    }

    init() {
        this.setupEventListeners();
        this.setupIPCListeners();
        this.updateUI();
    }

    setupEventListeners() {
        document.getElementById('startProcessing').addEventListener('click', () => {
            this.startProcessing();
        });

        document.getElementById('stopProcessing').addEventListener('click', () => {
            this.stopProcessing();
        });

        document.getElementById('pauseProcessing').addEventListener('click', () => {
            this.pauseProcessing();
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.toggleSettings();
        });

        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Batch size input
        document.getElementById('batchSize').addEventListener('change', (e) => {
            this.updateBatchSize(e.target.value);
        });
    }

    setupIPCListeners() {
        window.electronAPI.onProcessingStatus((event, data) => {
            this.handleProcessingStatus(data);
        });

        window.electronAPI.onProcessingProgress((event, data) => {
            this.handleProgressUpdate(data);
        });

        window.electronAPI.onProcessingCompleted((event, data) => {
            this.handleProcessingCompleted(data);
        });
    }

    async startProcessing() {
        const selectedAccounts = window.accountManager ? window.accountManager.getSelectedAccounts() : [];
        
        if (selectedAccounts.length === 0) {
            this.showError('Please select at least one account to process');
            return;
        }

        try {
            this.isProcessing = true;
            this.currentProgress = 0;
            this.totalAccounts = selectedAccounts.length;
            
            await window.electronAPI.processing.start(selectedAccounts);
            this.updateUI();
            this.showSuccess('Processing started successfully');
        } catch (error) {
            this.isProcessing = false;
            this.showError('Failed to start processing: ' + error.message);
            this.updateUI();
        }
    }

    async stopProcessing() {
        try {
            await window.electronAPI.processing.stop();
            this.isProcessing = false;
            this.updateUI();
            this.showSuccess('Processing stopped');
        } catch (error) {
            this.showError('Failed to stop processing: ' + error.message);
        }
    }

    async pauseProcessing() {
        // Implementation for pause/resume functionality
        this.showInfo('Pause functionality coming soon');
    }

    handleProcessingStatus(data) {
        this.isProcessing = data.running;
        
        if (data.running) {
            document.getElementById('currentAccount').textContent = data.currentAccount || 'Processing...';
            document.getElementById('progressText').textContent = 
                `Processing ${data.current || 0} of ${data.total || 0}`;
        }
        
        this.updateUI();
    }

    handleProgressUpdate(data) {
        this.currentProgress = data.index + 1;
        this.totalAccounts = data.total;
        
        // Update stats
        this.stats = data.stats;
        
        // Update progress bar
        const progressPercent = (this.currentProgress / this.totalAccounts) * 100;
        document.getElementById('progressBar').style.width = `${progressPercent}%`;
        document.getElementById('progressText').textContent = 
            `Processing ${this.currentProgress} of ${this.totalAccounts}`;
        
        // Update stats display
        this.updateStatsDisplay();
        
        // Update current account
        document.getElementById('currentAccount').textContent = data.account || '';
    }

    handleProcessingCompleted(data) {
        this.isProcessing = false;
        this.currentProgress = 0;
        this.stats = data;
        
        this.updateUI();
        this.updateStatsDisplay();
        this.showSuccess(`Processing completed! Successful: ${data.successCount}, Failed: ${data.failCount}`);
    }

    updateUI() {
        const startBtn = document.getElementById('startProcessing');
        const stopBtn = document.getElementById('stopProcessing');
        const pauseBtn = document.getElementById('pauseProcessing');
        const progressSection = document.getElementById('progressSection');

        if (this.isProcessing) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            pauseBtn.disabled = false;
            progressSection.style.display = 'block';
            
            startBtn.innerHTML = '⏸️ Processing...';
            stopBtn.innerHTML = '🛑 Stop';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            pauseBtn.disabled = true;
            
            startBtn.innerHTML = '🚀 Start Processing';
            stopBtn.innerHTML = '🛑 Stop';
            
            if (this.currentProgress === 0) {
                progressSection.style.display = 'none';
            }
        }

        // Update batch size info
        const batchSize = document.getElementById('batchSize').value;
        document.getElementById('batchSizeInfo').textContent = 
            `Processing ${batchSize} accounts simultaneously`;
    }

    updateStatsDisplay() {
        document.getElementById('successCount').textContent = this.stats.successCount;
        document.getElementById('failCount').textContent = this.stats.failCount;
        document.getElementById('confirmedBets').textContent = this.stats.confirmedBets;
        document.getElementById('assumedBets').textContent = this.stats.assumedBets;
        
        // Update success rate
        const totalProcessed = this.stats.successCount + this.stats.failCount;
        const successRate = totalProcessed > 0 ? 
            Math.round((this.stats.successCount / totalProcessed) * 100) : 0;
        document.getElementById('successRate').textContent = `${successRate}%`;
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

        // Save settings to localStorage or send to main process
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
            document.getElementById('stopOnError').checked = settings.stopOnError || false;
        }
    }

    updateBatchSize(size) {
        const batchSize = parseInt(size) || 1;
        if (batchSize < 1) {
            document.getElementById('batchSize').value = 1;
        } else if (batchSize > 10) {
            document.getElementById('batchSize').value = 10;
            this.showWarning('Maximum batch size is 10 accounts');
        }
        
        this.updateUI();
    }

    getProcessingSettings() {
        return {
            batchSize: parseInt(document.getElementById('batchSize').value) || 1,
            delayBetweenAccounts: parseInt(document.getElementById('delayBetweenAccounts').value) || 3000,
            maxRetries: parseInt(document.getElementById('maxRetries').value) || 3,
            timeout: parseInt(document.getElementById('timeout').value) || 30000,
            autoStart: document.getElementById('autoStart').checked || false,
            stopOnError: document.getElementById('stopOnError').checked || false
        };
    }

    showSuccess(message) {
        if (window.terminal) {
            window.terminal.addMessage('success', message);
        }
    }

    showError(message) {
        if (window.terminal) {
            window.terminal.addMessage('error', message);
        }
    }

    showWarning(message) {
        if (window.terminal) {
            window.terminal.addMessage('warning', message);
        }
    }

    showInfo(message) {
        if (window.terminal) {
            window.terminal.addMessage('info', message);
        }
    }
}