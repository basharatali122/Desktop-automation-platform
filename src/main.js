// const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
// const path = require('path');
// const Database = require('../database/database');
// const RouletteProcessor = require('./roulette-processor');
// const crypto = require('crypto');
// const MainUserManager = require("./auth/MainUserManager");
// app.commandLine.appendSwitch('js-flags', '--expose-gc');

// // ---------------------------------------------------------------------------
// // MULTI-INSTANCE IPC NAMESPACE REGISTRY
// // ---------------------------------------------------------------------------
// const activeInstances = new Map();
// const instanceHandlers = new Map();

// function registerInstanceHandler(instanceId, channel, handler) {
//   const fullChannel = `${instanceId}:${channel}`;
//   try { ipcMain.removeHandler(fullChannel); } catch (_) {}
//   ipcMain.handle(fullChannel, handler);
//   if (!instanceHandlers.has(instanceId)) instanceHandlers.set(instanceId, new Set());
//   instanceHandlers.get(instanceId).add(fullChannel);
// }

// function unregisterInstanceHandlers(instanceId) {
//   const channels = instanceHandlers.get(instanceId);
//   if (!channels) return;
//   for (const ch of channels) {
//     try { ipcMain.removeHandler(ch); } catch (_) {}
//   }
//   instanceHandlers.delete(instanceId);
// }

// // ---------------------------------------------------------------------------
// // GLOBAL SOCKET COORDINATOR
// // ---------------------------------------------------------------------------
// // When a profile has its own dedicated proxy, its connections go through a
// // different IP so they don't count against other profiles' limits.
// // The coordinator tracks slots per-source-ip:
// //   - 'direct'  = no proxy (shares the machine's real IP)
// //   - 'proxy'   = each proxy URL is its own IP bucket
// // Each bucket is capped at MAX_PER_IP sockets.
// // ---------------------------------------------------------------------------
// const GlobalSocketCoordinator = {
//   MAX_PER_IP: 10,       // Max concurrent sockets per IP (real or proxy)
//   buckets: new Map(),   // ip-key -> { count, queue }

//   _getBucket(ipKey) {
//     if (!this.buckets.has(ipKey)) {
//       this.buckets.set(ipKey, { count: 0, queue: [] });
//     }
//     return this.buckets.get(ipKey);
//   },

//   acquire(ipKey = 'direct') {
//     return new Promise((resolve) => {
//       const bucket = this._getBucket(ipKey);
//       const tryAcquire = () => {
//         if (bucket.count < this.MAX_PER_IP) {
//           bucket.count++;
//           resolve();
//         } else {
//           bucket.queue.push(tryAcquire);
//         }
//       };
//       tryAcquire();
//     });
//   },

//   release(ipKey = 'direct') {
//     const bucket = this._getBucket(ipKey);
//     bucket.count = Math.max(0, bucket.count - 1);
//     if (bucket.queue.length > 0) {
//       const next = bucket.queue.shift();
//       next();
//     }
//   },

//   getCount(ipKey = 'direct') {
//     return this._getBucket(ipKey).count;
//   },

//   getTotalCount() {
//     let total = 0;
//     for (const b of this.buckets.values()) total += b.count;
//     return total;
//   }
// };

// global.GlobalSocketCoordinator = GlobalSocketCoordinator;

// // ---------------------------------------------------------------------------
// // FireKirinApp
// // ---------------------------------------------------------------------------
// class FireKirinApp {
//   constructor() {
//     this.mainWindow = null;
//     this.db = null;
//     this.processor = null;
//     this.userManager = null;
//     this.profileName = null;
//     this._processingListenersAttached = false;
//     this.instanceId = `inst_${Math.random().toString(36).substring(2, 8)}`;

//     // Per-profile proxy config — set via IPC from the renderer
//     this.proxyConfig = {
//       enabled: false,
//       proxyUrl: '',      // single dedicated proxy for this profile: socks5://user:pass@host:port
//       proxyList: [],     // optional list for round-robin within this profile
//     };

//     activeInstances.set(this.instanceId, this);
//   }

//   async init() {
//     console.log(`🚀 Initializing Milkyway App [${this.instanceId}]...`);
//     this.profileName = await this.selectInstanceProfile();
//     await this.initializeDatabase();
//     this.createMainWindow();
//     this.setupIPC();
//     console.log(`✅ Milkyway App initialized [${this.instanceId}] profile: ${this.profileName}`);
//   }

//   async selectInstanceProfile() {
//     const existingProfiles = this.getExistingProfiles();
//     const buttons = [...existingProfiles.slice(0, 5), '➕ Create New Profile'];
//     const result = await dialog.showMessageBox(null, {
//       type: 'question', buttons, defaultId: 0,
//       title: '🎯 Milkyway - Select Profile',
//       message: 'Choose which profile to use',
//       detail: `Instance: ${this.instanceId}\nEach profile has separate accounts.\nYou can run multiple instances with different profiles.`,
//       noLink: true
//     });
//     if (result.response === buttons.length - 1) return await this.createNewProfile();
//     return existingProfiles[result.response];
//   }

