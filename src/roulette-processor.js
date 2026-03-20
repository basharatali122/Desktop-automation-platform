// const WebSocket = require('ws');
// const EventEmitter = require('events');
// const { SocksProxyAgent } = require('socks-proxy-agent');
// const { v4: uuidv4 } = require('uuid');

// class UltimateRouletteProcessor extends EventEmitter {
//   constructor(db) {
//     super();
//     this.db = db;
//     this.isProcessing = false;
//     this.currentAccounts = [];
//     this.activeProcesses = new Map();
//     this.connectionPool = new Map();
//     this.activeIntervals = new Set();
//     this.activeTimeouts = new Set();

//     // Set by main.js
//     this.instanceId = 'default';
//     this.globalCoordinator = null;

//     // Proxy settings (set by main.js from proxyConfig)
//     this.useProxy = false;
//     this.proxyList = [];
//     this.currentProxyIndex = 0;

//     // IP key for the global socket coordinator bucket.
//     // 'direct' = real IP (shared across all non-proxy profiles)
//     // 'proxy_host_port' = a unique bucket per proxy IP
//     this.proxyIpKey = 'direct';

//     this.config = {
//       LOGIN_WS_URL: 'wss://game.milkywayapp.xyz:7878/',
//       SUPER_ROULETTE_WS_URL: 'wss://game.milkywayapp.xyz:10152/',
//       GAME_VERSION: '2.0.1',

//       CONCURRENT_WORKERS: 10,

//       // With a dedicated proxy, each profile has its own IP bucket in the
//       // GlobalSocketCoordinator — it can run up to MAX_PER_IP=10 concurrent
//       // sockets independently of other profiles, so batch size can be larger.
//       // Without a proxy the direct-IP bucket is shared; smaller batch is safer.
//       // Both values are overridden dynamically in startProcessing() based on
//       // whether a proxy is active.
//       BATCH_SIZE: 4,              // Default: no proxy (safe for shared IP)
//       BATCH_SIZE_PROXY: 8,        // With proxy: each profile has its own IP

//       ACCOUNTS_PER_MINUTE: 60,

//       COMPLETE_RESET_BETWEEN_CYCLES: true,
//       MAX_CONNECTIONS_PER_CYCLE: 200,

//       BATCH_DELAY_MS: 400,
//       BATCH_DELAY_MS_PROXY: 200, // Faster batches when proxy isolates IP
//       RETRY_ATTEMPTS: 0,

//       RANDOM_DELAYS: { MIN: 150, MAX: 400 },
//       CYCLE_DELAY: { MIN: 500, MAX: 1000 },

//       TIMEOUTS: {
//         LOGIN: 22000,
//         GAME_CONNECTION: 8000,
//         ENTER_GAME: 8000,
//         JOIN_GAME: 8000,
//         BET_RESPONSE: 8000,
//         GAME_READY: 10000
//       },

//       BATCH_STAGGER_MS: 200,
//       BATCH_STAGGER_MS_PROXY: 120,  // Tighter stagger OK when IP is isolated
//     };

//     this.adaptiveState = {
//       recentLoginTimes: [],
//       maxRecentSamples: 8,
//       currentStaggerMs: this.config.BATCH_STAGGER_MS,
//       currentBatchDelayMs: this.config.BATCH_DELAY_MS,
//       SLOW_THRESHOLD_MS: 8000,
//       FAST_THRESHOLD_MS: 4500,
//       MAX_STAGGER_MS: 400,
//       MIN_STAGGER_MS: 100,
//       MAX_BATCH_DELAY_MS: 1500,
//       MIN_BATCH_DELAY_MS: 200,
//       BACKOFF_STEP: 50,
//       RECOVER_STEP: 75,
//       consecutiveSlowBatches: 0,
//       IP_BLOCK_THRESHOLD_MS: 20000,
//       IP_BLOCK_COOLDOWN_MS: 75000,
//       isIPBlocked: false,
//       ipBlockedAt: 0,
//     };

//     this.cycleState = this.createFreshCycleState();
//     this.betConfig = {
//       totalBet: 20, isDynamic: false, dynamicAmount: 0,
//       splitBets: true, minBet: 1, maxBet: 1000,
//       betStrategy: 'martingale', betHistory: []
//     };

//     this.mobileUserAgents = this.generateRealisticUserAgents();
//     this.deviceFingerprints = this.generateAdvancedFingerprints();
//     this.headerVariations = this.generateHeaderVariations();
//     this.cycleStats = this.createFreshCycleStats();
//   }

//   // ---------------------------------------------------------------------------
//   // Socket coordinator — uses per-IP buckets
//   // ---------------------------------------------------------------------------

//   _getIpKey() {
//     // Use assigned proxyIpKey if proxy is active; else share 'direct' bucket
//     return (this.useProxy && this.proxyIpKey && this.proxyIpKey !== 'direct')
//       ? this.proxyIpKey
//       : 'direct';
//   }

//   async acquireSocket() {
//     const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
//     if (coordinator) await coordinator.acquire(this._getIpKey());
//   }

//   releaseSocket() {
//     const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
//     if (coordinator) coordinator.release(this._getIpKey());
//   }

//   getGlobalSocketCount() {
//     const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
//     if (!coordinator) return this.connectionPool.size;
//     return coordinator.getCount(this._getIpKey());
//   }

//   // ---------------------------------------------------------------------------
//   // Adaptive backoff — skips IP-block cooldown when proxy is active
//   // (each proxy is its own IP; being blocked on one doesn't affect others)
//   // ---------------------------------------------------------------------------

//   recordLoginTime(loginTimeMs) {
//     const state = this.adaptiveState;
//     state.recentLoginTimes.push(loginTimeMs);
//     if (state.recentLoginTimes.length > state.maxRecentSamples) state.recentLoginTimes.shift();
//     if (state.recentLoginTimes.length < 3) return;

//     const avg = state.recentLoginTimes.reduce((a, b) => a + b, 0) / state.recentLoginTimes.length;

//     // IP-block detection — only meaningful when NOT using a proxy.
//     // With a proxy, slow logins mean the proxy itself is slow, not a block.
//     if (!this.useProxy && avg >= state.IP_BLOCK_THRESHOLD_MS && !state.isIPBlocked) {
//       state.isIPBlocked = true;
//       state.ipBlockedAt = Date.now();
//       this.emit('terminal', {
//         type: 'error',
//         message: `🚫 [${this.instanceId}] IP RATE LIMITED! Avg login ${Math.round(avg)}ms. Cooling down ${state.IP_BLOCK_COOLDOWN_MS / 1000}s... (Add a proxy to avoid this pause)`
//       });
//       state.recentLoginTimes = [];
//       return;
//     }

//     if (state.isIPBlocked && !this.useProxy) {
//       if (Date.now() - state.ipBlockedAt >= state.IP_BLOCK_COOLDOWN_MS) {
//         state.isIPBlocked = false;
//         state.recentLoginTimes = [];
//         state.currentStaggerMs = state.MAX_STAGGER_MS;
//         state.currentBatchDelayMs = state.MAX_BATCH_DELAY_MS;
//         this.emit('terminal', { type: 'info', message: `✅ [${this.instanceId}] IP cooldown complete. Resuming...` });
//       }
//       return;
//     }

//     const prevStagger = state.currentStaggerMs;
//     const prevDelay = state.currentBatchDelayMs;

//     if (avg > state.SLOW_THRESHOLD_MS) {
//       state.consecutiveSlowBatches++;
//       state.currentStaggerMs = Math.min(state.MAX_STAGGER_MS, state.currentStaggerMs + state.BACKOFF_STEP);
//       state.currentBatchDelayMs = Math.min(state.MAX_BATCH_DELAY_MS, state.currentBatchDelayMs + (state.BACKOFF_STEP * 2));
//     } else if (avg < state.FAST_THRESHOLD_MS) {
//       state.consecutiveSlowBatches = 0;
//       state.currentStaggerMs = Math.max(state.MIN_STAGGER_MS, state.currentStaggerMs - state.RECOVER_STEP);
//       state.currentBatchDelayMs = Math.max(state.MIN_BATCH_DELAY_MS, state.currentBatchDelayMs - (state.RECOVER_STEP * 2));
//     } else {
//       state.consecutiveSlowBatches = 0;
//     }

//     if (state.currentStaggerMs !== prevStagger || state.currentBatchDelayMs !== prevDelay) {
//       const dir = state.currentStaggerMs > prevStagger ? '⬆️ Backing off' : '⬇️ Recovering';
//       this.emit('terminal', {
//         type: state.currentStaggerMs > prevStagger ? 'warning' : 'info',
//         message: `⚡ [${this.instanceId}] Adaptive ${dir}: avg ${Math.round(avg)}ms → stagger ${state.currentStaggerMs}ms, delay ${state.currentBatchDelayMs}ms`
//       });
//     }
//   }

//   // ---------------------------------------------------------------------------
//   // State factories
//   // ---------------------------------------------------------------------------

//   createFreshCycleState() {
//     return { cycleStartTime: 0, activeWorkers: 0, processedThisCycle: 0, connectionsThisCycle: 0, isCycleActive: false, cycleId: uuidv4().substring(0, 8) };
//   }

//   createFreshCycleStats() {
//     return { successCount: 0, failCount: 0, confirmedBets: 0, assumedBets: 0, processedThisMinute: 0, minuteStartTime: Date.now(), totalBetAmount: 0, totalWinAmount: 0, cycleSuccessCount: 0, cycleFailCount: 0 };
//   }

//   // ---------------------------------------------------------------------------
//   // Bet management
//   // ---------------------------------------------------------------------------

//   updateBetConfig(newConfig) {
//     if (!newConfig) return false;
//     if (newConfig.totalBet !== undefined) this.betConfig.totalBet = Math.max(this.betConfig.minBet, Math.min(this.betConfig.maxBet, newConfig.totalBet));
//     if (newConfig.dynamicAmount !== undefined) this.betConfig.dynamicAmount = Math.max(this.betConfig.minBet, Math.min(this.betConfig.maxBet, newConfig.dynamicAmount));
//     if (newConfig.isDynamic !== undefined) this.betConfig.isDynamic = newConfig.isDynamic;
//     if (newConfig.splitBets !== undefined) this.betConfig.splitBets = newConfig.splitBets;
//     if (newConfig.betStrategy !== undefined) this.betConfig.betStrategy = newConfig.betStrategy;
//     this.emit('terminal', { type: 'info', message: `🎯 Bet updated: ${this.getCurrentBetAmount()}` });
//     this.emit('betConfigChanged', { totalBet: this.betConfig.totalBet, dynamicAmount: this.betConfig.dynamicAmount, currentBet: this.getCurrentBetAmount(), isDynamic: this.betConfig.isDynamic, splitBets: this.betConfig.splitBets, betStrategy: this.betConfig.betStrategy });
//     return true;
//   }

//   getCurrentBetAmount() {
//     if (this.betConfig.isDynamic && this.betConfig.dynamicAmount > 0) return this.betConfig.dynamicAmount;
//     return this.betConfig.totalBet;
//   }

