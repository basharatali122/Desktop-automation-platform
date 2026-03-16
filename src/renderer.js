
class FireKirinRenderer {
    constructor() {
        this.accounts = [];
        this.selectedAccounts = new Set();
        this.isProcessing = false;
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            processed: 0,
            cyclesCompleted: 0,
            totalCycles: 1
        };
        this.userManager = null;
        this.autoScroll = true;
        this.currentBet = 20; // ✅ Default bet amount
        this.betConfig = null; // ✅ Bet configuration
        this.init();
    }

    async init() {
        console.log('🚀 Initializing PandaMaster App...');

        try {
            // ✅ FIRST: Check if electronAPI is available
            if (!window.electronAPI) {
                console.error('❌ electronAPI not available');
                this.showRegistrationForm();
                return;
            }

            console.log('🔍 Checking available electron APIs...');
            console.log('electronAPI available:', !!window.electronAPI);
            console.log('electronAPI.bet available:', !!window.electronAPI?.bet);
            
            // 1. Setup Auth Listeners First
            this.setupAuthListeners();

            // 2. Initialize User Management
            await this.initializeUserManagement();

            // 3. Load Accounts From Database
            await this.loadAccounts();

            await this.displayCurrentProfile();
            
            // 4. Setup UI + IPC Listeners
            this.setupEventListeners();
            this.setupIPCListeners();

            // 5. Update Statistics
            this.updateStats();

            // 6. Setup Bet Controls - ✅ NEW
            this.setupBetControls();
            
            // ✅ FIXED: Check if bet API exists before calling
            if (window.electronAPI?.bet?.getCurrent) {
                await this.getCurrentBetConfig();
            } else {
                console.warn('⚠️ Bet API not available, using default bet: 20');
                this.currentBet = 20;
                this.updateBetDisplay();
            }

            // 7. Wait for Main Process Auth Event
            console.log('👤 Waiting for auth state from main process...');

            // 8. Fallback (If no auth state event arrives in 3 seconds)
            setTimeout(() => {
                const appContainer = document.querySelector('.app-container');
                const registrationModal = document.getElementById('registrationModal');

                if (
                    appContainer && appContainer.style.display !== 'block' &&
                    registrationModal && registrationModal.style.display !== 'flex'
                ) {
                    console.log('⏰ Fallback: Showing registration form');
                    this.showRegistrationForm();
                }
            }, 3000);

        } catch (error) {
            console.error('❌ App initialization failed:', error);
            this.showRegistrationForm();
        }
    }

    async displayCurrentProfile() {
        try {
            if (!window.electronAPI?.profile?.getCurrent) {
                console.warn('⚠️ Profile API not available');
                return;
            }
            
            const { profileName } = await window.electronAPI.profile.getCurrent();
            
            // Update header to show profile
            const header = document.querySelector('.app-header h1');
            if (header) {
                header.textContent = `🎰 Milkyway - ${profileName}`;
            }
            
            this.addTerminalMessage('info', `👤 Active Profile: ${profileName}`);
        } catch (error) {
            console.error('Failed to get profile:', error);
        }
    }
    
    setupAuthListeners() {
        console.log('🔄 Setting up auth listeners...');
        
        // Check if electronAPI is available
        if (!window.electronAPI || !window.electronAPI.userManagement) {
            console.error('❌ electronAPI.userManagement is not available');
            this.showRegistrationForm();
            return;
        }

        try {
            // Listen for auth state changes from main process
            if (window.electronAPI.userManagement.onShowRegistration) {
                window.electronAPI.userManagement.onShowRegistration(() => {
                    console.log('🔄 Received show registration from main process');
                    this.showRegistrationForm();
                });
            } else {
                console.warn('⚠️ onShowRegistration not available');
            }

            if (window.electronAPI.userManagement.onShowMainApp) {
                window.electronAPI.userManagement.onShowMainApp((event, data) => {
                    console.log('🔄 Received show main app from main process:', data);
                    if (data && data.user) {
                        this.userManager = { currentUser: data.user };
                        this.hideRegistrationModal();
                        this.showMainApp();
                        this.loadAccounts();
                        this.addTerminalMessage('success', `Welcome back, ${data.user.email}!`);
                        
                        // ✅ Setup bet controls when main app shows
                        this.setupBetControls();
                        
                        // ✅ Check if bet API exists
                        if (window.electronAPI?.bet?.getCurrent) {
                            this.getCurrentBetConfig();
                        }
                    }
                });
            } else {
                console.warn('⚠️ onShowMainApp not available');
            }

            if (window.electronAPI.userManagement.onShowPendingApproval) {
                window.electronAPI.userManagement.onShowPendingApproval(() => {
                    console.log('🔄 Received show pending approval from main process');
                    this.showPendingApproval();
                });
            } else {
                console.warn('⚠️ onShowPendingApproval not available');
            }

            console.log('✅ Auth listeners setup completed');

        } catch (error) {
            console.error('❌ Error setting up auth listeners:', error);
            this.showRegistrationForm();
        }
    }

    async initializeUserManagement() {
        try {
            console.log('🔄 Initializing user management...');
            
            // Check if electronAPI is available
            if (!window.electronAPI || !window.electronAPI.userManagement) {
                throw new Error('Electron API or userManagement not available');
            }

            // Main process se initialize karen
            const result = await window.electronAPI.userManagement.initialize();
            
            if (result.success) {
                console.log('✅ User management initialized via main process');
                
                // Setup registration handlers
                this.setupRegistrationHandlers();
                
                // Check current user status
                const userResult = await window.electronAPI.userManagement.getCurrentUser();
                if (userResult.success && userResult.user) {
                    this.userManager = { 
                        currentUser: userResult.user,
                        // Method implementations
                        registerUser: (email, password) => 
                            window.electronAPI.userManagement.registerUser(email, password),
                        loginUser: (email, password) => 
                            window.electronAPI.userManagement.loginUser(email, password)
                    };
                    console.log('👤 Current user found:', userResult.user.email);
                } else {
                    console.log('👤 No current user found');
                    this.userManager = {
                        registerUser: (email, password) => 
                            window.electronAPI.userManagement.registerUser(email, password),
                        loginUser: (email, password) => 
                            window.electronAPI.userManagement.loginUser(email, password)
                    };
                }
                
            } else {
                throw new Error(result.error || 'User management initialization failed');
            }
            
        } catch (error) {
            console.error('❌ User management initialization failed:', error);
            // Fallback: Direct registration form show karen
            this.showRegistrationForm();
        }
    }

    async handleRegistration() {
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;

        console.log('📝 Registration attempt:', email);

        if (password !== confirmPassword) {
            this.addTerminalMessage('error', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.addTerminalMessage('error', 'Password must be at least 6 characters');
            return;
        }

        if (!this.userManager) {
            this.addTerminalMessage('error', 'User manager not initialized');
            console.error('UserManager not available');
            return;
        }

        // Show loading state
        const registerBtn = document.querySelector('#registrationForm button[type="submit"]');
        const originalText = registerBtn.textContent;
        registerBtn.textContent = 'Registering...';
        registerBtn.disabled = true;

        try {
            this.addTerminalMessage('info', '🔄 Registering user...');
            const result = await this.userManager.registerUser(email, password);

            if (result.success) {
                this.addTerminalMessage('success', result.message);
                this.addTerminalMessage('info', '⏳ Waiting for admin approval...');
                this.showPendingApproval();
            } else {
                this.addTerminalMessage('error', '❌ Registration failed: ' + result.message);
            }
        } catch (error) {
            console.error('Registration handler error:', error);
            this.addTerminalMessage('error', '❌ Registration error: ' + error.message);
        } finally {
            // Reset button
            registerBtn.textContent = originalText;
            registerBtn.disabled = false;
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        console.log('🔐 Login attempt:', email);

        if (!this.userManager) {
            this.addTerminalMessage('error', 'User manager not initialized');
            return;
        }

        // Show loading state
        const loginBtn = document.querySelector('#loginForm button[type="submit"]');
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;

        try {
            this.addTerminalMessage('info', '🔄 Logging in...');
            const result = await this.userManager.loginUser(email, password);

            if (result.success) {
                this.addTerminalMessage('success', '✅ Login successful!');
                // The main process will send show-main-app event
            } else {
                this.addTerminalMessage('error', '❌ Login failed: ' + result.message);
            }
        } catch (error) {
            console.error('Login handler error:', error);
            this.addTerminalMessage('error', '❌ Login error: ' + error.message);
        } finally {
            // Reset button
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }

    setupRegistrationHandlers() {
        console.log('🔄 Setting up registration handlers...');
        
        const registrationForm = document.getElementById('registrationForm');
        const loginForm = document.getElementById('loginForm');
        const showLoginLink = document.getElementById('showLogin');
        const showRegisterLink = document.getElementById('showRegister');
        const checkStatusBtn = document.getElementById('checkApprovalStatus');

        if (registrationForm) {
            registrationForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleRegistration();
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin();
            });
        }

        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('registrationForm').style.display = 'none';
                document.getElementById('loginForm').style.display = 'block';
            });
        }

        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('registrationForm').style.display = 'block';
            });
        }

        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => {
                if (this.userManager && this.userManager.checkUserStatus) {
                    this.userManager.checkUserStatus();
                } else {
                    this.addTerminalMessage('info', 'Checking approval status...');
                }
            });
        }
        
        console.log('✅ Registration handlers setup completed');
    }

    showRegistrationForm() {
        console.log('Showing registration form');
        const appContainer = document.querySelector('.app-container');
        const registrationModal = document.getElementById('registrationModal');
        
        if (appContainer) appContainer.style.display = 'none';
        if (registrationModal) {
            registrationModal.style.display = 'flex';
            // Ensure registration form is visible by default
            document.getElementById('registrationForm').style.display = 'block';
            document.getElementById('loginForm').style.display = 'none';
        }
    }

    showPendingApproval() {
        console.log('Showing pending approval');
        const registrationModal = document.getElementById('registrationModal');
        const pendingModal = document.getElementById('pendingApprovalModal');
        
        if (registrationModal) registrationModal.style.display = 'none';
        if (pendingModal) pendingModal.style.display = 'flex';
    }

    hideRegistrationModal() {
        console.log('Hiding registration modal');
        const registrationModal = document.getElementById('registrationModal');
        const pendingModal = document.getElementById('pendingApprovalModal');
        
        if (registrationModal) registrationModal.style.display = 'none';
        if (pendingModal) pendingModal.style.display = 'none';
    }

    showMainApp() {
        console.log('Showing main application');
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'block';
        }
    }

    async loadAccounts() {
        try {
            if (!window.electronAPI?.accounts?.getAll) {
                throw new Error('Accounts API not available');
            }
            
            this.accounts = await window.electronAPI.accounts.getAll();
            this.updateStats();
            console.log(`✅ Loaded ${this.accounts.length} accounts`);
        } catch (error) {
            this.addTerminalMessage('error', `Failed to load accounts: ${error.message}`);
        }
    }

    setupEventListeners() {
        // Bulk account generation
        document.getElementById('generateAccounts')?.addEventListener('click', () => {
            this.generateBulkAccounts();
        });

        // Delete All Accounts
        document.getElementById('deleteAllAccounts')?.addEventListener('click', () => {
            this.deleteAllAccounts();
        });

        // Processing control
        document.getElementById('startProcessing')?.addEventListener('click', () => this.startProcessing());
        document.getElementById('stopProcessing')?.addEventListener('click', () => this.stopProcessing());
        
        // Terminal controls
        document.getElementById('clearTerminal')?.addEventListener('click', () => this.clearTerminal());
        document.getElementById('exportLogs')?.addEventListener('click', () => this.exportLogs());
        
        // Auto scroll
        const autoScrollEl = document.getElementById('autoScroll');
        if (autoScrollEl) {
            autoScrollEl.addEventListener('change', (e) => {
                this.autoScroll = e.target.checked;
            });
        }

        // Repetition count listener
        document.getElementById('repetitionCount')?.addEventListener('input', (e) => {
            const count = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
            document.getElementById('repetitionPreview').textContent = count;
            this.stats.totalCycles = count;
        });

        // Bulk modal setup
        this.setupBulkModalListeners();
    }

    setupBulkModalListeners() {
        // Update username preview in real-time
        const updatePreview = () => {
            const prefix = document.getElementById('bulkPrefix').value.trim() || 'user';
            const start = parseInt(document.getElementById('startRange').value) || 1;
            const end = parseInt(document.getElementById('endRange').value) || 10;
            const total = end - start + 1;
            
            const previewEl = document.getElementById('totalAccountsPreview');
            if (previewEl) {
                previewEl.textContent = total;
            }
        };

        document.getElementById('bulkPrefix')?.addEventListener('input', updatePreview);
        document.getElementById('startRange')?.addEventListener('input', updatePreview);
        document.getElementById('endRange')?.addEventListener('input', updatePreview);

        // Initialize preview
        updatePreview();
    }

    setupIPCListeners() {
        // ✅ FIXED: Add null checks for all IPC listeners
        
        // Processing events
        if (window.electronAPI.onProcessingStatus) {
            window.electronAPI.onProcessingStatus((event, data) => {
                this.updateProcessingStatus(data);
            });
        }

        if (window.electronAPI.onProcessingTerminal) {
            window.electronAPI.onProcessingTerminal((event, data) => {
                this.addTerminalMessage(data.type, data.message);
            });
        }

        if (window.electronAPI.onProcessingProgress) {
            window.electronAPI.onProcessingProgress((event, data) => {
                this.updateProgress(data);
            });
        }

        if (window.electronAPI.onProcessingCompleted) {
            window.electronAPI.onProcessingCompleted((event, data) => {
                this.processingCompleted(data);
            });
        }

        // Cycle update listener
        if (window.electronAPI.onCycleUpdate) {
            window.electronAPI.onCycleUpdate((event, data) => {
                this.updateCycleProgress(data);
            });
        }

        // ✅ FIXED: Bet configuration listeners with proper checks
        if (window.electronAPI.onBetConfigChanged) {
            window.electronAPI.onBetConfigChanged((event, data) => {
                this.handleBetConfigChanged(data);
            });
        } else {
            console.warn('⚠️ onBetConfigChanged API not available');
        }

        if (window.electronAPI.onBetUpdate) {
            window.electronAPI.onBetUpdate((event, data) => {
                this.handleBetUpdate(data);
            });
        } else {
            console.warn('⚠️ onBetUpdate API not available');
        }

        if (window.electronAPI.onBetError) {
            window.electronAPI.onBetError((event, data) => {
                this.handleBetError(data);
            });
        } else {
            console.warn('⚠️ onBetError API not available');
        }
    }

    // ✅ Setup bet controls
    setupBetControls() {
        // Create bet control section in sidebar
        this.createBetControlSection();
        
        // Initialize bet value
        this.updateBetDisplay();
    }

    // ✅ Create bet control section in UI
    createBetControlSection() {
        const sidebar = document.querySelector('.sidebar-content');
        if (!sidebar) return;

        // Check if bet control section already exists
        if (document.getElementById('betControlSection')) {
            return;
        }

        const betSection = document.createElement('div');
        betSection.className = 'section';
        betSection.id = 'betControlSection';
        
        betSection.innerHTML = `
            <div class="section-header">
                <h3><i class="fas fa-coins"></i> Bet Control</h3>
            </div>
            <div class="bet-control-panel">
                <div class="bet-display">
                    <div class="bet-current">
                        <span class="bet-label">Current Bet:</span>
                        <span class="bet-value" id="currentBetValue">${this.currentBet}</span>
                    </div>
                    <div class="bet-total">
                        <span class="bet-label">Total Bets:</span>
                        <span class="bet-total-value" id="totalBetsValue">0</span>
                    </div>
                </div>
                
                <div class="bet-input-group">
                    <label><i class="fas fa-edit"></i> Custom Bet Amount</label>
                    <div class="bet-input-row">
                        <input 
                            type="number" 
                            id="customBetAmount" 
                            class="form-input" 
                            value="${this.currentBet}"
                            min="1" 
                            max="1000"
                            placeholder="Enter bet amount"
                        />
                        <button id="setCustomBet" class="btn btn-small btn-primary">
                            <i class="fas fa-check"></i> Set
                        </button>
                    </div>
                </div>
                
                <div class="quick-bets">
                    <label><i class="fas fa-bolt"></i> Quick Bets</label>
                    <div class="quick-bet-buttons">
                        <button class="btn btn-small btn-outline quick-bet" data-amount="10">10</button>
                        <button class="btn btn-small btn-outline quick-bet" data-amount="20">20</button>
                        <button class="btn btn-small btn-outline quick-bet" data-amount="40">40</button>
                        <button class="btn btn-small btn-outline quick-bet" data-amount="60">60</button>
                        <button class="btn btn-small btn-outline quick-bet" data-amount="80">80</button>
                        <button class="btn btn-small btn-outline quick-bet" data-amount="100">100</button>
                    </div>
                </div>
                
                <div class="bet-actions">
                    <button id="resetBet" class="btn btn-small btn-warning">
                        <i class="fas fa-undo"></i> Reset to Default
                    </button>
                    <button id="getBetConfig" class="btn btn-small btn-info">
                        <i class="fas fa-info-circle"></i> Info
                    </button>
                </div>
                
                <div class="bet-status">
                    <div class="status-item">
                        <span class="status-label">Mode:</span>
                        <span id="betMode" class="status-value">Default</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Split:</span>
                        <span id="betSplit" class="status-value">Yes</span>
                    </div>
                </div>
            </div>
        `;

        // Insert after game configuration section
        const gameConfigSection = document.querySelector('.game-config-section');
        if (gameConfigSection) {
            gameConfigSection.after(betSection);
        } else {
            sidebar.appendChild(betSection);
        }

        // Add event listeners
        this.setupBetEventListeners();
    }

    // ✅ Setup bet event listeners
    setupBetEventListeners() {
        // Custom bet amount
        document.getElementById('setCustomBet')?.addEventListener('click', () => {
            this.setCustomBetAmount();
        });

        document.getElementById('customBetAmount')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.setCustomBetAmount();
            }
        });

        // Quick bet buttons
        document.querySelectorAll('.quick-bet').forEach(button => {
            button.addEventListener('click', (e) => {
                const amount = parseInt(e.target.dataset.amount);
                this.setQuickBet(amount);
            });
        });

        // Reset bet
        document.getElementById('resetBet')?.addEventListener('click', () => {
            this.resetBetToDefault();
        });

        // Get bet config
        document.getElementById('getBetConfig')?.addEventListener('click', () => {
            this.getBetConfiguration();
        });
    }

    // ✅ Get current bet configuration
    async getCurrentBetConfig() {
        try {
            if (!window.electronAPI?.bet?.getCurrent) {
                console.warn('⚠️ bet.getCurrent API not available');
                return;
            }
            
            const result = await window.electronAPI.bet.getCurrent();
            if (result.success) {
                this.currentBet = result.currentBet;
                this.betConfig = result.config;
                this.updateBetDisplay();
                
                // Update custom bet input
                const customBetInput = document.getElementById('customBetAmount');
                if (customBetInput) {
                    customBetInput.value = this.currentBet;
                }
            }
        } catch (error) {
            console.error('Failed to get bet config:', error);
        }
    }

    // ✅ Handle bet config changes
    handleBetConfigChanged(data) {
        this.currentBet = data.currentBet || this.currentBet;
        this.betConfig = { ...this.betConfig, ...data };
        this.updateBetDisplay();
        
        this.addTerminalMessage('info', `🎯 Bet configuration updated: ${data.currentBet}`);
        
        // Update UI elements
        if (document.getElementById('customBetAmount')) {
            document.getElementById('customBetAmount').value = data.currentBet;
        }
        
        // Update bet mode display
        const betModeEl = document.getElementById('betMode');
        if (betModeEl) {
            betModeEl.textContent = data.isDynamic ? 'Dynamic' : 'Default';
        }
    }

    // ✅ Handle bet updates
    handleBetUpdate(data) {
        // Update bet statistics
        const totalBetsEl = document.getElementById('totalBetsValue');
        if (totalBetsEl && data.totalBetsPlaced) {
            totalBetsEl.textContent = data.totalBetsPlaced;
        }
        
        // Update current bet display
        if (data.currentBet) {
            this.currentBet = data.currentBet;
            this.updateBetDisplay();
        }
    }

    // ✅ Handle bet errors
    handleBetError(data) {
        this.addTerminalMessage('error', `❌ Bet Error: ${data.message || 'Unknown error'}`);
        
        // Show error in bet section
        const betSection = document.getElementById('betControlSection');
        if (betSection && data.message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'bet-error-message';
            errorDiv.textContent = data.message;
            errorDiv.style.cssText = `
                background: rgba(220, 53, 69, 0.1);
                color: #dc3545;
                padding: 8px;
                border-radius: 4px;
                margin-top: 10px;
                font-size: 12px;
            `;
            
            // Remove previous error if exists
            const prevError = betSection.querySelector('.bet-error-message');
            if (prevError) prevError.remove();
            
            betSection.appendChild(errorDiv);
            
            // Auto remove after 5 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.remove();
                }
            }, 5000);
        }
    }

    // ✅ Update bet display
    updateBetDisplay() {
        const betValueEl = document.getElementById('currentBetValue');
        const betModeEl = document.getElementById('betMode');
        
        if (betValueEl) {
            betValueEl.textContent = this.currentBet;
            betValueEl.className = `bet-value ${this.getBetColorClass(this.currentBet)}`;
        }
        
        if (betModeEl) {
            betModeEl.textContent = this.currentBet === 20 ? 'Default' : 'Custom';
        }
    }

    // ✅ Get color class based on bet amount
    getBetColorClass(amount) {
        if (amount <= 20) return 'bet-value-low';
        if (amount <= 50) return 'bet-value-medium';
        if (amount <= 100) return 'bet-value-high';
        return 'bet-value-very-high';
    }

    // ✅ Set custom bet amount
    async setCustomBetAmount() {
        const input = document.getElementById('customBetAmount');
        const amount = parseInt(input.value);
        
        if (isNaN(amount) || amount < 1 || amount > 1000) {
            this.addTerminalMessage('error', 'Please enter a valid bet amount (1-1000)');
            input.focus();
            return;
        }

        try {
            if (!window.electronAPI?.bet?.setAmount) {
                throw new Error('Bet API not available');
            }
            
            const result = await window.electronAPI.bet.setAmount(amount);
            if (result.success) {
                this.currentBet = amount;
                this.updateBetDisplay();
                this.addTerminalMessage('success', `✅ Bet amount set to ${amount}`);
            } else {
                this.addTerminalMessage('error', `❌ Failed to set bet: ${result.message}`);
            }
        } catch (error) {
            this.addTerminalMessage('error', `❌ Error setting bet: ${error.message}`);
        }
    }

    // ✅ Set quick bet
    async setQuickBet(amount) {
        try {
            if (!window.electronAPI?.bet?.setAmount) {
                throw new Error('Bet API not available');
            }
            
            const result = await window.electronAPI.bet.setAmount(amount);
            if (result.success) {
                this.currentBet = amount;
                document.getElementById('customBetAmount').value = amount;
                this.updateBetDisplay();
                this.addTerminalMessage('success', `✅ Quick bet set to ${amount}`);
            }
        } catch (error) {
            this.addTerminalMessage('error', `❌ Error setting quick bet: ${error.message}`);
        }
    }

    // ✅ Reset bet to default
    async resetBetToDefault() {
        try {
            if (!window.electronAPI?.bet?.reset) {
                throw new Error('Bet API not available');
            }
            
            const result = await window.electronAPI.bet.reset();
            if (result.success) {
                this.currentBet = result.defaultBet || 20;
                document.getElementById('customBetAmount').value = this.currentBet;
                this.updateBetDisplay();
                this.addTerminalMessage('info', `🔄 Bet reset to default: ${this.currentBet}`);
            }
        } catch (error) {
            this.addTerminalMessage('error', `❌ Error resetting bet: ${error.message}`);
        }
    }

    // ✅ Get bet configuration
    async getBetConfiguration() {
        try {
            if (!window.electronAPI?.bet?.getConfig) {
                throw new Error('Bet API not available');
            }
            
            const result = await window.electronAPI.bet.getConfig();
            if (result.success) {
                this.showBetInfoModal(result.config);
            } else {
                this.addTerminalMessage('error', `❌ Failed to get bet config: ${result.message}`);
            }
        } catch (error) {
            this.addTerminalMessage('error', `❌ Error getting bet config: ${error.message}`);
        }
    }

    // ✅ Show bet info modal
    showBetInfoModal(config) {
        // Create or show modal with bet configuration
        let modal = document.getElementById('betInfoModal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'betInfoModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-info-circle"></i> Bet Configuration</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="config-details">
                            <!-- Details will be filled dynamically -->
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close button
            modal.querySelector('.close-modal').addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        // Fill configuration details
        const details = modal.querySelector('.config-details');
        details.innerHTML = `
            <div class="config-item">
                <span class="config-label">Current Bet:</span>
                <span class="config-value">${config?.currentBet || this.currentBet}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Default Bet:</span>
                <span class="config-value">${config?.totalBet || 20}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Dynamic Amount:</span>
                <span class="config-value">${config?.dynamicAmount || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Mode:</span>
                <span class="config-value">${config?.isDynamic ? 'Dynamic' : 'Default'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Split Bets:</span>
                <span class="config-value">${config?.splitBets ? 'Yes' : 'No'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Min Bet:</span>
                <span class="config-value">${config?.minBet || 1}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Max Bet:</span>
                <span class="config-value">${config?.maxBet || 1000}</span>
            </div>
            <div class="config-item">
                <span class="config-label">Total Bets Placed:</span>
                <span class="config-value">${config?.totalBetsPlaced || 0}</span>
            </div>
        `;
        
        modal.style.display = 'flex';
    }

    async deleteAllAccounts() {
        const confirmed = confirm('⚠️ DANGER ZONE ⚠️\n\nThis will PERMANENTLY DELETE ALL accounts from this computer.\n\nThis action cannot be undone!\n\nAre you absolutely sure?');
        
        if (confirmed) {
            try {
                const accounts = await window.electronAPI.accounts.getAll();
                
                if (accounts.length === 0) {
                    this.addTerminalMessage('info', '📝 No accounts found to delete.');
                    return;
                }
                
                const secondConfirm = confirm(`FINAL WARNING:\n\nYou are about to delete ${accounts.length} accounts permanently.\n\nType "DELETE ALL" to confirm:`);
                
                if (secondConfirm) {
                    this.addTerminalMessage('warning', `🗑️ Starting deletion of ${accounts.length} accounts...`);
                    
                    const accountIds = accounts.map(acc => acc.id);
                    const result = await window.electronAPI.accounts.deleteMultiple(accountIds);
                    
                    this.addTerminalMessage('success', `✅ Successfully deleted ${result.deletedCount || accounts.length} accounts!`);
                    
                    await this.loadAccounts();
                    
                } else {
                    this.addTerminalMessage('info', '❌ Account deletion cancelled.');
                }
                
            } catch (error) {
                this.addTerminalMessage('error', `❌ Failed to delete accounts: ${error.message}`);
            }
        }
    }

    async generateBulkAccounts() {
        const prefix = document.getElementById('bulkPrefix').value.trim() || 'user';
        const startRange = parseInt(document.getElementById('startRange').value) || 1;
        const endRange = parseInt(document.getElementById('endRange').value) || 10;
        const password = document.getElementById('bulkPassword').value.trim();
        const score = parseInt(document.getElementById('bulkScore').value) || 0;

        if (!password) {
            this.addTerminalMessage('error', 'Please enter a password for bulk accounts');
            return;
        }

        if (startRange > endRange) {
            this.addTerminalMessage('error', 'Start range cannot be greater than end range');
            return;
        }

        const totalAccounts = endRange - startRange + 1;
        if (totalAccounts > 1000) {
            this.addTerminalMessage('error', 'Cannot generate more than 1000 accounts at once');
            return;
        }

        this.addTerminalMessage('info', `🔄 Generating ${totalAccounts} accounts...`);

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
            
            this.addTerminalMessage('success', 
                `✅ Bulk accounts generated: ${result.added} added, ${result.duplicates} duplicates`
            );
            
            if (result.duplicates > 0) {
                this.addTerminalMessage('warning', 
                    `⚠️ ${result.duplicates} duplicate accounts skipped`
                );
            }
            
            await this.loadAccounts();
            
        } catch (error) {
            this.addTerminalMessage('error', `❌ Failed to generate bulk accounts: ${error.message}`);
        }
    }

    async startProcessing() {
        const accountIds = this.accounts.map(acc => acc.id);
        
        if (accountIds.length === 0) {
            this.addTerminalMessage('error', 'No accounts available for processing');
            return;
        }

        if (this.isProcessing) {
            this.addTerminalMessage('warning', 'Processing is already running');
            return;
        }

        // Get repetition count
        const repetitions = Math.max(1, Math.min(100, parseInt(document.getElementById('repetitionCount').value) || 1));
        this.stats.totalCycles = repetitions;
        this.stats.cyclesCompleted = 0;

        try {
            this.isProcessing = true;
            this.setProcessingState(true);
            
            // Pass repetitions to backend
            await window.electronAPI.processing.start(accountIds, repetitions);
            this.addTerminalMessage('info', `🚀 Starting processing with ${repetitions} cycle(s)...`);
            
            // ✅ Show current bet in terminal
            this.addTerminalMessage('info', `🎯 Current Bet Amount: ${this.currentBet}`);
        } catch (error) {
            this.isProcessing = false;
            this.setProcessingState(false);
            this.addTerminalMessage('error', `❌ Failed to start processing: ${error.message}`);
        }
    }

    async stopProcessing() {
        try {
            await window.electronAPI.processing.stop();
            this.setProcessingState(false);
            this.addTerminalMessage('warning', '🛑 Processing stopped');
        } catch (error) {
            this.addTerminalMessage('error', `❌ Failed to stop processing: ${error.message}`);
        }
    }

    setProcessingState(processing) {
        this.isProcessing = processing;
        document.getElementById('startProcessing').disabled = processing;
        document.getElementById('stopProcessing').disabled = !processing;
        document.getElementById('repetitionCount').disabled = processing;
        
        // ✅ Disable bet controls during processing
        const betControls = document.querySelectorAll('#betControlSection button, #betControlSection input');
        betControls.forEach(control => {
            control.disabled = processing;
        });
        
        if (!processing) {
            document.getElementById('processingStatus').textContent = 'Status: Ready';
            document.getElementById('progressInfo').textContent = 'Progress: 0/0';
            document.getElementById('currentCycle').textContent = 'Cycle: 0/0';
        }
    }

    updateProcessingStatus(data) {
        const statusEl = document.getElementById('processingStatus');
        const progressEl = document.getElementById('progressInfo');
        const cycleEl = document.getElementById('currentCycle');
        
        if (data.running) {
            statusEl.textContent = `Status: Processing ${data.currentAccount || ''}`;
            progressEl.textContent = `Progress: ${data.current || 0}/${data.total || 0}`;
            cycleEl.textContent = `Cycle: ${data.currentCycle || 0}/${data.totalCycles || 1}`;
        } else {
            statusEl.textContent = 'Status: Ready';
            progressEl.textContent = 'Progress: 0/0';
            cycleEl.textContent = 'Cycle: 0/0';
        }
    }

    // Update cycle progress
    updateCycleProgress(data) {
        this.stats.cyclesCompleted = data.cyclesCompleted || 0;
        this.stats.totalCycles = data.totalCycles || 1;
        
        document.getElementById('cycleCount').textContent = `${this.stats.cyclesCompleted}/${this.stats.totalCycles}`;
        document.getElementById('cycleProgress').textContent = `Cycle: ${this.stats.cyclesCompleted}/${this.stats.totalCycles}`;
        document.getElementById('cyclesCompleted').textContent = this.stats.cyclesCompleted;
        
        this.addTerminalMessage('info', `🔄 Cycle ${this.stats.cyclesCompleted}/${this.stats.totalCycles} completed!`);
    }

    updateProgress(data) {
        // Update main stats
        this.stats.success = data.stats.successCount || 0;
        this.stats.failed = data.stats.failCount || 0;
        this.stats.processed = (data.stats.successCount || 0) + (data.stats.failCount || 0);
        
        this.updateStats();
        
        // Update progress
        if (data.total > 0) {
            const progressPercent = ((data.index + 1) / data.total) * 100;
            document.getElementById('progressInfo').textContent = 
                `Progress: ${data.index + 1}/${data.total}`;
        }
    }

    processingCompleted(data) {
        this.setProcessingState(false);
        this.stats.success = data.successCount || 0;
        this.stats.failed = data.failCount || 0;
        this.stats.processed = (data.successCount || 0) + (data.failCount || 0);
        this.stats.cyclesCompleted = data.cyclesCompleted || 0;
        
        this.updateStats();
        this.addTerminalMessage('success', 
            `🎉 ALL PROCESSING COMPLETED! Cycles: ${data.cyclesCompleted}/${data.totalCycles}, Successful: ${data.successCount}, Failed: ${data.failCount}`
        );
        
        this.loadAccounts();
    }

    updateStats() {
        // Update header stats
        document.getElementById('totalAccounts').textContent = this.accounts.length;
        document.getElementById('successCount').textContent = this.stats.success;
        document.getElementById('failCount').textContent = this.stats.failed;
        document.getElementById('cycleCount').textContent = `${this.stats.cyclesCompleted}/${this.stats.totalCycles}`;
        
        // Update stats grid
        document.getElementById('totalProcessed').textContent = this.stats.processed;
        document.getElementById('successfulCount').textContent = this.stats.success;
        document.getElementById('failedCount').textContent = this.stats.failed;
        document.getElementById('cyclesCompleted').textContent = this.stats.cyclesCompleted;
        
        // Calculate success rate
        const successRate = this.stats.processed > 0 ? 
            Math.round((this.stats.success / this.stats.processed) * 100) : 0;
        document.getElementById('successRate').textContent = `Success: ${successRate}%`;
        
        // Update active workers if available
        if (this.stats.activeWorkers) {
            document.getElementById('activeWorkers').textContent = `Active: ${this.stats.activeWorkers}`;
        }
    }

    // ✅ CRITICAL FIX: Limit terminal lines to prevent memory leak
    addTerminalMessage(type, message) {
        const terminal = document.getElementById('terminalOutput');
        if (!terminal) return;
        
        // ✅ LIMIT TERMINAL LINES
        const MAX_LINES = 500;
        const TRIM_TO = 400;
        
        if (terminal.childElementCount >= MAX_LINES) {
            const linesToRemove = terminal.childElementCount - TRIM_TO;
            for (let i = 0; i < linesToRemove; i++) {
                if (terminal.firstChild) {
                    terminal.removeChild(terminal.firstChild);
                }
            }
        }
        
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        const typeIcon = this.getTypeIcon(type);
        
        line.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${typeIcon} ${this.escapeHtml(message)}`;
        terminal.appendChild(line);
        
        if (this.autoScroll !== false) {
            terminal.scrollTop = terminal.scrollHeight;
        }
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

    clearTerminal() {
        const terminal = document.getElementById('terminalOutput');
        if (terminal) {
            terminal.innerHTML = '';
            this.addTerminalMessage('info', 'Terminal cleared');
        }
    }

    async exportLogs() {
        try {
            const terminal = document.getElementById('terminalOutput');
            const lines = Array.from(terminal.querySelectorAll('.terminal-line'));
            const logData = lines.map(line => ({
                text: line.textContent,
                type: line.className.replace('terminal-line ', '')
            }));

            const blob = new Blob([JSON.stringify(logData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Milkyway-logs-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.addTerminalMessage('success', 'Logs exported successfully');
        } catch (error) {
            this.addTerminalMessage('error', 'Failed to export logs: ' + error.message);
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

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FireKirinRenderer();
});