//   getExistingProfiles() {
//     const fs = require('fs');
//     const isDev = !app.isPackaged;
//     const baseDataDir = isDev ? path.join(__dirname, '..', 'data') : path.join(process.resourcesPath, 'data');
//     try {
//       if (fs.existsSync(baseDataDir)) {
//         const profiles = fs.readdirSync(baseDataDir).filter(item =>
//           fs.statSync(path.join(baseDataDir, item)).isDirectory()
//         );
//         if (profiles.length > 0) return profiles;
//       }
//     } catch (_) {}
//     return ['Profile_1', 'Profile_2', 'Profile_3', 'Profile_4'];
//   }

//   async createNewProfile() {
//     const defaultName = `Profile_${Math.floor(Math.random() * 10000)}`;
//     const result = await dialog.showMessageBox(null, {
//       type: 'question', buttons: ['Use Default', 'Cancel'], defaultId: 0,
//       title: 'Create New Profile', message: 'Create new profile?',
//       detail: `New profile name: ${defaultName}`
//     });
//     return result.response === 0 ? defaultName : 'Profile_1';
//   }

//   async initializeDatabase() {
//     console.log(`📁 Initializing database for profile: ${this.profileName} [${this.instanceId}]`);
//     this.db = new Database(this.profileName);
//     await this.db.init();
//     this.initializeProcessor();
//   }

//   initializeProcessor() {
//     if (this.processor) {
//       this.processor.removeAllListeners();
//       this._processingListenersAttached = false;
//     }
//     this.processor = new RouletteProcessor(this.db);
//     this.processor.instanceId = this.instanceId;
//     this.processor.globalCoordinator = GlobalSocketCoordinator;
//     this.processor.on('betConfigChanged', (data) => this._sendToWindow('bet:configChanged', data));
//     this.processor.on('betUpdate', (data) => this._sendToWindow('bet:update', data));
//     this.processor.on('betError', (data) => this._sendToWindow('bet:error', data));
//     console.log(`🎯 Processor initialized [${this.instanceId}]`);
//   }

//   _sendToWindow(channel, data) {
//     if (this.mainWindow && !this.mainWindow.isDestroyed()) {
//       this.mainWindow.webContents.send(channel, data);
//     }
//   }

//   createMainWindow() {
//     this.mainWindow = new BrowserWindow({
//       width: 1200, height: 800, minWidth: 1000, minHeight: 700,
//       webPreferences: {
//         nodeIntegration: false, contextIsolation: true,
//         preload: path.join(__dirname, 'preload.js'), enableRemoteModule: false
//       },
//       title: `Milkyway - ${this.profileName}`, show: false
//     });

//     const isDev = !app.isPackaged;
//     this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
//     if (!isDev) this.mainWindow.setMenu(null);

//     // Synchronous bootstrap: preload calls sendSync to get instanceId
//     const syncChannel = 'preload:getInstanceId';
//     const syncHandler = (event) => {
//       if (event.sender === this.mainWindow.webContents) {
//         event.returnValue = this.instanceId;
//       }
//     };
//     ipcMain.on(syncChannel, syncHandler);
//     this.mainWindow.once('closed', () => ipcMain.removeListener(syncChannel, syncHandler));

//     this.mainWindow.once('ready-to-show', () => {
//       this.mainWindow.show();
//       this.initializeFirebase();
//       if (isDev) this.mainWindow.webContents.openDevTools();
//     });

//     this.mainWindow.on('closed', () => {
//       unregisterInstanceHandlers(this.instanceId);
//       activeInstances.delete(this.instanceId);
//       this.mainWindow = null;
//       if (this.processor) this.processor.stopProcessing();
//       if (this.db) this.db.close();
//     });
//   }

//   async initializeFirebase() {
//     try {
//       this.userManager = new MainUserManager(this.mainWindow);
//       console.log(`✅ Firebase UserManager initialized [${this.instanceId}]`);
//     } catch (error) {
//       console.error(`❌ Firebase initialization failed [${this.instanceId}]:`, error);
//     }
//   }

//   setupIPC() {
//     this.setupProfileIPC();
//     this.setupUserManagementIPC();
//     this.setupAccountManagementIPC();
//     this.setupProcessingIPC();
//     this.setupBetManagementIPC();
//     this.setupProxyIPC();   // NEW

//     this.mainWindow.webContents.once('did-finish-load', () => {
//       this._sendToWindow('app:instanceId', { instanceId: this.instanceId, profileName: this.profileName });
//     });
//   }

//   h(channel, handler) {
//     registerInstanceHandler(this.instanceId, channel, handler);
//   }

//   setupProfileIPC() {
//     this.h('profile:getCurrent', async () => ({ profileName: this.profileName }));
//     this.h('profile:getAll', async () => ({ profiles: this.getExistingProfiles() }));
//   }