//   handleBetChange(newAmount) {
//     const amount = parseInt(newAmount);
//     if (isNaN(amount) || amount < this.betConfig.minBet || amount > this.betConfig.maxBet) {
//       this.emit('betError', { message: `Invalid bet: ${newAmount}` }); return false;
//     }
//     const old = this.getCurrentBetAmount();
//     this.updateBetConfig({ isDynamic: true, dynamicAmount: amount });
//     this.emit('terminal', { type: 'success', message: `✅ Bet changed: ${old} → ${amount}` });
//     return true;
//   }

//   resetToDefaultBet() {
//     this.updateBetConfig({ isDynamic: false, dynamicAmount: 0 });
//     this.emit('terminal', { type: 'info', message: `🔄 Bet reset: ${this.getCurrentBetAmount()}` });
//     return this.getCurrentBetAmount();
//   }

//   getBetConfig() {
//     return { ...this.betConfig, currentBet: this.getCurrentBetAmount(), totalBetsPlaced: this.cycleStats.totalBetAmount, totalWins: this.cycleStats.totalWinAmount };
//   }

//   createBetPayload() {
//     const amount = this.getCurrentBetAmount();
//     let firstBet = amount, secondBet = amount;
//     if (this.betConfig.splitBets && amount > 1) { firstBet = Math.floor(amount / 2); secondBet = amount - firstBet; }
//     this.cycleStats.totalBetAmount += amount;
//     this.betConfig.betHistory.push({ amount, timestamp: new Date().toISOString(), split: this.betConfig.splitBets, firstBet, secondBet });
//     if (this.betConfig.betHistory.length > 100) this.betConfig.betHistory = this.betConfig.betHistory.slice(-100);
//     this.emit('betUpdate', { currentBet: amount, totalBetsPlaced: this.cycleStats.totalBetAmount, split: { firstBet, secondBet } });
//     this.emitTerminalMessage(0, 'debug', `💰 Betting: ${amount} (Split: ${firstBet}/${secondBet})`);
//     return {
//       totalBetValue: amount,
//       betData: (() => { const d = [0]; for (let i = 1; i <= 36; i++) d.push(amount); return d; })(),
//       singleDigitBet: new Array(37).fill(0),
//       detailBet: [
//         [{ "id": [2,4,6,8,11,10,13,15,17,20,22,24,26,29,28,31,33,35], "bet": firstBet }],
//         [{ "id": [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36], "bet": secondBet }]
//       ],
//       route: 39, mainID: 200, subID: 100
//     };
//   }

//   updateBetStats(winAmount) {
//     if (winAmount && winAmount > 0) {
//       this.cycleStats.totalWinAmount += winAmount;
//       this.emit('betUpdate', { winAmount, totalWins: this.cycleStats.totalWinAmount, netProfit: this.cycleStats.totalWinAmount - this.cycleStats.totalBetAmount });
//       this.emit('terminal', { type: 'success', message: `💰 Win: ${winAmount} | Total Wins: ${this.cycleStats.totalWinAmount}` });
//     }
//   }

//   // ---------------------------------------------------------------------------
//   // User agents / fingerprints / headers
//   // ---------------------------------------------------------------------------

//   generateRealisticUserAgents() {
//     return [
//       'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
//       'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
//       'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
//       'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
//       'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
//       'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
//       'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
//       'Mozilla/5.0 (Linux; Android 13; SM-F936B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
//     ];
//   }

//   generateAdvancedFingerprints() {
//     return [
//       { deviceId: "SM-S928B", model: "Galaxy S24 Ultra", resolution: "1440x3120", viewport: "412x915", pixelRatio: 3.5, language: "en-US", timezone: "America/New_York" },
//       { deviceId: "Pixel 8 Pro", model: "Pixel 8 Pro", resolution: "1344x2992", viewport: "412x892", pixelRatio: 3.0, language: "en-US", timezone: "America/Los_Angeles" },
//       { deviceId: "iPhone16,2", model: "iPhone 15 Pro", resolution: "1290x2796", viewport: "390x844", pixelRatio: 3.0, language: "en-US", timezone: "America/Chicago" }
//     ];
//   }

//   generateHeaderVariations() {
//     return [
//       { 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
//       { 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.8', 'Accept-Encoding': 'gzip, deflate', 'Cache-Control': 'no-cache' },
//       { 'Accept': 'application/json, text/javascript, */*', 'Accept-Language': 'en-US,en;q=0.7', 'Accept-Encoding': 'gzip, deflate, br', 'Pragma': 'no-cache' }
//     ];
//   }

//   // ---------------------------------------------------------------------------
//   // Processing lifecycle
//   // ---------------------------------------------------------------------------

//   async resetForNextCycle() {
//     for (const [key, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, key);
//     this.connectionPool.clear();
//     this.activeProcesses.clear();
//     this.clearAllTimers();
//     this.cycleState = this.createFreshCycleState();
//     this.cycleStats = this.createFreshCycleStats();
//     this.currentProxyIndex = 0;
//     if (global.gc) { for (let i = 0; i < 2; i++) { global.gc(); await this.sleep(100); } }
//     await this.sleep(300);
//     return { success: true, memoryMB: this.getMemoryUsage(), cycleId: this.cycleState.cycleId };
//   }

//   async startProcessing(accountIds, repetitions = 1, useProxy = false, proxyList = []) {
//     if (this.isProcessing) throw new Error('Processing already in progress');

//     await this.completeCleanup();
//     this.isProcessing = true;
//     this.useProxy = useProxy;
//     this.proxyList = proxyList;
//     this.currentProxyIndex = 0;

//     // Set effective batch size and stagger based on proxy availability.
//     // With a proxy each profile is a separate IP → can run more concurrent.
//     this._effectiveBatchSize = useProxy ? this.config.BATCH_SIZE_PROXY : this.config.BATCH_SIZE;
//     this._effectiveBatchDelay = useProxy ? this.config.BATCH_DELAY_MS_PROXY : this.config.BATCH_DELAY_MS;
//     this._effectiveStagger = useProxy ? this.config.BATCH_STAGGER_MS_PROXY : this.config.BATCH_STAGGER_MS;

//     // Sync adaptive state minimums to effective values
//     this.adaptiveState.MIN_STAGGER_MS = useProxy ? 80 : 150;
//     this.adaptiveState.MIN_BATCH_DELAY_MS = useProxy ? 150 : 300;
//     this.adaptiveState.currentStaggerMs = this._effectiveStagger;
//     this.adaptiveState.currentBatchDelayMs = this._effectiveBatchDelay;

//     const accounts = await this.db.getAllAccounts();
//     this.currentAccounts = accounts.filter(acc => accountIds.includes(acc.id));
//     this.totalCycles = Math.max(1, Math.min(50, parseInt(repetitions) || 1));
//     this.currentCycle = 0;

//     this.connectionPool.clear();
//     this.activeProcesses.clear();
//     this.clearAllTimers();
//     this.cycleState = this.createFreshCycleState();
//     this.cycleStats = this.createFreshCycleStats();
//     this.adaptiveState.recentLoginTimes = [];
//     this.adaptiveState.isIPBlocked = false;
//     this.adaptiveState.consecutiveSlowBatches = 0;

//     const proxyStatus = useProxy
//       ? `🌐 Proxy: ${this.proxyIpKey} (${proxyList.length} proxies) — dedicated IP, no shared limit`
//       : `🔗 Direct IP — shared with other profiles, conservative limits apply`;

//     this.emit('terminal', { type: 'info', message: `⚡ [${this.instanceId}] SPEED BOT ACTIVATED` });
//     this.emit('terminal', { type: 'info', message: `📋 Accounts: ${this.currentAccounts.length}` });
//     this.emit('terminal', { type: 'info', message: `🎯 Bet: ${this.getCurrentBetAmount()}` });
//     this.emit('terminal', { type: 'info', message: proxyStatus });
//     this.emit('terminal', { type: 'info', message: `🚀 Batch size: ${this._effectiveBatchSize} | Stagger: ${this._effectiveStagger}ms | Delay: ${this._effectiveBatchDelay}ms` });

//     this.startSecurityMonitor();
//     this.processAllCycles();

//     return {
//       started: true, totalAccounts: this.currentAccounts.length,
//       currentBet: this.getCurrentBetAmount(), instanceId: this.instanceId,
//       proxyEnabled: useProxy, effectiveBatchSize: this._effectiveBatchSize,
//       cycleId: this.cycleState.cycleId
//     };
//   }

//   async processAllCycles() {
//     for (let cycle = 1; cycle <= this.totalCycles && this.isProcessing; cycle++) {
//       this.currentCycle = cycle;
//       if (this.config.COMPLETE_RESET_BETWEEN_CYCLES) await this.resetForNextCycle();

//       this.cycleState.cycleStartTime = Date.now();
//       this.cycleState.isCycleActive = true;
//       this.cycleState.cycleId = uuidv4().substring(0, 8);
//       this.cycleStats = this.createFreshCycleStats();

//       const proxyLabel = this.useProxy ? ` [PROXY: ${this.proxyIpKey}]` : ' [DIRECT IP]';
//       this.emit('terminal', { type: 'info', message: `\n🔰 CYCLE ${cycle}/${this.totalCycles} [${this.instanceId}]${proxyLabel}` });
//       this.emit('cycleStart', { cycle, totalCycles: this.totalCycles, currentBet: this.getCurrentBetAmount(), startTime: Date.now(), cycleId: this.cycleState.cycleId });

//       await this.processSingleCycle();

//       const cycleDuration = Date.now() - this.cycleState.cycleStartTime;
//       this.emit('cycleComplete', { cycle, totalCycles: this.totalCycles, successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount, cycleDuration, memoryUsage: this.getMemoryUsage(), cycleId: this.cycleState.cycleId });
//       this.cycleState.isCycleActive = false;
//       this.cycleState.activeWorkers = 0;

//       if (cycle < this.totalCycles && this.isProcessing) {
//         const delay = this.getEnhancedRandomDelay();
//         this.emit('terminal', { type: 'info', message: `⏳ Waiting ${delay}ms before next cycle...` });
//         await this.sleep(delay);
//       }
//     }
//     this.completeProcessing();
//   }

//   async processSingleCycle() {
//     const totalAccounts = this.currentAccounts.length;
//     let processed = 0;

//     while (processed < totalAccounts && this.isProcessing && this.cycleState.isCycleActive) {
//       await this.checkEnhancedRateLimit();

//       // IP-block cooldown — only for direct IP connections, never for proxy profiles
//       if (!this.useProxy) {
//         while (this.adaptiveState.isIPBlocked && this.isProcessing) {
//           const elapsed = Date.now() - this.adaptiveState.ipBlockedAt;
//           const remaining = Math.max(0, this.adaptiveState.IP_BLOCK_COOLDOWN_MS - elapsed);
//           if (remaining <= 0) {
//             this.adaptiveState.isIPBlocked = false;
//             this.adaptiveState.recentLoginTimes = [];
//             this.adaptiveState.currentStaggerMs = this.adaptiveState.MAX_STAGGER_MS;
//             this.adaptiveState.currentBatchDelayMs = this.adaptiveState.MAX_BATCH_DELAY_MS;
//             this.emit('terminal', { type: 'info', message: `✅ [${this.instanceId}] IP cooldown done, resuming...` });
//             break;
//           }
//           this.emit('terminal', { type: 'warning', message: `🚫 [${this.instanceId}] IP blocked. Waiting ${Math.round(remaining / 1000)}s... (Tip: set a proxy to skip this)` });
//           await this.sleep(5000);
//         }
//         if (!this.isProcessing || !this.cycleState.isCycleActive) break;
//       }