//   setupUserManagementIPC() {
//     this.h('user-management:initialize', async () => {
//       try { if (!this.db) throw new Error('Database not initialized'); return { success: true }; }
//       catch (e) { return { success: false, error: e.message }; }
//     });
//     this.h('user-management:getCurrentUser', async () => {
//       try {
//         if (this.userManager?.currentUser) return { success: true, user: this.userManager.currentUser };
//         return { success: true, user: null };
//       } catch (e) { return { success: false, error: e.message }; }
//     });
//     this.h('user-management:register', async (event, email, password) => {
//       try { if (!this.userManager) throw new Error('User manager not initialized'); return await this.userManager.registerUser(email, password); }
//       catch (e) { return { success: false, message: e.message }; }
//     });
//     this.h('user-management:login', async (event, email, password) => {
//       try { if (!this.userManager) throw new Error('User manager not initialized'); return await this.userManager.loginUser(email, password); }
//       catch (e) { return { success: false, message: e.message }; }
//     });
//   }

//   setupAccountManagementIPC() {
//     this.h('accounts:getAll', async () => this.db.getAllAccounts());
//     this.h('accounts:add', async (event, account) => {
//       if (account.password && !account.password.match(/^[a-f0-9]{32}$/))
//         account.password = crypto.createHash('md5').update(account.password).digest('hex');
//       return await this.db.addAccount(account);
//     });
//     this.h('accounts:addBulk', async (event, accounts) => {
//       return await this.db.addBulkAccounts(accounts.map(a => ({
//         ...a, password: crypto.createHash('md5').update(a.password).digest('hex')
//       })));
//     });
//     this.h('accounts:update', async (event, account) => this.db.updateAccount(account));
//     this.h('accounts:delete', async (event, id) => this.db.deleteAccount(id));
//     this.h('accounts:deleteMultiple', async (event, ids) => this.db.deleteMultipleAccounts(ids));
//   }

//   setupProcessingIPC() {
//     this.h('processing:start', async (event, accountIds, repetitions = 1) => {
//       try {
//         if (!this.processor) this.initializeProcessor();
//         if (!this._processingListenersAttached) this.setupProcessorEventListeners();

//         // Pass proxy config from this profile's settings to the processor
//         const useProxy = this.proxyConfig.enabled && (
//           this.proxyConfig.proxyUrl.length > 0 || this.proxyConfig.proxyList.length > 0
//         );
//         const proxyList = this.proxyConfig.proxyList.length > 0
//           ? this.proxyConfig.proxyList
//           : (this.proxyConfig.proxyUrl ? [this.proxyConfig.proxyUrl] : []);

//         const result = await this.processor.startProcessing(accountIds, repetitions, useProxy, proxyList);
//         return result;
//       } catch (error) {
//         console.error(`❌ Error starting processing [${this.instanceId}]:`, error);
//         return { success: false, message: error.message };
//       }
//     });
//     this.h('processing:stop', async () => {
//       if (this.processor) { await this.processor.stopProcessing(); return true; }
//       return false;
//     });
//     this.h('processing:getStatus', async () => {
//       return this.processor ? this.processor.getStatus?.() ?? { running: false } : { running: false };
//     });
//   }

//   setupProcessorEventListeners() {
//     if (!this.processor) return;
//     const evts = ['status','terminal','progress','completed','cycleUpdate','cycleStart','cycleComplete','cycleProgress'];
//     evts.forEach(e => this.processor.removeAllListeners(e));
//     this.processor.on('betConfigChanged', (d) => this._sendToWindow('bet:configChanged', d));
//     this.processor.on('betUpdate', (d) => this._sendToWindow('bet:update', d));
//     this.processor.on('betError', (d) => this._sendToWindow('bet:error', d));
//     this.processor.on('status', (d) => this._sendToWindow('processing:status', d));
//     this.processor.on('terminal', (d) => this._sendToWindow('processing:terminal', d));
//     this.processor.on('progress', (d) => this._sendToWindow('processing:progress', d));
//     this.processor.on('completed', (d) => this._sendToWindow('processing:completed', d));
//     this.processor.on('cycleUpdate', (d) => this._sendToWindow('processing:cycleUpdate', d));
//     this.processor.on('cycleStart', (d) => this._sendToWindow('processing:cycleStart', d));
//     this.processor.on('cycleComplete', (d) => this._sendToWindow('processing:cycleComplete', d));
//     this.processor.on('cycleProgress', (d) => this._sendToWindow('processing:cycleProgress', d));
//     this._processingListenersAttached = true;
//   }

//   // ---------------------------------------------------------------------------
//   // PROXY IPC — save/load proxy settings per profile instance
//   // ---------------------------------------------------------------------------
//   setupProxyIPC() {
//     // Save proxy config for this profile
//     this.h('proxy:setConfig', async (event, config) => {
//       try {
//         this.proxyConfig.enabled = !!config.enabled;
//         this.proxyConfig.proxyUrl = (config.proxyUrl || '').trim();

//         // Parse multi-line proxy list (one per line: socks5://user:pass@host:port)
//         if (config.proxyList && typeof config.proxyList === 'string') {
//           this.proxyConfig.proxyList = config.proxyList
//             .split('\n')
//             .map(l => l.trim())
//             .filter(l => l.length > 0 && (l.startsWith('socks5://') || l.startsWith('socks4://') || l.startsWith('http://')));
//         } else {
//           this.proxyConfig.proxyList = [];
//         }

//         // Persist to profile DB so it survives restarts
//         await this.db.saveProxyConfig(this.proxyConfig);

//         // Update the processor's ip key so global coordinator buckets correctly
//         if (this.processor) {
//           this.processor.proxyIpKey = this._deriveProxyIpKey();
//           this.processor.useProxy = this.proxyConfig.enabled;
//           this.processor.proxyList = this.proxyConfig.enabled ? this._getEffectiveProxyList() : [];
//         }

//         console.log(`🌐 [${this.instanceId}] Proxy config saved: enabled=${this.proxyConfig.enabled}, url=${this.proxyConfig.proxyUrl}, list=${this.proxyConfig.proxyList.length}`);
//         return { success: true, config: this.proxyConfig };
//       } catch (error) {
//         return { success: false, message: error.message };
//       }
//     });

//     // Get current proxy config
//     this.h('proxy:getConfig', async () => {
//       return { success: true, config: this.proxyConfig };
//     });

//     // Validate a proxy URL by attempting a test connection
//     this.h('proxy:test', async (event, proxyUrl) => {
//       try {
//         const { SocksProxyAgent } = require('socks-proxy-agent');
//         const WebSocket = require('ws');
//         const agent = new SocksProxyAgent(proxyUrl);
//         return await new Promise((resolve) => {
//           const timeout = setTimeout(() => resolve({ success: false, message: 'Connection timed out after 8s' }), 8000);
//           const ws = new WebSocket('wss://game.milkywayapp.xyz:7878/', ['wl'], {
//             agent, handshakeTimeout: 7000,
//             headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Origin': 'http://localhost' }
//           });
//           ws.on('open', () => {
//             clearTimeout(timeout);
//             ws.close();
//             resolve({ success: true, message: '✅ Proxy connected successfully' });
//           });
//           ws.on('error', (err) => {
//             clearTimeout(timeout);
//             resolve({ success: false, message: `❌ ${err.message}` });
//           });
//         });
//       } catch (error) {
//         return { success: false, message: error.message };
//       }
//     });

//     // Load saved proxy config on startup
//     this._loadSavedProxyConfig();
//   }

//   async _loadSavedProxyConfig() {
//     try {
//       const saved = await this.db.getProxyConfig();
//       if (saved) {
//         this.proxyConfig = { ...this.proxyConfig, ...saved };
//         if (this.processor) {
//           this.processor.proxyIpKey = this._deriveProxyIpKey();
//           this.processor.useProxy = this.proxyConfig.enabled;
//           this.processor.proxyList = this.proxyConfig.enabled ? this._getEffectiveProxyList() : [];
//         }
//         console.log(`🌐 [${this.instanceId}] Loaded saved proxy config: enabled=${this.proxyConfig.enabled}`);
//       }
//     } catch (_) {}
//   }

//   // Key used to identify this profile's IP bucket in the global coordinator.
//   // Profiles with different proxies get separate buckets → separate limits.
//   _deriveProxyIpKey() {
//     if (!this.proxyConfig.enabled) return 'direct';
//     const url = this.proxyConfig.proxyUrl || (this.proxyConfig.proxyList[0] || '');
//     if (!url) return 'direct';
//     // Use host:port as the bucket key (strip credentials)
//     try {
//       const u = new URL(url);
//       return `proxy_${u.hostname}_${u.port}`;
//     } catch (_) {
//       return `proxy_${url.replace(/[^a-z0-9]/gi, '_')}`;
//     }
//   }

//   _getEffectiveProxyList() {
//     if (this.proxyConfig.proxyList.length > 0) return this.proxyConfig.proxyList;
//     if (this.proxyConfig.proxyUrl) return [this.proxyConfig.proxyUrl];
//     return [];
//   }

//   setupBetManagementIPC() {
//     this.h('bet:setAmount', async (event, amount) => {
//       try {
//         if (!this.processor) this.initializeProcessor();
//         const success = this.processor.handleBetChange(amount);
//         return { success, message: success ? `Bet set to ${amount}` : 'Failed', newAmount: amount, config: this.processor.getBetConfig() };
//       } catch (e) { return { success: false, message: e.message }; }
//     });
//     this.h('bet:reset', async () => {
//       try {
//         if (!this.processor) this.initializeProcessor();
//         const defaultBet = this.processor.resetToDefaultBet();
//         return { success: true, defaultBet, config: this.processor.getBetConfig() };
//       } catch (e) { return { success: false, message: e.message }; }
//     });
//     this.h('bet:getConfig', async () => {
//       try { if (!this.processor) this.initializeProcessor(); return { success: true, config: this.processor.getBetConfig() }; }
//       catch (e) { return { success: false, message: e.message }; }
//     });
//     this.h('bet:updateConfig', async (event, config) => {
//       try {
//         if (!this.processor) this.initializeProcessor();
//         const success = this.processor.updateBetConfig(config);
//         return { success, config: this.processor.getBetConfig() };
//       } catch (e) { return { success: false, message: e.message }; }
//     });
//     this.h('bet:getCurrent', async () => {
//       try {
//         if (!this.processor) this.initializeProcessor();
//         return { success: true, currentBet: this.processor.getCurrentBetAmount(), config: this.processor.getBetConfig() };
//       } catch (e) { return { success: false, message: e.message }; }
//     });
//   }
// }