//       const batchSize = Math.min(this._effectiveBatchSize, totalAccounts - processed);
//       const batchAccounts = this.currentAccounts.slice(processed, processed + batchSize);

//       const ipLabel = this.useProxy ? `${this.proxyIpKey}` : 'direct';
//       this.emit('terminal', {
//         type: 'info',
//         message: `🚀 Batch ${processed + 1}-${processed + batchSize} [${this.instanceId}] | IP: ${ipLabel} | Stagger: ${this.adaptiveState.currentStaggerMs}ms | Sockets: ${this.getGlobalSocketCount()}`
//       });

//       const currentStagger = this.adaptiveState.currentStaggerMs;
//       const batchPromises = batchAccounts.map((account, index) =>
//         this.sleep(index * currentStagger).then(() =>
//           this.processAccountWithEnhancedSecurity(account, processed + index)
//         )
//       );

//       const results = await Promise.allSettled(batchPromises);
//       this.updateEnhancedStatistics(results);
//       processed += batchSize;
//       this.cycleState.processedThisCycle = processed;

//       this.emit('cycleProgress', {
//         processed, total: totalAccounts, currentCycle: this.currentCycle, totalCycles: this.totalCycles,
//         successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
//         batchPerformance: { batchSize, successRate: results.filter(r => r.status === 'fulfilled' && r.value?.success).length / batchSize * 100 },
//         adaptiveStagger: this.adaptiveState.currentStaggerMs, proxyEnabled: this.useProxy
//       });

//       if (processed < totalAccounts) await this.sleep(this.adaptiveState.currentBatchDelayMs);
//     }

//     await this.cleanupCycleConnections();
//   }

//   async cleanupCycleConnections() {
//     if (this.connectionPool.size > 0) {
//       for (const [key, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, key);
//       this.connectionPool.clear();
//       await this.sleep(100);
//     }
//   }

//   async processAccountWithEnhancedSecurity(account, globalIndex) {
//     const processId = uuidv4();
//     this.activeProcesses.set(processId, account.username);
//     this.cycleState.activeWorkers++;
//     this.cycleState.connectionsThisCycle++;

//     try {
//       this.emit('status', {
//         running: true, total: this.currentAccounts.length, current: globalIndex + 1,
//         activeWorkers: this.cycleState.activeWorkers, currentAccount: account.username,
//         speed: `${this.cycleStats.processedThisMinute}/minute`, instanceId: this.instanceId,
//         currentBet: this.getCurrentBetAmount(), cycle: this.currentCycle, cycleId: this.cycleState.cycleId,
//         proxyEnabled: this.useProxy
//       });

//       const result = await this.ultraSecureAccountProcessing(account, globalIndex);

//       if (result.success) {
//         if (result.winCredit && result.winCredit > 0) this.updateBetStats(result.winCredit);
//         await this.db.updateAccount({
//           ...account, score: result.newBalance || account.score,
//           last_processed: new Date().toISOString(),
//           last_bet_amount: this.getCurrentBetAmount(),
//           total_bets: (account.total_bets || 0) + 1,
//           total_wins: (account.total_wins || 0) + (result.winCredit > 0 ? 1 : 0)
//         });
//         await this.db.addProcessingLog(account.id, result.confirmed ? 'confirmed_success' : 'assumed_success',
//           result.confirmed ? 'Bet confirmed' : 'Bet assumed successful',
//           { ...result, cycle: this.currentCycle, cycleId: this.cycleState.cycleId, timestamp: new Date().toISOString(), betAmount: this.getCurrentBetAmount(), winAmount: result.winCredit || 0, duration: result.duration || 0 }
//         );
//       }

//       this.emit('progress', {
//         index: globalIndex, total: this.currentAccounts.length, account: account.username,
//         success: result.success, confirmed: result.confirmed, error: result.error,
//         stats: { ...this.cycleStats }, betAmount: this.getCurrentBetAmount(), winAmount: result.winCredit || 0,
//         cycle: this.currentCycle, cycleId: this.cycleState.cycleId
//       });

//       return result;
//     } catch (error) {
//       this.emitTerminalMessage(globalIndex, 'error', `🛡️ Error: ${error.message}`);
//       return { success: false, error: error.message };
//     } finally {
//       this.cycleState.activeWorkers--;
//       this.activeProcesses.delete(processId);
//     }
//   }

//   async ultraSecureAccountProcessing(account, index) {
//     const sessionId = uuidv4();
//     const fingerprint = this.getRandomFingerprint();
//     const userAgent = this.getRandomUserAgent();
//     const headers = this.getRandomHeaders();
//     const proxy = this.getNextProxy();
//     const startTime = Date.now();

//     this.emitTerminalMessage(index, 'info', `🛡️ Session: ${sessionId.substring(0, 8)} (Cycle ${this.currentCycle})`);

//     try {
//       const loginResult = await this.enhancedLogin(account, userAgent, headers, proxy, index);
//       if (!loginResult.success) throw new Error(`Login failed: ${loginResult.error}`);
//       if (loginResult.loginTime) this.recordLoginTime(loginResult.loginTime);

//       Object.assign(account, loginResult.accountData);
//       account.sessionId = sessionId;

//       const gameResult = await this.guaranteedGameFlow(account, userAgent, headers, proxy, index, sessionId);
//       return { ...gameResult, sessionId, fingerprint: fingerprint.deviceId, duration: Date.now() - startTime, cycleId: this.cycleState.cycleId };
//     } catch (error) {
//       this.recordLoginTime(this.config.TIMEOUTS.LOGIN);
//       return { success: false, error: error.message, sessionId, fingerprint: fingerprint?.deviceId, cycleId: this.cycleState.cycleId };
//     }
//   }

//   async enhancedLogin(account, userAgent, headers, proxy, index) {
//     await this.acquireSocket();

//     return new Promise((resolve, reject) => {
//       const timeout = setTimeout(() => {
//         this.activeTimeouts.delete(timeout);
//         this.releaseSocket();
//         reject(new Error('Enhanced login timeout'));
//       }, this.config.TIMEOUTS.LOGIN);
//       this.activeTimeouts.add(timeout);

//       const wsOptions = { handshakeTimeout: 10000, headers: { 'User-Agent': userAgent, 'Origin': 'http://localhost', ...headers } };
//       if (proxy) {
//         wsOptions.agent = new SocksProxyAgent(proxy);
//         this.emitTerminalMessage(index, 'debug', `🔌 Proxy: ${proxy.replace(/\/\/.*@/, '//*@')}`);
//       }

//       const loginWs = new WebSocket(this.config.LOGIN_WS_URL, ['wl'], wsOptions);
//       const connectionKey = `login_${account.username}_${this.cycleState.cycleId}_${Date.now()}`;
//       this.connectionPool.set(connectionKey, loginWs);

//       let loginCompleted = false;
//       const loginStartTime = Date.now();

//       const cleanup = (resolveValue, rejectErr) => {
//         if (loginCompleted) return;
//         loginCompleted = true;
//         clearTimeout(timeout);
//         this.activeTimeouts.delete(timeout);
//         this.safeWebSocketClose(loginWs, connectionKey);
//         this.connectionPool.delete(connectionKey);
//         this.releaseSocket();
//         if (rejectErr) reject(rejectErr); else resolve(resolveValue);
//       };

//       loginWs.on('open', () => {
//         this.emitTerminalMessage(index, 'debug', `🔐 Login handshake`);
//         loginWs.send(JSON.stringify(this.createLoginPayload(account)));
//       });
//       loginWs.on('message', (raw) => {
//         try {
//           const msg = JSON.parse(raw.toString());
//           if (msg.mainID === 100 && msg.subID === 116 && msg.data?.result === 0) {
//             const loginTime = Date.now() - loginStartTime;
//             this.emitTerminalMessage(index, 'success', `✅ Login (${loginTime}ms)`);
//             cleanup({ success: true, accountData: { userid: msg.data.userid, dynamicpass: msg.data.dynamicpass, bossid: msg.data.bossid, gameid: msg.data.gameid, score: msg.data.score, nickname: msg.data.nickname }, loginTime });
//           }
//           if (msg.mainID === 100 && msg.subID === 116 && msg.data?.result !== 0) {
//             cleanup({ success: false, error: `Login rejected: ${msg.data?.result}` });
//           }
//         } catch (_) {}
//       });
//       loginWs.on('error', (err) => { this.emitTerminalMessage(index, 'error', `🔐 Login error: ${err.message}`); cleanup(null, err); });
//       loginWs.on('close', () => { if (!loginCompleted) cleanup({ success: false, error: 'Login connection closed unexpectedly' }); });
//     });
//   }

//   async guaranteedGameFlow(account, userAgent, headers, proxy, index, sessionId) {
//     await this.acquireSocket();

//     return new Promise((resolve) => {
//       const gameStartTime = Date.now();
//       let gameWs = null, betConfirmed = false, balanceChanged = false;
//       let heartbeatInterval = null, mainTimeout = null, isFinalized = false;
//       const connectionKey = `game_${account.username}_${this.cycleState.cycleId}_${sessionId}`;

//       const finalize = (result) => {
//         if (isFinalized) return;
//         isFinalized = true;
//         if (heartbeatInterval) { clearInterval(heartbeatInterval); this.activeIntervals.delete(heartbeatInterval); heartbeatInterval = null; }
//         if (mainTimeout) { clearTimeout(mainTimeout); this.activeTimeouts.delete(mainTimeout); mainTimeout = null; }
//         if (gameWs) { this.safeWebSocketClose(gameWs, connectionKey); this.connectionPool.delete(connectionKey); gameWs = null; }
//         this.releaseSocket();
//         this.emitTerminalMessage(index, 'debug', `⏱️ Session: ${Date.now() - gameStartTime}ms`);
//         resolve(result);
//       };

//       mainTimeout = setTimeout(() => {
//         if (!betConfirmed && !isFinalized) {
//           this.emitTerminalMessage(index, 'warning', `⏰ Timeout (${this.config.TIMEOUTS.BET_RESPONSE}ms)`);
//           finalize({ success: balanceChanged, confirmed: false, assumed: balanceChanged, newBalance: account.score, timeout: true });
//         }
//       }, this.config.TIMEOUTS.BET_RESPONSE + 6000);
//       this.activeTimeouts.add(mainTimeout);

//       const wsOptions = { handshakeTimeout: 8000, headers: { 'User-Agent': userAgent, 'Origin': 'http://localhost', ...headers } };
//       if (proxy) wsOptions.agent = new SocksProxyAgent(proxy);

//       gameWs = new WebSocket(this.config.SUPER_ROULETTE_WS_URL, ['wl'], wsOptions);
//       this.connectionPool.set(connectionKey, gameWs);

//       gameWs.on('error', (err) => { if (!isFinalized) { this.emitTerminalMessage(index, 'error', `🎮 WS Error: ${err.message}`); finalize({ success: balanceChanged, confirmed: false, error: err.message, newBalance: account.score }); } });
//       gameWs.on('close', (code) => { if (!isFinalized) { this.emitTerminalMessage(index, 'debug', `🎮 WS Closed: ${code}`); finalize({ success: balanceChanged, confirmed: false, assumed: balanceChanged, newBalance: account.score, closedEarly: true }); } });