// // ---------------------------------------------------------------------------
// // App lifecycle
// // ---------------------------------------------------------------------------
// app.whenReady().then(() => {
//   const fireKirinApp = new FireKirinApp();
//   fireKirinApp.init().catch(error => console.error('💥 Failed to initialize app:', error));
// });

// app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// app.on('activate', () => {
//   if (BrowserWindow.getAllWindows().length === 0) {
//     const fireKirinApp = new FireKirinApp();
//     fireKirinApp.init().catch(error => console.error('💥 Failed to re-initialize app:', error));
//   }
// });

// process.on('uncaughtException', (error) => console.error('💥 Uncaught Exception:', error));
// process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));



const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const Database = require('../database/database');
const RouletteProcessor = require('./roulette-processor');
const crypto = require('crypto');
const MainUserManager = require("./auth/MainUserManager");
app.commandLine.appendSwitch('js-flags', '--expose-gc');

// ---------------------------------------------------------------------------
// MULTI-INSTANCE IPC NAMESPACE REGISTRY
// ---------------------------------------------------------------------------
const activeInstances = new Map();
const instanceHandlers = new Map();

function registerInstanceHandler(instanceId, channel, handler) {
  const fullChannel = `${instanceId}:${channel}`;
  try { ipcMain.removeHandler(fullChannel); } catch (_) {}
  ipcMain.handle(fullChannel, handler);
  if (!instanceHandlers.has(instanceId)) instanceHandlers.set(instanceId, new Set());
  instanceHandlers.get(instanceId).add(fullChannel);
}

function unregisterInstanceHandlers(instanceId) {
  const channels = instanceHandlers.get(instanceId);
  if (!channels) return;
  for (const ch of channels) {
    try { ipcMain.removeHandler(ch); } catch (_) {}
  }
  instanceHandlers.delete(instanceId);
}