//       gameWs.on('open', () => {
//         this.emitTerminalMessage(index, 'success', `🎮 Connected`);
//         const send = (payload, desc, delay = 0) => setTimeout(() => {
//           if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) {
//             this.emitTerminalMessage(index, 'debug', `📤 ${desc}`);
//             gameWs.send(JSON.stringify(payload));
//           }
//         }, delay);

//         send(this.createEnterGamePayload(account), 'Enter', 100);
//         send(this.createJoinGamePayload(account), 'Join', 500);
//         send(this.createGameInitPayload(), 'Init', 1000);

//         heartbeatInterval = setInterval(() => {
//           if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) gameWs.send(JSON.stringify(this.createJoinTablePayload(account)));
//           else { if (heartbeatInterval) { clearInterval(heartbeatInterval); this.activeIntervals.delete(heartbeatInterval); heartbeatInterval = null; } }
//         }, 5000);
//         this.activeIntervals.add(heartbeatInterval);

//         send(this.createJoinTablePayload(account), 'Table', 1500);
//         setTimeout(() => {
//           if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) {
//             this.emitTerminalMessage(index, 'info', `🎯 Betting ${this.getCurrentBetAmount()}...`);
//             gameWs.send(JSON.stringify(this.createBetPayload()));
//           }
//         }, 2000);
//       });

//       gameWs.on('message', (raw) => {
//         if (isFinalized) return;
//         try {
//           const msg = JSON.parse(raw.toString());
//           if (msg.mainID === 1 && msg.subID === 104 && msg.data?.score) {
//             if (msg.data.score !== account.score) { balanceChanged = true; account.score = msg.data.score; }
//           }
//           if (msg.mainID === 200 && msg.subID === 100 && msg.data?.route === 39) {
//             betConfirmed = true;
//             if (mainTimeout) { clearTimeout(mainTimeout); this.activeTimeouts.delete(mainTimeout); mainTimeout = null; }
//             const winCredit = msg.data.winCredit || 0;
//             const playerCredit = msg.data.playerCredit || account.score;
//             account.score = playerCredit;
//             this.emitTerminalMessage(index, 'success', `🎉 CONFIRMED! Win: ${winCredit}, Balance: ${playerCredit}`);
//             this.emit('betUpdate', { winAmount: winCredit, totalWins: this.cycleStats.totalWinAmount + winCredit, currentBet: this.getCurrentBetAmount() });
//             finalize({ success: true, confirmed: true, newBalance: playerCredit, winCredit, betConfirmed: true });
//           }
//         } catch (_) {}
//       });
//     });
//   }

//   async checkEnhancedRateLimit() {
//     const now = Date.now();
//     if (now - this.cycleStats.minuteStartTime > 60000) { this.cycleStats.minuteStartTime = now; this.cycleStats.processedThisMinute = 0; return; }
//     const remaining = this.config.ACCOUNTS_PER_MINUTE - this.cycleStats.processedThisMinute;
//     if (remaining <= 0) {
//       const waitTime = 60000 - (now - this.cycleStats.minuteStartTime) + 1000;
//       this.emit('terminal', { type: 'warning', message: `🛡️ Rate limit cooldown: ${Math.round(waitTime / 1000)}s` });
//       await this.sleep(waitTime);
//       this.cycleStats.minuteStartTime = Date.now();
//       this.cycleStats.processedThisMinute = 0;
//     }
//   }

//   updateEnhancedStatistics(results) {
//     results.forEach(r => {
//       if (r.status === 'fulfilled' && r.value?.success) {
//         this.cycleStats.successCount++; this.cycleStats.cycleSuccessCount++;
//         if (r.value.confirmed) this.cycleStats.confirmedBets++;
//         else if (r.value.assumed) this.cycleStats.assumedBets++;
//       } else { this.cycleStats.failCount++; this.cycleStats.cycleFailCount++; }
//       this.cycleStats.processedThisMinute++;
//     });
//     this.emit('cycleUpdate', {
//       cyclesCompleted: this.currentCycle, totalCycles: this.totalCycles,
//       successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
//       confirmedBets: this.cycleStats.confirmedBets, totalBetAmount: this.cycleStats.totalBetAmount,
//       totalWinAmount: this.cycleStats.totalWinAmount,
//       cycleSuccessRate: (this.cycleStats.cycleSuccessCount / (this.cycleStats.cycleSuccessCount + this.cycleStats.cycleFailCount)) * 100 || 0,
//       cycleId: this.cycleState.cycleId, adaptiveStagger: this.adaptiveState.currentStaggerMs,
//       proxyEnabled: this.useProxy
//     });
//   }

//   startSecurityMonitor() {
//     const interval = setInterval(() => {
//       const speed = this.cycleStats.processedThisMinute;
//       const successRate = this.cycleStats.successCount / (this.cycleStats.successCount + this.cycleStats.failCount) * 100 || 0;
//       const avgLogin = this.adaptiveState.recentLoginTimes.length > 0
//         ? Math.round(this.adaptiveState.recentLoginTimes.reduce((a, b) => a + b, 0) / this.adaptiveState.recentLoginTimes.length) : 0;
//       const ipLabel = this.useProxy ? `proxy(${this.proxyIpKey})` : 'direct';

//       this.emit('terminal', {
//         type: 'info',
//         message: `🚀 [${this.instanceId}] ${speed}/min | ${successRate.toFixed(1)}% | Mem:${this.getMemoryUsage()}MB | Workers:${this.cycleState.activeWorkers} | AvgLogin:${avgLogin}ms | Stagger:${this.adaptiveState.currentStaggerMs}ms | IP:${ipLabel} | Sockets:${this.getGlobalSocketCount()}`
//       });
//       this.emit('status', {
//         running: this.isProcessing, speed: `${speed}/minute`, instanceId: this.instanceId,
//         successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
//         confirmedBets: this.cycleStats.confirmedBets, successRate: `${successRate.toFixed(1)}%`,
//         currentBet: this.getCurrentBetAmount(), totalBetAmount: this.cycleStats.totalBetAmount,
//         totalWinAmount: this.cycleStats.totalWinAmount,
//         cycle: this.currentCycle, cycleId: this.cycleState.cycleId,
//         activeConnections: this.connectionPool.size, activeWorkers: this.cycleState.activeWorkers,
//         memoryUsage: this.getMemoryUsage() + 'MB', avgLoginMs: avgLogin,
//         adaptiveStagger: this.adaptiveState.currentStaggerMs,
//         proxyEnabled: this.useProxy, proxyIpKey: this.proxyIpKey
//       });
//     }, 15000);
//     this.activeIntervals.add(interval);
//     this.securityInterval = interval;
//   }

//   // ---------------------------------------------------------------------------
//   // Utilities
//   // ---------------------------------------------------------------------------

//   safeWebSocketClose(ws, identifier = 'unknown') {
//     if (!ws) return;
//     try {
//       ws.removeAllListeners('open'); ws.removeAllListeners('message');
//       ws.removeAllListeners('error'); ws.removeAllListeners('close');
//       if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, `Cleanup ${identifier}`);
//       ws.onerror = null; ws.onclose = null; ws.onmessage = null; ws.onopen = null;
//     } catch (e) { console.warn(`Safe close error for ${identifier}:`, e.message); }
//   }

//   clearAllTimers() {
//     const secInt = this.securityInterval;
//     for (const i of this.activeIntervals) { if (i !== secInt) clearInterval(i); }
//     this.activeIntervals.clear();
//     if (secInt) this.activeIntervals.add(secInt);
//     for (const t of this.activeTimeouts) clearTimeout(t);
//     this.activeTimeouts.clear();
//   }

//   async completeCleanup() {
//     this.clearAllTimers();
//     for (const [k, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, k);
//     this.connectionPool.clear();
//     this.activeProcesses.clear();
//     if (global.gc) global.gc();
//     await this.sleep(100);
//   }

//   getMemoryUsage() { return Math.round(process.memoryUsage().heapUsed / 1024 / 1024); }

//   emitTerminalMessage(index, type, message) {
//     this.emit('terminal', { type, message: `[C${this.currentCycle}][${index}] ${message}`, timestamp: new Date().toISOString(), cycleId: this.cycleState.cycleId });
//   }

//   async stopProcessing() {
//     this.isProcessing = false; this.cycleState.isCycleActive = false;
//     await this.completeCleanup();
//     this.emit('terminal', { type: 'warning', message: `🛑 [${this.instanceId}] Processing stopped` });
//     this.emit('status', { running: false });
//     return { success: true, message: 'Processing stopped', finalBetConfig: this.getBetConfig(), cyclesCompleted: this.currentCycle };
//   }

//   completeProcessing() {
//     this.isProcessing = false; this.cycleState.isCycleActive = false;
//     this.clearAllTimers(); this.completeCleanup();
//     const total = this.cycleStats.successCount + this.cycleStats.failCount;
//     const rate = (this.cycleStats.successCount / total) * 100 || 0;
//     this.emit('terminal', { type: 'success', message: `\n🎉 [${this.instanceId}] PROCESSING COMPLETED!` });
//     this.emit('terminal', { type: 'info', message: `📈 Results: ${this.cycleStats.successCount}/${total} (${rate.toFixed(1)}%)` });
//     this.emit('terminal', { type: 'info', message: `🧹 Memory: ${this.getMemoryUsage()}MB` });
//     this.emit('completed', { successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount, confirmedBets: this.cycleStats.confirmedBets, totalProcessed: total, successRate: rate, totalBetAmount: this.cycleStats.totalBetAmount, totalWinAmount: this.cycleStats.totalWinAmount, finalBet: this.getCurrentBetAmount(), cyclesCompleted: this.currentCycle, finalMemory: this.getMemoryUsage() });
//     this.emit('status', { running: false });
//   }

//   createLoginPayload(account) { return { account: account.username, password: account.password, version: this.config.GAME_VERSION, mainID: 100, subID: 6 }; }
//   createEnterGamePayload(account) { return { mainID: 1, subID: 5, userid: account.userid, password: account.dynamicpass }; }
//   createJoinGamePayload(account) { return { mainID: 1, subID: 4, gameid: account.gameid || 10658796, password: account.dynamicpass, reenter: 0 }; }
//   createJoinTablePayload(account) { return { mainID: 1, subID: 6, bossid: account.bossid }; }
//   createGameInitPayload() { return { route: 31, mainID: 200, subID: 100 }; }

//   sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

//   getRandomFingerprint() { const fp = this.deviceFingerprints[Math.floor(Math.random() * this.deviceFingerprints.length)]; return { ...fp, timezone: this.getRandomTimezone(), language: this.getRandomLanguage() }; }
//   getRandomTimezone() { const tz = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles']; return tz[Math.floor(Math.random() * tz.length)]; }
//   getRandomLanguage() { const l = ['en-US','en-CA','en-GB','en-AU']; return l[Math.floor(Math.random() * l.length)]; }
//   getRandomUserAgent() { return this.mobileUserAgents[Math.floor(Math.random() * this.mobileUserAgents.length)]; }
//   getRandomHeaders() { return this.headerVariations[Math.floor(Math.random() * this.headerVariations.length)]; }