// ---------------------------------------------------------------------------
// GLOBAL SOCKET COORDINATOR
// ---------------------------------------------------------------------------
// When a profile has its own dedicated proxy, its connections go through a
// different IP so they don't count against other profiles' limits.
// The coordinator tracks slots per-source-ip:
//   - 'direct'  = no proxy (shares the machine's real IP)
//   - 'proxy'   = each proxy URL is its own IP bucket
// Each bucket is capped at MAX_PER_IP sockets.
// ---------------------------------------------------------------------------
const GlobalSocketCoordinator = {
  MAX_PER_IP: 10,       // Max concurrent sockets per IP (real or proxy)
  buckets: new Map(),   // ip-key -> { count, queue }

  _getBucket(ipKey) {
    if (!this.buckets.has(ipKey)) {
      this.buckets.set(ipKey, { count: 0, queue: [] });
    }
    return this.buckets.get(ipKey);
  },

  acquire(ipKey = 'direct') {
    return new Promise((resolve) => {
      const bucket = this._getBucket(ipKey);
      const tryAcquire = () => {
        if (bucket.count < this.MAX_PER_IP) {
          bucket.count++;
          resolve();
        } else {
          bucket.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  },

  release(ipKey = 'direct') {
    const bucket = this._getBucket(ipKey);
    bucket.count = Math.max(0, bucket.count - 1);
    if (bucket.queue.length > 0) {
      const next = bucket.queue.shift();
      next();
    }
  },

  getCount(ipKey = 'direct') {
    return this._getBucket(ipKey).count;
  },

  getTotalCount() {
    let total = 0;
    for (const b of this.buckets.values()) total += b.count;
    return total;
  }
};

global.GlobalSocketCoordinator = GlobalSocketCoordinator;

// ---------------------------------------------------------------------------
// FireKirinApp
// ---------------------------------------------------------------------------
class FireKirinApp {
  constructor() {
    this.mainWindow = null;
    this.db = null;
    this.processor = null;
    this.userManager = null;
    this.profileName = null;
    this._processingListenersAttached = false;
    this.instanceId = `inst_${Math.random().toString(36).substring(2, 8)}`;

    // Per-profile proxy config — set via IPC from the renderer
    this.proxyConfig = {
      enabled: false,
      proxyUrl: '',      // single dedicated proxy for this profile: socks5://user:pass@host:port
      proxyList: [],     // optional list for round-robin within this profile
    };

    activeInstances.set(this.instanceId, this);
  }

  async init() {
    console.log(`🚀 Initializing Milkyway App [${this.instanceId}]...`);
    this.profileName = await this.selectInstanceProfile();
    await this.initializeDatabase();
    this.createMainWindow();
    this.setupIPC();
    console.log(`✅ Milkyway App initialized [${this.instanceId}] profile: ${this.profileName}`);
  }

  async selectInstanceProfile() {
    const existingProfiles = this.getExistingProfiles();
    const buttons = [...existingProfiles.slice(0, 5), '➕ Create New Profile'];
    const result = await dialog.showMessageBox(null, {
      type: 'question', buttons, defaultId: 0,
      title: '🎯 Milkyway - Select Profile',
      message: 'Choose which profile to use',
      detail: `Instance: ${this.instanceId}\nEach profile has separate accounts.\nYou can run multiple instances with different profiles.`,
      noLink: true
    });
    if (result.response === buttons.length - 1) return await this.createNewProfile();
    return existingProfiles[result.response];
  }

  getExistingProfiles() {
    const fs = require('fs');
    const isDev = !app.isPackaged;
    const baseDataDir = isDev ? path.join(__dirname, '..', 'data') : path.join(process.resourcesPath, 'data');
    try {
      if (fs.existsSync(baseDataDir)) {
        const profiles = fs.readdirSync(baseDataDir).filter(item =>
          fs.statSync(path.join(baseDataDir, item)).isDirectory()
        );
        if (profiles.length > 0) return profiles;
      }
    } catch (_) {}
    return ['Profile_1', 'Profile_2', 'Profile_3', 'Profile_4'];
  }

  async createNewProfile() {
    const defaultName = `Profile_${Math.floor(Math.random() * 10000)}`;
    const result = await dialog.showMessageBox(null, {
      type: 'question', buttons: ['Use Default', 'Cancel'], defaultId: 0,
      title: 'Create New Profile', message: 'Create new profile?',
      detail: `New profile name: ${defaultName}`
    });
    return result.response === 0 ? defaultName : 'Profile_1';
  }

  async initializeDatabase() {
    console.log(`📁 Initializing database for profile: ${this.profileName} [${this.instanceId}]`);
    this.db = new Database(this.profileName);
    await this.db.init();
    this.initializeProcessor();
  }

  initializeProcessor() {
    if (this.processor) {
      this.processor.removeAllListeners();
      this._processingListenersAttached = false;
    }
    this.processor = new RouletteProcessor(this.db);
    this.processor.instanceId = this.instanceId;
    this.processor.globalCoordinator = GlobalSocketCoordinator;
    this.processor.on('betConfigChanged', (data) => this._sendToWindow('bet:configChanged', data));
    this.processor.on('betUpdate', (data) => this._sendToWindow('bet:update', data));
    this.processor.on('betError', (data) => this._sendToWindow('bet:error', data));
    console.log(`🎯 Processor initialized [${this.instanceId}]`);
  }

  _sendToWindow(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200, height: 800, minWidth: 1000, minHeight: 700,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'), enableRemoteModule: false
      },
      title: `Milkyway - ${this.profileName}`, show: false
    });

    const isDev = !app.isPackaged;
    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
    if (!isDev) this.mainWindow.setMenu(null);

    // Synchronous bootstrap: preload calls sendSync to get instanceId
    const syncChannel = 'preload:getInstanceId';
    const syncHandler = (event) => {
      if (event.sender === this.mainWindow.webContents) {
        event.returnValue = this.instanceId;
      }
    };
    ipcMain.on(syncChannel, syncHandler);
    this.mainWindow.once('closed', () => ipcMain.removeListener(syncChannel, syncHandler));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.initializeFirebase();
      if (isDev) this.mainWindow.webContents.openDevTools();
    });

    this.mainWindow.on('closed', () => {
      unregisterInstanceHandlers(this.instanceId);
      activeInstances.delete(this.instanceId);
      this.mainWindow = null;
      if (this.processor) this.processor.stopProcessing();
      if (this.db) this.db.close();
    });
  }

  async initializeFirebase() {
    try {
      this.userManager = new MainUserManager(this.mainWindow);
      console.log(`✅ Firebase UserManager initialized [${this.instanceId}]`);
    } catch (error) {
      console.error(`❌ Firebase initialization failed [${this.instanceId}]:`, error);
    }
  }

  setupIPC() {
    this.setupProfileIPC();
    this.setupUserManagementIPC();
    this.setupAccountManagementIPC();
    this.setupProcessingIPC();
    this.setupBetManagementIPC();
    this.setupProxyIPC();   // NEW

    this.mainWindow.webContents.once('did-finish-load', () => {
      this._sendToWindow('app:instanceId', { instanceId: this.instanceId, profileName: this.profileName });
    });
  }

  h(channel, handler) {
    registerInstanceHandler(this.instanceId, channel, handler);
  }

  setupProfileIPC() {
    this.h('profile:getCurrent', async () => ({ profileName: this.profileName }));
    this.h('profile:getAll', async () => ({ profiles: this.getExistingProfiles() }));
  }

  setupUserManagementIPC() {
    this.h('user-management:initialize', async () => {
      try { if (!this.db) throw new Error('Database not initialized'); return { success: true }; }
      catch (e) { return { success: false, error: e.message }; }
    });
    this.h('user-management:getCurrentUser', async () => {
      try {
        if (this.userManager?.currentUser) return { success: true, user: this.userManager.currentUser };
        return { success: true, user: null };
      } catch (e) { return { success: false, error: e.message }; }
    });
    this.h('user-management:register', async (event, email, password) => {
      try { if (!this.userManager) throw new Error('User manager not initialized'); return await this.userManager.registerUser(email, password); }
      catch (e) { return { success: false, message: e.message }; }
    });
    this.h('user-management:login', async (event, email, password) => {
      try { if (!this.userManager) throw new Error('User manager not initialized'); return await this.userManager.loginUser(email, password); }
      catch (e) { return { success: false, message: e.message }; }
    });
  }

  setupAccountManagementIPC() {
    this.h('accounts:getAll', async () => this.db.getAllAccounts());
    this.h('accounts:add', async (event, account) => {
      if (account.password && !account.password.match(/^[a-f0-9]{32}$/))
        account.password = crypto.createHash('md5').update(account.password).digest('hex');
      return await this.db.addAccount(account);
    });
    this.h('accounts:addBulk', async (event, accounts) => {
      return await this.db.addBulkAccounts(accounts.map(a => ({
        ...a, password: crypto.createHash('md5').update(a.password).digest('hex')
      })));
    });
    this.h('accounts:update', async (event, account) => this.db.updateAccount(account));
    this.h('accounts:delete', async (event, id) => this.db.deleteAccount(id));
    this.h('accounts:deleteMultiple', async (event, ids) => this.db.deleteMultipleAccounts(ids));
  }

  setupProcessingIPC() {
    this.h('processing:start', async (event, accountIds, repetitions = 1) => {
      try {
        if (!this.processor) this.initializeProcessor();
        if (!this._processingListenersAttached) this.setupProcessorEventListeners();

        // Pass proxy config from this profile's settings to the processor
        const useProxy = this.proxyConfig.enabled && (
          this.proxyConfig.proxyUrl.length > 0 || this.proxyConfig.proxyList.length > 0
        );
        const proxyList = this.proxyConfig.proxyList.length > 0
          ? this.proxyConfig.proxyList
          : (this.proxyConfig.proxyUrl ? [this.proxyConfig.proxyUrl] : []);

        const result = await this.processor.startProcessing(accountIds, repetitions, useProxy, proxyList);
        return result;
      } catch (error) {
        console.error(`❌ Error starting processing [${this.instanceId}]:`, error);
        return { success: false, message: error.message };
      }
    });
    this.h('processing:stop', async () => {
      if (this.processor) { await this.processor.stopProcessing(); return true; }
      return false;
    });
    this.h('processing:getStatus', async () => {
      return this.processor ? this.processor.getStatus?.() ?? { running: false } : { running: false };
    });
  }

  setupProcessorEventListeners() {
    if (!this.processor) return;
    const evts = ['status','terminal','progress','completed','cycleUpdate','cycleStart','cycleComplete','cycleProgress'];
    evts.forEach(e => this.processor.removeAllListeners(e));
    this.processor.on('betConfigChanged', (d) => this._sendToWindow('bet:configChanged', d));
    this.processor.on('betUpdate', (d) => this._sendToWindow('bet:update', d));
    this.processor.on('betError', (d) => this._sendToWindow('bet:error', d));
    this.processor.on('status', (d) => this._sendToWindow('processing:status', d));
    this.processor.on('terminal', (d) => this._sendToWindow('processing:terminal', d));
    this.processor.on('progress', (d) => this._sendToWindow('processing:progress', d));
    this.processor.on('completed', (d) => this._sendToWindow('processing:completed', d));
    this.processor.on('cycleUpdate', (d) => this._sendToWindow('processing:cycleUpdate', d));
    this.processor.on('cycleStart', (d) => this._sendToWindow('processing:cycleStart', d));
    this.processor.on('cycleComplete', (d) => this._sendToWindow('processing:cycleComplete', d));
    this.processor.on('cycleProgress', (d) => this._sendToWindow('processing:cycleProgress', d));
    this._processingListenersAttached = true;
  }

  // ---------------------------------------------------------------------------
  // PROXY IPC — save/load proxy settings per profile instance
  // ---------------------------------------------------------------------------
  setupProxyIPC() {
    // Save proxy config for this profile
    this.h('proxy:setConfig', async (event, config) => {
      try {
        this.proxyConfig.enabled = !!config.enabled;
        this.proxyConfig.proxyUrl = (config.proxyUrl || '').trim();

        // Parse multi-line proxy list (one per line: socks5://user:pass@host:port)
        if (config.proxyList && typeof config.proxyList === 'string') {
          this.proxyConfig.proxyList = config.proxyList
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && (
              l.startsWith('socks5h://') ||
              l.startsWith('socks5://')  ||
              l.startsWith('socks4://')  ||
              l.startsWith('http://')    ||
              l.startsWith('https://')
            ));
        } else {
          this.proxyConfig.proxyList = [];
        }

        // Persist to profile DB so it survives restarts
        await this.db.saveProxyConfig(this.proxyConfig);

        // Update the processor's ip key so global coordinator buckets correctly
        if (this.processor) {
          this.processor.proxyIpKey = this._deriveProxyIpKey();
          this.processor.useProxy = this.proxyConfig.enabled;
          this.processor.proxyList = this.proxyConfig.enabled ? this._getEffectiveProxyList() : [];
        }

        console.log(`🌐 [${this.instanceId}] Proxy config saved: enabled=${this.proxyConfig.enabled}, url=${this.proxyConfig.proxyUrl}, list=${this.proxyConfig.proxyList.length}`);
        return { success: true, config: this.proxyConfig };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Get current proxy config
    this.h('proxy:getConfig', async () => {
      return { success: true, config: this.proxyConfig };
    });

    // Validate a proxy URL by attempting a test connection
    this.h('proxy:test', async (event, proxyUrl) => {
      try {
        const WebSocket = require('ws');
        // Pick the right agent based on proxy protocol:
        //   http:// / https:// → HttpsProxyAgent (HTTP CONNECT tunnel — works for wss://)
        //   socks5:// / socks5h:// / socks4:// → SocksProxyAgent
        let agent;
        if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
          const { HttpsProxyAgent } = require('hpagent');
          agent = new HttpsProxyAgent({ proxy: proxyUrl });
        } else {
          const { SocksProxyAgent } = require('socks-proxy-agent');
          agent = new SocksProxyAgent(proxyUrl);
        }

        return await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ success: false, message: '❌ Connection timed out after 8s' }), 8000);
          const ws = new WebSocket('wss://game.milkywayapp.xyz:7878/', ['wl'], {
            agent, handshakeTimeout: 7000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Origin': 'http://localhost' }
          });
          ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, message: '✅ Proxy connected successfully' });
          });
          ws.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ success: false, message: `❌ ${err.message}` });
          });
        });
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Load saved proxy config on startup
    this._loadSavedProxyConfig();
  }

  async _loadSavedProxyConfig() {
    try {
      const saved = await this.db.getProxyConfig();
      if (saved) {
        this.proxyConfig = { ...this.proxyConfig, ...saved };
        if (this.processor) {
          this.processor.proxyIpKey = this._deriveProxyIpKey();
          this.processor.useProxy = this.proxyConfig.enabled;
          this.processor.proxyList = this.proxyConfig.enabled ? this._getEffectiveProxyList() : [];
        }
        console.log(`🌐 [${this.instanceId}] Loaded saved proxy config: enabled=${this.proxyConfig.enabled}`);
      }
    } catch (_) {}
  }

  // Key used to identify this profile's IP bucket in the global coordinator.
  // Profiles with different proxies get separate buckets → separate limits.
  _deriveProxyIpKey() {
    if (!this.proxyConfig.enabled) return 'direct';
    const url = this.proxyConfig.proxyUrl || (this.proxyConfig.proxyList[0] || '');
    if (!url) return 'direct';
    // Use host:port as the bucket key (strip credentials)
    try {
      const u = new URL(url);
      return `proxy_${u.hostname}_${u.port}`;
    } catch (_) {
      return `proxy_${url.replace(/[^a-z0-9]/gi, '_')}`;
    }
  }

  _getEffectiveProxyList() {
    if (this.proxyConfig.proxyList.length > 0) return this.proxyConfig.proxyList;
    if (this.proxyConfig.proxyUrl) return [this.proxyConfig.proxyUrl];
    return [];
  }

  setupBetManagementIPC() {
    this.h('bet:setAmount', async (event, amount) => {
      try {
        if (!this.processor) this.initializeProcessor();
        const success = this.processor.handleBetChange(amount);
        return { success, message: success ? `Bet set to ${amount}` : 'Failed', newAmount: amount, config: this.processor.getBetConfig() };
      } catch (e) { return { success: false, message: e.message }; }
    });
    this.h('bet:reset', async () => {
      try {
        if (!this.processor) this.initializeProcessor();
        const defaultBet = this.processor.resetToDefaultBet();
        return { success: true, defaultBet, config: this.processor.getBetConfig() };
      } catch (e) { return { success: false, message: e.message }; }
    });
    this.h('bet:getConfig', async () => {
      try { if (!this.processor) this.initializeProcessor(); return { success: true, config: this.processor.getBetConfig() }; }
      catch (e) { return { success: false, message: e.message }; }
    });
    this.h('bet:updateConfig', async (event, config) => {
      try {
        if (!this.processor) this.initializeProcessor();
        const success = this.processor.updateBetConfig(config);
        return { success, config: this.processor.getBetConfig() };
      } catch (e) { return { success: false, message: e.message }; }
    });
    this.h('bet:getCurrent', async () => {
      try {
        if (!this.processor) this.initializeProcessor();
        return { success: true, currentBet: this.processor.getCurrentBetAmount(), config: this.processor.getBetConfig() };
      } catch (e) { return { success: false, message: e.message }; }
    });
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const fireKirinApp = new FireKirinApp();
  fireKirinApp.init().catch(error => console.error('💥 Failed to initialize app:', error));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const fireKirinApp = new FireKirinApp();
    fireKirinApp.init().catch(error => console.error('💥 Failed to re-initialize app:', error));
  }
});

process.on('uncaughtException', (error) => console.error('💥 Uncaught Exception:', error));
process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));