//   getNextProxy() {
//     if (!this.useProxy || this.proxyList.length === 0) return null;
//     const proxy = this.proxyList[this.currentProxyIndex % this.proxyList.length];
//     this.currentProxyIndex++;
//     return proxy;
//   }

//   getEnhancedRandomDelay() {
//     const base = Math.floor(Math.random() * (this.config.RANDOM_DELAYS.MAX - this.config.RANDOM_DELAYS.MIN) + this.config.RANDOM_DELAYS.MIN);
//     return base + Math.floor(Math.random() * 1000);
//   }
// }

// module.exports = UltimateRouletteProcessor;


const WebSocket = require('ws');
const EventEmitter = require('events');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { v4: uuidv4 } = require('uuid');

class UltimateRouletteProcessor extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.isProcessing = false;
    this.currentAccounts = [];
    this.activeProcesses = new Map();
    this.connectionPool = new Map();
    this.activeIntervals = new Set();
    this.activeTimeouts = new Set();

    // Set by main.js
    this.instanceId = 'default';
    this.globalCoordinator = null;

    // Proxy settings (set by main.js from proxyConfig)
    this.useProxy = false;
    this.proxyList = [];
    this.currentProxyIndex = 0;

    // IP key for the global socket coordinator bucket.
    // 'direct' = real IP (shared across all non-proxy profiles)
    // 'proxy_host_port' = a unique bucket per proxy IP
    this.proxyIpKey = 'direct';

    this.config = {
      LOGIN_WS_URL: 'wss://game.milkywayapp.xyz:7878/',
      SUPER_ROULETTE_WS_URL: 'wss://game.milkywayapp.xyz:10152/',
      GAME_VERSION: '2.0.1',

      CONCURRENT_WORKERS: 10,

      // With a dedicated proxy, each profile has its own IP bucket in the
      // GlobalSocketCoordinator — it can run up to MAX_PER_IP=10 concurrent
      // sockets independently of other profiles, so batch size can be larger.
      // Without a proxy the direct-IP bucket is shared; smaller batch is safer.
      // Both values are overridden dynamically in startProcessing() based on
      // whether a proxy is active.
      BATCH_SIZE: 4,              // Default: no proxy (safe for shared IP)
      BATCH_SIZE_PROXY: 8,        // With proxy: each profile has its own IP

      ACCOUNTS_PER_MINUTE: 60,

      COMPLETE_RESET_BETWEEN_CYCLES: true,
      MAX_CONNECTIONS_PER_CYCLE: 200,

      BATCH_DELAY_MS: 400,
      BATCH_DELAY_MS_PROXY: 200, // Faster batches when proxy isolates IP
      RETRY_ATTEMPTS: 0,

      RANDOM_DELAYS: { MIN: 150, MAX: 400 },
      CYCLE_DELAY: { MIN: 500, MAX: 1000 },

      TIMEOUTS: {
        LOGIN: 22000,
        GAME_CONNECTION: 8000,
        ENTER_GAME: 8000,
        JOIN_GAME: 8000,
        BET_RESPONSE: 8000,
        GAME_READY: 10000
      },

      BATCH_STAGGER_MS: 200,
      BATCH_STAGGER_MS_PROXY: 120,  // Tighter stagger OK when IP is isolated
    };

    this.adaptiveState = {
      recentLoginTimes: [],
      maxRecentSamples: 8,
      currentStaggerMs: this.config.BATCH_STAGGER_MS,
      currentBatchDelayMs: this.config.BATCH_DELAY_MS,
      SLOW_THRESHOLD_MS: 8000,
      FAST_THRESHOLD_MS: 4500,
      MAX_STAGGER_MS: 400,
      MIN_STAGGER_MS: 100,
      MAX_BATCH_DELAY_MS: 1500,
      MIN_BATCH_DELAY_MS: 200,
      BACKOFF_STEP: 50,
      RECOVER_STEP: 75,
      consecutiveSlowBatches: 0,
      IP_BLOCK_THRESHOLD_MS: 20000,
      IP_BLOCK_COOLDOWN_MS: 75000,
      isIPBlocked: false,
      ipBlockedAt: 0,
    };

    this.cycleState = this.createFreshCycleState();
    this.betConfig = {
      totalBet: 20, isDynamic: false, dynamicAmount: 0,
      splitBets: true, minBet: 1, maxBet: 1000,
      betStrategy: 'martingale', betHistory: []
    };

    this.mobileUserAgents = this.generateRealisticUserAgents();
    this.deviceFingerprints = this.generateAdvancedFingerprints();
    this.headerVariations = this.generateHeaderVariations();
    this.cycleStats = this.createFreshCycleStats();
  }

  // ---------------------------------------------------------------------------
  // Proxy agent factory
  // For http:// proxies we use hpagent.HttpsProxyAgent — a pure CommonJS
  // package that issues HTTP CONNECT to tunnel wss:// WebSocket connections.
  // For socks5:// / socks5h:// / socks4:// we use socks-proxy-agent as before.
  // ---------------------------------------------------------------------------
  _makeProxyAgent(proxyUrl) {
    if (!proxyUrl) return null;
    if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
      // hpagent is CommonJS-compatible and purpose-built for HTTP/HTTPS proxying
      const { HttpsProxyAgent } = require('hpagent');
      return new HttpsProxyAgent({ proxy: proxyUrl });
    }
    const { SocksProxyAgent } = require('socks-proxy-agent');
    return new SocksProxyAgent(proxyUrl);
  }

  // ---------------------------------------------------------------------------
  // Socket coordinator — uses per-IP buckets
  // ---------------------------------------------------------------------------

  _getIpKey() {
    // Use assigned proxyIpKey if proxy is active; else share 'direct' bucket
    return (this.useProxy && this.proxyIpKey && this.proxyIpKey !== 'direct')
      ? this.proxyIpKey
      : 'direct';
  }

  async acquireSocket() {
    const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
    if (coordinator) await coordinator.acquire(this._getIpKey());
  }

  releaseSocket() {
    const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
    if (coordinator) coordinator.release(this._getIpKey());
  }

  getGlobalSocketCount() {
    const coordinator = this.globalCoordinator || global.GlobalSocketCoordinator;
    if (!coordinator) return this.connectionPool.size;
    return coordinator.getCount(this._getIpKey());
  }

  // ---------------------------------------------------------------------------
  // Adaptive backoff — skips IP-block cooldown when proxy is active
  // (each proxy is its own IP; being blocked on one doesn't affect others)
  // ---------------------------------------------------------------------------

  recordLoginTime(loginTimeMs) {
    const state = this.adaptiveState;
    state.recentLoginTimes.push(loginTimeMs);
    if (state.recentLoginTimes.length > state.maxRecentSamples) state.recentLoginTimes.shift();
    if (state.recentLoginTimes.length < 3) return;

    const avg = state.recentLoginTimes.reduce((a, b) => a + b, 0) / state.recentLoginTimes.length;

    // IP-block detection — only meaningful when NOT using a proxy.
    // With a proxy, slow logins mean the proxy itself is slow, not a block.
    if (!this.useProxy && avg >= state.IP_BLOCK_THRESHOLD_MS && !state.isIPBlocked) {
      state.isIPBlocked = true;
      state.ipBlockedAt = Date.now();
      this.emit('terminal', {
        type: 'error',
        message: `🚫 [${this.instanceId}] IP RATE LIMITED! Avg login ${Math.round(avg)}ms. Cooling down ${state.IP_BLOCK_COOLDOWN_MS / 1000}s... (Add a proxy to avoid this pause)`
      });
      state.recentLoginTimes = [];
      return;
    }

    if (state.isIPBlocked && !this.useProxy) {
      if (Date.now() - state.ipBlockedAt >= state.IP_BLOCK_COOLDOWN_MS) {
        state.isIPBlocked = false;
        state.recentLoginTimes = [];
        state.currentStaggerMs = state.MAX_STAGGER_MS;
        state.currentBatchDelayMs = state.MAX_BATCH_DELAY_MS;
        this.emit('terminal', { type: 'info', message: `✅ [${this.instanceId}] IP cooldown complete. Resuming...` });
      }
      return;
    }

    const prevStagger = state.currentStaggerMs;
    const prevDelay = state.currentBatchDelayMs;

    if (avg > state.SLOW_THRESHOLD_MS) {
      state.consecutiveSlowBatches++;
      state.currentStaggerMs = Math.min(state.MAX_STAGGER_MS, state.currentStaggerMs + state.BACKOFF_STEP);
      state.currentBatchDelayMs = Math.min(state.MAX_BATCH_DELAY_MS, state.currentBatchDelayMs + (state.BACKOFF_STEP * 2));
    } else if (avg < state.FAST_THRESHOLD_MS) {
      state.consecutiveSlowBatches = 0;
      state.currentStaggerMs = Math.max(state.MIN_STAGGER_MS, state.currentStaggerMs - state.RECOVER_STEP);
      state.currentBatchDelayMs = Math.max(state.MIN_BATCH_DELAY_MS, state.currentBatchDelayMs - (state.RECOVER_STEP * 2));
    } else {
      state.consecutiveSlowBatches = 0;
    }

    if (state.currentStaggerMs !== prevStagger || state.currentBatchDelayMs !== prevDelay) {
      const dir = state.currentStaggerMs > prevStagger ? '⬆️ Backing off' : '⬇️ Recovering';
      this.emit('terminal', {
        type: state.currentStaggerMs > prevStagger ? 'warning' : 'info',
        message: `⚡ [${this.instanceId}] Adaptive ${dir}: avg ${Math.round(avg)}ms → stagger ${state.currentStaggerMs}ms, delay ${state.currentBatchDelayMs}ms`
      });
    }
  }

  // ---------------------------------------------------------------------------
  // State factories
  // ---------------------------------------------------------------------------

  createFreshCycleState() {
    return { cycleStartTime: 0, activeWorkers: 0, processedThisCycle: 0, connectionsThisCycle: 0, isCycleActive: false, cycleId: uuidv4().substring(0, 8) };
  }

  createFreshCycleStats() {
    return { successCount: 0, failCount: 0, confirmedBets: 0, assumedBets: 0, processedThisMinute: 0, minuteStartTime: Date.now(), totalBetAmount: 0, totalWinAmount: 0, cycleSuccessCount: 0, cycleFailCount: 0 };
  }

  // ---------------------------------------------------------------------------
  // Bet management
  // ---------------------------------------------------------------------------

  updateBetConfig(newConfig) {
    if (!newConfig) return false;
    if (newConfig.totalBet !== undefined) this.betConfig.totalBet = Math.max(this.betConfig.minBet, Math.min(this.betConfig.maxBet, newConfig.totalBet));
    if (newConfig.dynamicAmount !== undefined) this.betConfig.dynamicAmount = Math.max(this.betConfig.minBet, Math.min(this.betConfig.maxBet, newConfig.dynamicAmount));
    if (newConfig.isDynamic !== undefined) this.betConfig.isDynamic = newConfig.isDynamic;
    if (newConfig.splitBets !== undefined) this.betConfig.splitBets = newConfig.splitBets;
    if (newConfig.betStrategy !== undefined) this.betConfig.betStrategy = newConfig.betStrategy;
    this.emit('terminal', { type: 'info', message: `🎯 Bet updated: ${this.getCurrentBetAmount()}` });
    this.emit('betConfigChanged', { totalBet: this.betConfig.totalBet, dynamicAmount: this.betConfig.dynamicAmount, currentBet: this.getCurrentBetAmount(), isDynamic: this.betConfig.isDynamic, splitBets: this.betConfig.splitBets, betStrategy: this.betConfig.betStrategy });
    return true;
  }

  getCurrentBetAmount() {
    if (this.betConfig.isDynamic && this.betConfig.dynamicAmount > 0) return this.betConfig.dynamicAmount;
    return this.betConfig.totalBet;
  }

  handleBetChange(newAmount) {
    const amount = parseInt(newAmount);
    if (isNaN(amount) || amount < this.betConfig.minBet || amount > this.betConfig.maxBet) {
      this.emit('betError', { message: `Invalid bet: ${newAmount}` }); return false;
    }
    const old = this.getCurrentBetAmount();
    this.updateBetConfig({ isDynamic: true, dynamicAmount: amount });
    this.emit('terminal', { type: 'success', message: `✅ Bet changed: ${old} → ${amount}` });
    return true;
  }

  resetToDefaultBet() {
    this.updateBetConfig({ isDynamic: false, dynamicAmount: 0 });
    this.emit('terminal', { type: 'info', message: `🔄 Bet reset: ${this.getCurrentBetAmount()}` });
    return this.getCurrentBetAmount();
  }

  getBetConfig() {
    return { ...this.betConfig, currentBet: this.getCurrentBetAmount(), totalBetsPlaced: this.cycleStats.totalBetAmount, totalWins: this.cycleStats.totalWinAmount };
  }

  createBetPayload() {
    const amount = this.getCurrentBetAmount();
    let firstBet = amount, secondBet = amount;
    if (this.betConfig.splitBets && amount > 1) { firstBet = Math.floor(amount / 2); secondBet = amount - firstBet; }
    this.cycleStats.totalBetAmount += amount;
    this.betConfig.betHistory.push({ amount, timestamp: new Date().toISOString(), split: this.betConfig.splitBets, firstBet, secondBet });
    if (this.betConfig.betHistory.length > 100) this.betConfig.betHistory = this.betConfig.betHistory.slice(-100);
    this.emit('betUpdate', { currentBet: amount, totalBetsPlaced: this.cycleStats.totalBetAmount, split: { firstBet, secondBet } });
    this.emitTerminalMessage(0, 'debug', `💰 Betting: ${amount} (Split: ${firstBet}/${secondBet})`);
    return {
      totalBetValue: amount,
      betData: (() => { const d = [0]; for (let i = 1; i <= 36; i++) d.push(amount); return d; })(),
      singleDigitBet: new Array(37).fill(0),
      detailBet: [
        [{ "id": [2,4,6,8,11,10,13,15,17,20,22,24,26,29,28,31,33,35], "bet": firstBet }],
        [{ "id": [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36], "bet": secondBet }]
      ],
      route: 39, mainID: 200, subID: 100
    };
  }

  updateBetStats(winAmount) {
    if (winAmount && winAmount > 0) {
      this.cycleStats.totalWinAmount += winAmount;
      this.emit('betUpdate', { winAmount, totalWins: this.cycleStats.totalWinAmount, netProfit: this.cycleStats.totalWinAmount - this.cycleStats.totalBetAmount });
      this.emit('terminal', { type: 'success', message: `💰 Win: ${winAmount} | Total Wins: ${this.cycleStats.totalWinAmount}` });
    }
  }

  // ---------------------------------------------------------------------------
  // User agents / fingerprints / headers
  // ---------------------------------------------------------------------------

  generateRealisticUserAgents() {
    return [
      'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; SM-F936B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    ];
  }

  generateAdvancedFingerprints() {
    return [
      { deviceId: "SM-S928B", model: "Galaxy S24 Ultra", resolution: "1440x3120", viewport: "412x915", pixelRatio: 3.5, language: "en-US", timezone: "America/New_York" },
      { deviceId: "Pixel 8 Pro", model: "Pixel 8 Pro", resolution: "1344x2992", viewport: "412x892", pixelRatio: 3.0, language: "en-US", timezone: "America/Los_Angeles" },
      { deviceId: "iPhone16,2", model: "iPhone 15 Pro", resolution: "1290x2796", viewport: "390x844", pixelRatio: 3.0, language: "en-US", timezone: "America/Chicago" }
    ];
  }

  generateHeaderVariations() {
    return [
      { 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      { 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.8', 'Accept-Encoding': 'gzip, deflate', 'Cache-Control': 'no-cache' },
      { 'Accept': 'application/json, text/javascript, */*', 'Accept-Language': 'en-US,en;q=0.7', 'Accept-Encoding': 'gzip, deflate, br', 'Pragma': 'no-cache' }
    ];
  }

  // ---------------------------------------------------------------------------
  // Processing lifecycle
  // ---------------------------------------------------------------------------

  async resetForNextCycle() {
    for (const [key, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, key);
    this.connectionPool.clear();
    this.activeProcesses.clear();
    this.clearAllTimers();
    this.cycleState = this.createFreshCycleState();
    this.cycleStats = this.createFreshCycleStats();
    this.currentProxyIndex = 0;
    if (global.gc) { for (let i = 0; i < 2; i++) { global.gc(); await this.sleep(100); } }
    await this.sleep(300);
    return { success: true, memoryMB: this.getMemoryUsage(), cycleId: this.cycleState.cycleId };
  }

  async startProcessing(accountIds, repetitions = 1, useProxy = false, proxyList = []) {
    if (this.isProcessing) throw new Error('Processing already in progress');

    await this.completeCleanup();
    this.isProcessing = true;
    this.useProxy = useProxy;
    this.proxyList = proxyList;
    this.currentProxyIndex = 0;

    // Set effective batch size and stagger based on proxy availability.
    // With a proxy each profile is a separate IP → can run more concurrent.
    this._effectiveBatchSize = useProxy ? this.config.BATCH_SIZE_PROXY : this.config.BATCH_SIZE;
    this._effectiveBatchDelay = useProxy ? this.config.BATCH_DELAY_MS_PROXY : this.config.BATCH_DELAY_MS;
    this._effectiveStagger = useProxy ? this.config.BATCH_STAGGER_MS_PROXY : this.config.BATCH_STAGGER_MS;

    // Sync adaptive state minimums to effective values
    this.adaptiveState.MIN_STAGGER_MS = useProxy ? 80 : 150;
    this.adaptiveState.MIN_BATCH_DELAY_MS = useProxy ? 150 : 300;
    this.adaptiveState.currentStaggerMs = this._effectiveStagger;
    this.adaptiveState.currentBatchDelayMs = this._effectiveBatchDelay;

    const accounts = await this.db.getAllAccounts();
    this.currentAccounts = accounts.filter(acc => accountIds.includes(acc.id));
    this.totalCycles = Math.max(1, Math.min(50, parseInt(repetitions) || 1));
    this.currentCycle = 0;

    this.connectionPool.clear();
    this.activeProcesses.clear();
    this.clearAllTimers();
    this.cycleState = this.createFreshCycleState();
    this.cycleStats = this.createFreshCycleStats();
    this.adaptiveState.recentLoginTimes = [];
    this.adaptiveState.isIPBlocked = false;
    this.adaptiveState.consecutiveSlowBatches = 0;

    const proxyStatus = useProxy
      ? `🌐 Proxy: ${this.proxyIpKey} (${proxyList.length} proxies) — dedicated IP, no shared limit`
      : `🔗 Direct IP — shared with other profiles, conservative limits apply`;

    this.emit('terminal', { type: 'info', message: `⚡ [${this.instanceId}] SPEED BOT ACTIVATED` });
    this.emit('terminal', { type: 'info', message: `📋 Accounts: ${this.currentAccounts.length}` });
    this.emit('terminal', { type: 'info', message: `🎯 Bet: ${this.getCurrentBetAmount()}` });
    this.emit('terminal', { type: 'info', message: proxyStatus });
    this.emit('terminal', { type: 'info', message: `🚀 Batch size: ${this._effectiveBatchSize} | Stagger: ${this._effectiveStagger}ms | Delay: ${this._effectiveBatchDelay}ms` });

    this.startSecurityMonitor();
    this.processAllCycles();

    return {
      started: true, totalAccounts: this.currentAccounts.length,
      currentBet: this.getCurrentBetAmount(), instanceId: this.instanceId,
      proxyEnabled: useProxy, effectiveBatchSize: this._effectiveBatchSize,
      cycleId: this.cycleState.cycleId
    };
  }

  async processAllCycles() {
    for (let cycle = 1; cycle <= this.totalCycles && this.isProcessing; cycle++) {
      this.currentCycle = cycle;
      if (this.config.COMPLETE_RESET_BETWEEN_CYCLES) await this.resetForNextCycle();

      this.cycleState.cycleStartTime = Date.now();
      this.cycleState.isCycleActive = true;
      this.cycleState.cycleId = uuidv4().substring(0, 8);
      this.cycleStats = this.createFreshCycleStats();

      const proxyLabel = this.useProxy ? ` [PROXY: ${this.proxyIpKey}]` : ' [DIRECT IP]';
      this.emit('terminal', { type: 'info', message: `\n🔰 CYCLE ${cycle}/${this.totalCycles} [${this.instanceId}]${proxyLabel}` });
      this.emit('cycleStart', { cycle, totalCycles: this.totalCycles, currentBet: this.getCurrentBetAmount(), startTime: Date.now(), cycleId: this.cycleState.cycleId });

      await this.processSingleCycle();

      const cycleDuration = Date.now() - this.cycleState.cycleStartTime;
      this.emit('cycleComplete', { cycle, totalCycles: this.totalCycles, successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount, cycleDuration, memoryUsage: this.getMemoryUsage(), cycleId: this.cycleState.cycleId });
      this.cycleState.isCycleActive = false;
      this.cycleState.activeWorkers = 0;

      if (cycle < this.totalCycles && this.isProcessing) {
        const delay = this.getEnhancedRandomDelay();
        this.emit('terminal', { type: 'info', message: `⏳ Waiting ${delay}ms before next cycle...` });
        await this.sleep(delay);
      }
    }
    this.completeProcessing();
  }

  async processSingleCycle() {
    const totalAccounts = this.currentAccounts.length;
    let processed = 0;

    while (processed < totalAccounts && this.isProcessing && this.cycleState.isCycleActive) {
      await this.checkEnhancedRateLimit();

      // IP-block cooldown — only for direct IP connections, never for proxy profiles
      if (!this.useProxy) {
        while (this.adaptiveState.isIPBlocked && this.isProcessing) {
          const elapsed = Date.now() - this.adaptiveState.ipBlockedAt;
          const remaining = Math.max(0, this.adaptiveState.IP_BLOCK_COOLDOWN_MS - elapsed);
          if (remaining <= 0) {
            this.adaptiveState.isIPBlocked = false;
            this.adaptiveState.recentLoginTimes = [];
            this.adaptiveState.currentStaggerMs = this.adaptiveState.MAX_STAGGER_MS;
            this.adaptiveState.currentBatchDelayMs = this.adaptiveState.MAX_BATCH_DELAY_MS;
            this.emit('terminal', { type: 'info', message: `✅ [${this.instanceId}] IP cooldown done, resuming...` });
            break;
          }
          this.emit('terminal', { type: 'warning', message: `🚫 [${this.instanceId}] IP blocked. Waiting ${Math.round(remaining / 1000)}s... (Tip: set a proxy to skip this)` });
          await this.sleep(5000);
        }
        if (!this.isProcessing || !this.cycleState.isCycleActive) break;
      }

      const batchSize = Math.min(this._effectiveBatchSize, totalAccounts - processed);
      const batchAccounts = this.currentAccounts.slice(processed, processed + batchSize);

      const ipLabel = this.useProxy ? `${this.proxyIpKey}` : 'direct';
      this.emit('terminal', {
        type: 'info',
        message: `🚀 Batch ${processed + 1}-${processed + batchSize} [${this.instanceId}] | IP: ${ipLabel} | Stagger: ${this.adaptiveState.currentStaggerMs}ms | Sockets: ${this.getGlobalSocketCount()}`
      });

      const currentStagger = this.adaptiveState.currentStaggerMs;
      const batchPromises = batchAccounts.map((account, index) =>
        this.sleep(index * currentStagger).then(() =>
          this.processAccountWithEnhancedSecurity(account, processed + index)
        )
      );

      const results = await Promise.allSettled(batchPromises);
      this.updateEnhancedStatistics(results);
      processed += batchSize;
      this.cycleState.processedThisCycle = processed;

      this.emit('cycleProgress', {
        processed, total: totalAccounts, currentCycle: this.currentCycle, totalCycles: this.totalCycles,
        successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
        batchPerformance: { batchSize, successRate: results.filter(r => r.status === 'fulfilled' && r.value?.success).length / batchSize * 100 },
        adaptiveStagger: this.adaptiveState.currentStaggerMs, proxyEnabled: this.useProxy
      });

      if (processed < totalAccounts) await this.sleep(this.adaptiveState.currentBatchDelayMs);
    }

    await this.cleanupCycleConnections();
  }

  async cleanupCycleConnections() {
    if (this.connectionPool.size > 0) {
      for (const [key, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, key);
      this.connectionPool.clear();
      await this.sleep(100);
    }
  }

  async processAccountWithEnhancedSecurity(account, globalIndex) {
    const processId = uuidv4();
    this.activeProcesses.set(processId, account.username);
    this.cycleState.activeWorkers++;
    this.cycleState.connectionsThisCycle++;

    try {
      this.emit('status', {
        running: true, total: this.currentAccounts.length, current: globalIndex + 1,
        activeWorkers: this.cycleState.activeWorkers, currentAccount: account.username,
        speed: `${this.cycleStats.processedThisMinute}/minute`, instanceId: this.instanceId,
        currentBet: this.getCurrentBetAmount(), cycle: this.currentCycle, cycleId: this.cycleState.cycleId,
        proxyEnabled: this.useProxy
      });

      const result = await this.ultraSecureAccountProcessing(account, globalIndex);

      if (result.success) {
        if (result.winCredit && result.winCredit > 0) this.updateBetStats(result.winCredit);
        await this.db.updateAccount({
          ...account, score: result.newBalance || account.score,
          last_processed: new Date().toISOString(),
          last_bet_amount: this.getCurrentBetAmount(),
          total_bets: (account.total_bets || 0) + 1,
          total_wins: (account.total_wins || 0) + (result.winCredit > 0 ? 1 : 0)
        });
        await this.db.addProcessingLog(account.id, result.confirmed ? 'confirmed_success' : 'assumed_success',
          result.confirmed ? 'Bet confirmed' : 'Bet assumed successful',
          { ...result, cycle: this.currentCycle, cycleId: this.cycleState.cycleId, timestamp: new Date().toISOString(), betAmount: this.getCurrentBetAmount(), winAmount: result.winCredit || 0, duration: result.duration || 0 }
        );
      }

      this.emit('progress', {
        index: globalIndex, total: this.currentAccounts.length, account: account.username,
        success: result.success, confirmed: result.confirmed, error: result.error,
        stats: { ...this.cycleStats }, betAmount: this.getCurrentBetAmount(), winAmount: result.winCredit || 0,
        cycle: this.currentCycle, cycleId: this.cycleState.cycleId
      });

      return result;
    } catch (error) {
      this.emitTerminalMessage(globalIndex, 'error', `🛡️ Error: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      this.cycleState.activeWorkers--;
      this.activeProcesses.delete(processId);
    }
  }

  async ultraSecureAccountProcessing(account, index) {
    const sessionId = uuidv4();
    const fingerprint = this.getRandomFingerprint();
    const userAgent = this.getRandomUserAgent();
    const headers = this.getRandomHeaders();
    const proxy = this.getNextProxy();
    const startTime = Date.now();

    this.emitTerminalMessage(index, 'info', `🛡️ Session: ${sessionId.substring(0, 8)} (Cycle ${this.currentCycle})`);

    try {
      const loginResult = await this.enhancedLogin(account, userAgent, headers, proxy, index);
      if (!loginResult.success) throw new Error(`Login failed: ${loginResult.error}`);
      if (loginResult.loginTime) this.recordLoginTime(loginResult.loginTime);

      Object.assign(account, loginResult.accountData);
      account.sessionId = sessionId;

      const gameResult = await this.guaranteedGameFlow(account, userAgent, headers, proxy, index, sessionId);
      return { ...gameResult, sessionId, fingerprint: fingerprint.deviceId, duration: Date.now() - startTime, cycleId: this.cycleState.cycleId };
    } catch (error) {
      this.recordLoginTime(this.config.TIMEOUTS.LOGIN);
      return { success: false, error: error.message, sessionId, fingerprint: fingerprint?.deviceId, cycleId: this.cycleState.cycleId };
    }
  }

  async enhancedLogin(account, userAgent, headers, proxy, index) {
    await this.acquireSocket();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeTimeouts.delete(timeout);
        this.releaseSocket();
        reject(new Error('Enhanced login timeout'));
      }, this.config.TIMEOUTS.LOGIN);
      this.activeTimeouts.add(timeout);

      const wsOptions = { handshakeTimeout: 10000, headers: { 'User-Agent': userAgent, 'Origin': 'http://localhost', ...headers } };
      if (proxy) {
        wsOptions.agent = this._makeProxyAgent(proxy);
        this.emitTerminalMessage(index, 'debug', `🔌 Proxy: ${proxy.replace(/\/\/.*@/, '//*@')}`);
      }

      const loginWs = new WebSocket(this.config.LOGIN_WS_URL, ['wl'], wsOptions);
      const connectionKey = `login_${account.username}_${this.cycleState.cycleId}_${Date.now()}`;
      this.connectionPool.set(connectionKey, loginWs);

      let loginCompleted = false;
      const loginStartTime = Date.now();

      const cleanup = (resolveValue, rejectErr) => {
        if (loginCompleted) return;
        loginCompleted = true;
        clearTimeout(timeout);
        this.activeTimeouts.delete(timeout);
        this.safeWebSocketClose(loginWs, connectionKey);
        this.connectionPool.delete(connectionKey);
        this.releaseSocket();
        if (rejectErr) reject(rejectErr); else resolve(resolveValue);
      };

      loginWs.on('open', () => {
        this.emitTerminalMessage(index, 'debug', `🔐 Login handshake`);
        loginWs.send(JSON.stringify(this.createLoginPayload(account)));
      });
      loginWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.mainID === 100 && msg.subID === 116 && msg.data?.result === 0) {
            const loginTime = Date.now() - loginStartTime;
            this.emitTerminalMessage(index, 'success', `✅ Login (${loginTime}ms)`);
            cleanup({ success: true, accountData: { userid: msg.data.userid, dynamicpass: msg.data.dynamicpass, bossid: msg.data.bossid, gameid: msg.data.gameid, score: msg.data.score, nickname: msg.data.nickname }, loginTime });
          }
          if (msg.mainID === 100 && msg.subID === 116 && msg.data?.result !== 0) {
            cleanup({ success: false, error: `Login rejected: ${msg.data?.result}` });
          }
        } catch (_) {}
      });
      loginWs.on('error', (err) => { this.emitTerminalMessage(index, 'error', `🔐 Login error: ${err.message}`); cleanup(null, err); });
      loginWs.on('close', () => { if (!loginCompleted) cleanup({ success: false, error: 'Login connection closed unexpectedly' }); });
    });
  }

  async guaranteedGameFlow(account, userAgent, headers, proxy, index, sessionId) {
    await this.acquireSocket();

    return new Promise((resolve) => {
      const gameStartTime = Date.now();
      let gameWs = null, betConfirmed = false, balanceChanged = false;
      let heartbeatInterval = null, mainTimeout = null, isFinalized = false;
      const connectionKey = `game_${account.username}_${this.cycleState.cycleId}_${sessionId}`;

      const finalize = (result) => {
        if (isFinalized) return;
        isFinalized = true;
        if (heartbeatInterval) { clearInterval(heartbeatInterval); this.activeIntervals.delete(heartbeatInterval); heartbeatInterval = null; }
        if (mainTimeout) { clearTimeout(mainTimeout); this.activeTimeouts.delete(mainTimeout); mainTimeout = null; }
        if (gameWs) { this.safeWebSocketClose(gameWs, connectionKey); this.connectionPool.delete(connectionKey); gameWs = null; }
        this.releaseSocket();
        this.emitTerminalMessage(index, 'debug', `⏱️ Session: ${Date.now() - gameStartTime}ms`);
        resolve(result);
      };

      mainTimeout = setTimeout(() => {
        if (!betConfirmed && !isFinalized) {
          this.emitTerminalMessage(index, 'warning', `⏰ Timeout (${this.config.TIMEOUTS.BET_RESPONSE}ms)`);
          finalize({ success: balanceChanged, confirmed: false, assumed: balanceChanged, newBalance: account.score, timeout: true });
        }
      }, this.config.TIMEOUTS.BET_RESPONSE + 6000);
      this.activeTimeouts.add(mainTimeout);

      const wsOptions = { handshakeTimeout: 8000, headers: { 'User-Agent': userAgent, 'Origin': 'http://localhost', ...headers } };
      if (proxy) wsOptions.agent = this._makeProxyAgent(proxy);

      gameWs = new WebSocket(this.config.SUPER_ROULETTE_WS_URL, ['wl'], wsOptions);
      this.connectionPool.set(connectionKey, gameWs);

      gameWs.on('error', (err) => { if (!isFinalized) { this.emitTerminalMessage(index, 'error', `🎮 WS Error: ${err.message}`); finalize({ success: balanceChanged, confirmed: false, error: err.message, newBalance: account.score }); } });
      gameWs.on('close', (code) => { if (!isFinalized) { this.emitTerminalMessage(index, 'debug', `🎮 WS Closed: ${code}`); finalize({ success: balanceChanged, confirmed: false, assumed: balanceChanged, newBalance: account.score, closedEarly: true }); } });

      gameWs.on('open', () => {
        this.emitTerminalMessage(index, 'success', `🎮 Connected`);
        const send = (payload, desc, delay = 0) => setTimeout(() => {
          if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) {
            this.emitTerminalMessage(index, 'debug', `📤 ${desc}`);
            gameWs.send(JSON.stringify(payload));
          }
        }, delay);

        send(this.createEnterGamePayload(account), 'Enter', 100);
        send(this.createJoinGamePayload(account), 'Join', 500);
        send(this.createGameInitPayload(), 'Init', 1000);

        heartbeatInterval = setInterval(() => {
          if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) gameWs.send(JSON.stringify(this.createJoinTablePayload(account)));
          else { if (heartbeatInterval) { clearInterval(heartbeatInterval); this.activeIntervals.delete(heartbeatInterval); heartbeatInterval = null; } }
        }, 5000);
        this.activeIntervals.add(heartbeatInterval);

        send(this.createJoinTablePayload(account), 'Table', 1500);
        setTimeout(() => {
          if (gameWs && gameWs.readyState === WebSocket.OPEN && !isFinalized) {
            this.emitTerminalMessage(index, 'info', `🎯 Betting ${this.getCurrentBetAmount()}...`);
            gameWs.send(JSON.stringify(this.createBetPayload()));
          }
        }, 2000);
      });

      gameWs.on('message', (raw) => {
        if (isFinalized) return;
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.mainID === 1 && msg.subID === 104 && msg.data?.score) {
            if (msg.data.score !== account.score) { balanceChanged = true; account.score = msg.data.score; }
          }
          if (msg.mainID === 200 && msg.subID === 100 && msg.data?.route === 39) {
            betConfirmed = true;
            if (mainTimeout) { clearTimeout(mainTimeout); this.activeTimeouts.delete(mainTimeout); mainTimeout = null; }
            const winCredit = msg.data.winCredit || 0;
            const playerCredit = msg.data.playerCredit || account.score;
            account.score = playerCredit;
            this.emitTerminalMessage(index, 'success', `🎉 CONFIRMED! Win: ${winCredit}, Balance: ${playerCredit}`);
            this.emit('betUpdate', { winAmount: winCredit, totalWins: this.cycleStats.totalWinAmount + winCredit, currentBet: this.getCurrentBetAmount() });
            finalize({ success: true, confirmed: true, newBalance: playerCredit, winCredit, betConfirmed: true });
          }
        } catch (_) {}
      });
    });
  }

  async checkEnhancedRateLimit() {
    const now = Date.now();
    if (now - this.cycleStats.minuteStartTime > 60000) { this.cycleStats.minuteStartTime = now; this.cycleStats.processedThisMinute = 0; return; }
    const remaining = this.config.ACCOUNTS_PER_MINUTE - this.cycleStats.processedThisMinute;
    if (remaining <= 0) {
      const waitTime = 60000 - (now - this.cycleStats.minuteStartTime) + 1000;
      this.emit('terminal', { type: 'warning', message: `🛡️ Rate limit cooldown: ${Math.round(waitTime / 1000)}s` });
      await this.sleep(waitTime);
      this.cycleStats.minuteStartTime = Date.now();
      this.cycleStats.processedThisMinute = 0;
    }
  }

  updateEnhancedStatistics(results) {
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value?.success) {
        this.cycleStats.successCount++; this.cycleStats.cycleSuccessCount++;
        if (r.value.confirmed) this.cycleStats.confirmedBets++;
        else if (r.value.assumed) this.cycleStats.assumedBets++;
      } else { this.cycleStats.failCount++; this.cycleStats.cycleFailCount++; }
      this.cycleStats.processedThisMinute++;
    });
    this.emit('cycleUpdate', {
      cyclesCompleted: this.currentCycle, totalCycles: this.totalCycles,
      successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
      confirmedBets: this.cycleStats.confirmedBets, totalBetAmount: this.cycleStats.totalBetAmount,
      totalWinAmount: this.cycleStats.totalWinAmount,
      cycleSuccessRate: (this.cycleStats.cycleSuccessCount / (this.cycleStats.cycleSuccessCount + this.cycleStats.cycleFailCount)) * 100 || 0,
      cycleId: this.cycleState.cycleId, adaptiveStagger: this.adaptiveState.currentStaggerMs,
      proxyEnabled: this.useProxy
    });
  }

  startSecurityMonitor() {
    const interval = setInterval(() => {
      const speed = this.cycleStats.processedThisMinute;
      const successRate = this.cycleStats.successCount / (this.cycleStats.successCount + this.cycleStats.failCount) * 100 || 0;
      const avgLogin = this.adaptiveState.recentLoginTimes.length > 0
        ? Math.round(this.adaptiveState.recentLoginTimes.reduce((a, b) => a + b, 0) / this.adaptiveState.recentLoginTimes.length) : 0;
      const ipLabel = this.useProxy ? `proxy(${this.proxyIpKey})` : 'direct';

      this.emit('terminal', {
        type: 'info',
        message: `🚀 [${this.instanceId}] ${speed}/min | ${successRate.toFixed(1)}% | Mem:${this.getMemoryUsage()}MB | Workers:${this.cycleState.activeWorkers} | AvgLogin:${avgLogin}ms | Stagger:${this.adaptiveState.currentStaggerMs}ms | IP:${ipLabel} | Sockets:${this.getGlobalSocketCount()}`
      });
      this.emit('status', {
        running: this.isProcessing, speed: `${speed}/minute`, instanceId: this.instanceId,
        successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount,
        confirmedBets: this.cycleStats.confirmedBets, successRate: `${successRate.toFixed(1)}%`,
        currentBet: this.getCurrentBetAmount(), totalBetAmount: this.cycleStats.totalBetAmount,
        totalWinAmount: this.cycleStats.totalWinAmount,
        cycle: this.currentCycle, cycleId: this.cycleState.cycleId,
        activeConnections: this.connectionPool.size, activeWorkers: this.cycleState.activeWorkers,
        memoryUsage: this.getMemoryUsage() + 'MB', avgLoginMs: avgLogin,
        adaptiveStagger: this.adaptiveState.currentStaggerMs,
        proxyEnabled: this.useProxy, proxyIpKey: this.proxyIpKey
      });
    }, 15000);
    this.activeIntervals.add(interval);
    this.securityInterval = interval;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  safeWebSocketClose(ws, identifier = 'unknown') {
    if (!ws) return;
    try {
      ws.removeAllListeners('open'); ws.removeAllListeners('message');
      ws.removeAllListeners('error'); ws.removeAllListeners('close');
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, `Cleanup ${identifier}`);
      ws.onerror = null; ws.onclose = null; ws.onmessage = null; ws.onopen = null;
    } catch (e) { console.warn(`Safe close error for ${identifier}:`, e.message); }
  }

  clearAllTimers() {
    const secInt = this.securityInterval;
    for (const i of this.activeIntervals) { if (i !== secInt) clearInterval(i); }
    this.activeIntervals.clear();
    if (secInt) this.activeIntervals.add(secInt);
    for (const t of this.activeTimeouts) clearTimeout(t);
    this.activeTimeouts.clear();
  }

  async completeCleanup() {
    this.clearAllTimers();
    for (const [k, ws] of this.connectionPool.entries()) this.safeWebSocketClose(ws, k);
    this.connectionPool.clear();
    this.activeProcesses.clear();
    if (global.gc) global.gc();
    await this.sleep(100);
  }

  getMemoryUsage() { return Math.round(process.memoryUsage().heapUsed / 1024 / 1024); }

  emitTerminalMessage(index, type, message) {
    this.emit('terminal', { type, message: `[C${this.currentCycle}][${index}] ${message}`, timestamp: new Date().toISOString(), cycleId: this.cycleState.cycleId });
  }

  async stopProcessing() {
    this.isProcessing = false; this.cycleState.isCycleActive = false;
    await this.completeCleanup();
    this.emit('terminal', { type: 'warning', message: `🛑 [${this.instanceId}] Processing stopped` });
    this.emit('status', { running: false });
    return { success: true, message: 'Processing stopped', finalBetConfig: this.getBetConfig(), cyclesCompleted: this.currentCycle };
  }

  completeProcessing() {
    this.isProcessing = false; this.cycleState.isCycleActive = false;
    this.clearAllTimers(); this.completeCleanup();
    const total = this.cycleStats.successCount + this.cycleStats.failCount;
    const rate = (this.cycleStats.successCount / total) * 100 || 0;
    this.emit('terminal', { type: 'success', message: `\n🎉 [${this.instanceId}] PROCESSING COMPLETED!` });
    this.emit('terminal', { type: 'info', message: `📈 Results: ${this.cycleStats.successCount}/${total} (${rate.toFixed(1)}%)` });
    this.emit('terminal', { type: 'info', message: `🧹 Memory: ${this.getMemoryUsage()}MB` });
    this.emit('completed', { successCount: this.cycleStats.successCount, failCount: this.cycleStats.failCount, confirmedBets: this.cycleStats.confirmedBets, totalProcessed: total, successRate: rate, totalBetAmount: this.cycleStats.totalBetAmount, totalWinAmount: this.cycleStats.totalWinAmount, finalBet: this.getCurrentBetAmount(), cyclesCompleted: this.currentCycle, finalMemory: this.getMemoryUsage() });
    this.emit('status', { running: false });
  }

  createLoginPayload(account) { return { account: account.username, password: account.password, version: this.config.GAME_VERSION, mainID: 100, subID: 6 }; }
  createEnterGamePayload(account) { return { mainID: 1, subID: 5, userid: account.userid, password: account.dynamicpass }; }
  createJoinGamePayload(account) { return { mainID: 1, subID: 4, gameid: account.gameid || 10658796, password: account.dynamicpass, reenter: 0 }; }
  createJoinTablePayload(account) { return { mainID: 1, subID: 6, bossid: account.bossid }; }
  createGameInitPayload() { return { route: 31, mainID: 200, subID: 100 }; }

  sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  getRandomFingerprint() { const fp = this.deviceFingerprints[Math.floor(Math.random() * this.deviceFingerprints.length)]; return { ...fp, timezone: this.getRandomTimezone(), language: this.getRandomLanguage() }; }
  getRandomTimezone() { const tz = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles']; return tz[Math.floor(Math.random() * tz.length)]; }
  getRandomLanguage() { const l = ['en-US','en-CA','en-GB','en-AU']; return l[Math.floor(Math.random() * l.length)]; }
  getRandomUserAgent() { return this.mobileUserAgents[Math.floor(Math.random() * this.mobileUserAgents.length)]; }
  getRandomHeaders() { return this.headerVariations[Math.floor(Math.random() * this.headerVariations.length)]; }

  getNextProxy() {
    if (!this.useProxy || this.proxyList.length === 0) return null;
    const proxy = this.proxyList[this.currentProxyIndex % this.proxyList.length];
    this.currentProxyIndex++;
    return proxy;
  }

  getEnhancedRandomDelay() {
    const base = Math.floor(Math.random() * (this.config.RANDOM_DELAYS.MAX - this.config.RANDOM_DELAYS.MIN) + this.config.RANDOM_DELAYS.MIN);
    return base + Math.floor(Math.random() * 1000);
  }
}

module.exports = UltimateRouletteProcessor;