

// const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
// const path = require('path');
// const Database = require('../database/database');
// const RouletteProcessor = require('./roulette-processor');
// const crypto = require('crypto');
// const MainUserManager = require("./auth/MainUserManager");
// app.commandLine.appendSwitch('js-flags', '--expose-gc');

// class FireKirinApp {
//   constructor() {
//     this.mainWindow = null;
//     this.db = null;
//     this.processor = null;
//     this.userManager = null;
//     this.profileName = null;
//   }

//   async init() {
//     console.log('🚀 Initializing Milkyway App...');
    
//     // IMPORTANT: Select profile FIRST
//     this.profileName = await this.selectInstanceProfile();
    
//     await this.initializeDatabase();
//     this.createMainWindow();
//     this.setupIPC();
//     console.log('✅ Milkyway App initialized successfully');
//   }

//   async selectInstanceProfile() {
//     // Get existing profiles
//     const existingProfiles = this.getExistingProfiles();
    
//     const buttons = [
//       ...existingProfiles.slice(0, 5), // Show up to 5 existing profiles
//       '➕ Create New Profile'
//     ];

//     const result = await dialog.showMessageBox(null, {
//       type: 'question',
//       buttons: buttons,
//       defaultId: 0,
//       title: '🎯 Milkyway - Select Profile',
//       message: 'Choose which profile to use',
//       detail: 'Each profile has separate accounts.\nYou can run multiple instances with different profiles.',
//       noLink: true
//     });

//     // If "Create New Profile" selected
//     if (result.response === buttons.length - 1) {
//       return await this.createNewProfile();
//     }

//     return existingProfiles[result.response];
//   }

//   getExistingProfiles() {
//     const fs = require('fs');
//     const isDev = !app.isPackaged;
//     const baseDataDir = isDev 
//       ? path.join(__dirname, '..', 'data')
//       : path.join(process.resourcesPath, 'data');

//     try {
//       if (fs.existsSync(baseDataDir)) {
//         const profiles = fs.readdirSync(baseDataDir)
//           .filter(item => {
//             const fullPath = path.join(baseDataDir, item);
//             return fs.statSync(fullPath).isDirectory();
//           });
        
//         if (profiles.length > 0) {
//           return profiles;
//         }
//       }
//     } catch (error) {
//       console.log('No existing profiles found');
//     }

//     // Default profiles if none exist
//     return ['Profile_1', 'Profile_2', 'Profile_3'];
//   }

//   async createNewProfile() {
//     // Simple input dialog alternative
//     const profileNumber = Math.floor(Math.random() * 10000);
//     const defaultName = `Profile_${profileNumber}`;

//     const result = await dialog.showMessageBox(null, {
//       type: 'question',
//       buttons: ['Use Default', 'Cancel'],
//       defaultId: 0,
//       title: 'Create New Profile',
//       message: 'Create new profile?',
//       detail: `New profile name: ${defaultName}\n\nClick "Use Default" to create this profile.`
//     });

//     if (result.response === 0) {
//       return defaultName;
//     }

//     // If cancelled, use default
//     return 'Profile_1';
//   }

//   async initializeDatabase() {
//     console.log(`📁 Initializing database for profile: ${this.profileName}...`);
//     this.db = new Database(this.profileName);
//     await this.db.init();
    
//     // ✅ NEW: Initialize processor at startup
//     this.initializeProcessorForBetManagement();
//   }

//   // ✅ NEW: Initialize processor specifically for bet management
//   initializeProcessorForBetManagement() {
//     if (!this.processor) {
//       this.processor = new RouletteProcessor(this.db);
      
//       // Setup bet event listeners
//       this.processor.on('betConfigChanged', (data) => {
//         if (this.mainWindow && !this.mainWindow.isDestroyed()) {
//           this.mainWindow.webContents.send('bet:configChanged', data);
//         }
//       });

//       this.processor.on('betUpdate', (data) => {
//         if (this.mainWindow && !this.mainWindow.isDestroyed()) {
//           this.mainWindow.webContents.send('bet:update', data);
//         }
//       });

//       this.processor.on('betError', (data) => {
//         if (this.mainWindow && !this.mainWindow.isDestroyed()) {
//           this.mainWindow.webContents.send('bet:error', data);
//         }
//       });
      
//       console.log('🎯 Bet processor initialized at startup');
//     }
//   }

//   createMainWindow() {
//     console.log('🖥️ Creating main window...');
    
//     this.mainWindow = new BrowserWindow({
//       width: 1200,
//       height: 800,
//       minWidth: 1000,
//       minHeight: 700,
//       webPreferences: {
//         nodeIntegration: false,
//         contextIsolation: true,
//         preload: path.join(__dirname, 'preload.js'),
//         enableRemoteModule: false,
//       },
//       title: `Milkyway - ${this.profileName}`,
//       show: false
//     });

//     const isDev = !app.isPackaged;
    
//     if (isDev) {
//       this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
//     } else {
//       this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
//     }

//     if (!isDev) {
//       this.mainWindow.setMenu(null);
//     }

//     this.mainWindow.once('ready-to-show', () => {
//       console.log('✅ Window ready to show');
//       this.mainWindow.show();
//       this.initializeFirebase();
      
//       if (isDev) {
//         this.mainWindow.webContents.openDevTools();
//       }
//     });

//     this.mainWindow.on('closed', () => {
//       console.log('🔴 Main window closed');
//       this.mainWindow = null;
//       if (this.processor) {
//         this.processor.stopProcessing();
//       }
//       if (this.db) {
//         this.db.close();
//       }
//     });
//   }

//   async initializeFirebase() {
//     try {
//       this.userManager = new MainUserManager(this.mainWindow);
//       console.log('✅ Firebase UserManager initialized in Main Process');
//     } catch (error) {
//       console.error('❌ Firebase initialization failed:', error);
//     }
//   }

//   setupIPC() {
//     console.log('🔌 Setting up IPC handlers...');
    
//     this.setupUserManagementIPC();
//     this.setupAccountManagementIPC();
//     this.setupProcessingIPC();
//     this.setupProfileIPC();
//     this.setupBetManagementIPC(); // ✅ NEW: Separate bet management IPC

//     console.log('✅ IPC handlers setup completed');
//   }

//   // Profile IPC handlers
//   setupProfileIPC() {
//     ipcMain.handle('profile:getCurrent', async () => {
//       return { profileName: this.profileName };
//     });

//     ipcMain.handle('profile:getAll', async () => {
//       return { profiles: this.getExistingProfiles() };
//     });
//   }

//   setupUserManagementIPC() {
//     ipcMain.handle('user-management:initialize', async (event) => {
//         try {
//             console.log('🔄 Initializing user management in main process...');
            
//             if (!this.db) {
//                 throw new Error('Database not initialized');
//             }
            
//             console.log('✅ User management initialized successfully');
//             return { 
//                 success: true, 
//                 message: 'User management ready'
//             };
//         } catch (error) {
//             console.error('❌ User management initialization failed:', error);
//             return { 
//                 success: false, 
//                 error: error.message 
//             };
//         }
//     });

//     ipcMain.handle('user-management:getCurrentUser', async (event) => {
//         try {
//             if (this.userManager && this.userManager.currentUser) {
//                 return { 
//                     success: true, 
//                     user: this.userManager.currentUser 
//                 };
//             } else {
//                 return { 
//                     success: true, 
//                     user: null 
//                 };
//             }
//         } catch (error) {
//             return { 
//                 success: false, 
//                 error: error.message 
//             };
//         }
//     });

//     ipcMain.handle('user-management:register', async (event, email, password) => {
//         try {
//             if (!this.userManager) {
//                 throw new Error('User manager not initialized');
//             }
            
//             const result = await this.userManager.registerUser(email, password);
//             return result;
//         } catch (error) {
//             return { 
//                 success: false, 
//                 message: error.message 
//             };
//         }
//     });

//     ipcMain.handle('user-management:login', async (event, email, password) => {
//         try {
//             if (!this.userManager) {
//                 throw new Error('User manager not initialized');
//             }
            
//             const result = await this.userManager.loginUser(email, password);
//             return result;
//         } catch (error) {
//             return { 
//                 success: false, 
//                 message: error.message 
//             };
//         }
//     });
//   }

//   setupAccountManagementIPC() {
//     ipcMain.handle('accounts:getAll', async () => {
//       try {
//         const accounts = await this.db.getAllAccounts();
//         return accounts;
//       } catch (error) {
//         throw error;
//       }
//     });

//     ipcMain.handle('accounts:add', async (event, account) => {
//       if (account.password && !account.password.match(/^[a-f0-9]{32}$/)) {
//         account.password = crypto.createHash('md5').update(account.password).digest('hex');
//       }

//       try {
//         const result = await this.db.addAccount(account);
//         return result;
//       } catch (error) {
//         throw error;
//       }
//     });

//     ipcMain.handle('accounts:addBulk', async (event, accounts) => {
//       const accountsWithMD5 = accounts.map(account => {
//         const md5Password = crypto.createHash('md5').update(account.password).digest('hex');
//         return {
//           ...account,
//           password: md5Password
//         };
//       });

//       try {
//         const result = await this.db.addBulkAccounts(accountsWithMD5);
//         return result;
//       } catch (error) {
//         throw error;
//       }
//     });

//     ipcMain.handle('accounts:update', async (event, account) => {
//       return await this.db.updateAccount(account);
//     });

//     ipcMain.handle('accounts:delete', async (event, id) => {
//       return await this.db.deleteAccount(id);
//     });

//     ipcMain.handle('accounts:deleteMultiple', async (event, ids) => {
//       return await this.db.deleteMultipleAccounts(ids);
//     });
//   }

//   setupProcessingIPC() {
//     ipcMain.handle('processing:start', async (event, accountIds, repetitions = 1) => {
//       try {
//         // ✅ FIXED: Ensure processor exists
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }

//         // Setup processing event listeners if not already set
//         if (!this.processorHasEventListeners()) {
//           this.setupProcessorEventListeners();
//         }

//         const result = await this.processor.startProcessing(accountIds, repetitions);
//         return result;
//       } catch (error) {
//         console.error('❌ Error starting processing:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     ipcMain.handle('processing:stop', async () => {
//       if (this.processor) {
//         await this.processor.stopProcessing();
//         return true;
//       }
//       return false;
//     });

//     ipcMain.handle('processing:getStatus', async () => {
//       return this.processor ? this.processor.getStatus() : { running: false };
//     });
//   }

//   // ✅ NEW: Setup processor event listeners
//   setupProcessorEventListeners() {
//     if (!this.processor || !this.mainWindow) return;

//     // Processing events
//     this.processor.on('status', (data) => {
//       this.mainWindow.webContents.send('processing:status', data);
//     });

//     this.processor.on('terminal', (data) => {
//       this.mainWindow.webContents.send('processing:terminal', data);
//     });

//     this.processor.on('progress', (data) => {
//       this.mainWindow.webContents.send('processing:progress', data);
//     });

//     this.processor.on('completed', (data) => {
//       this.mainWindow.webContents.send('processing:completed', data);
//     });

//     // Cycle events
//     this.processor.on('cycleUpdate', (data) => {
//       this.mainWindow.webContents.send('processing:cycleUpdate', data);
//     });

//     this.processor.on('cycleStart', (data) => {
//       this.mainWindow.webContents.send('processing:cycleStart', data);
//     });

//     this.processor.on('cycleComplete', (data) => {
//       this.mainWindow.webContents.send('processing:cycleComplete', data);
//     });

//     this.processor.on('cycleProgress', (data) => {
//       this.mainWindow.webContents.send('processing:cycleProgress', data);
//     });

//     // Bet events (these are already setup in initializeProcessorForBetManagement)
//     console.log('✅ Processor event listeners setup completed');
//   }

//   // ✅ NEW: Check if processor has event listeners
//   processorHasEventListeners() {
//     // Check if any processing event listeners are registered
//     const events = [
//       'status', 'terminal', 'progress', 'completed',
//       'cycleUpdate', 'cycleStart', 'cycleComplete', 'cycleProgress'
//     ];
    
//     return events.some(event => this.processor.listenerCount(event) > 0);
//   }

//   // ✅ NEW: Separate bet management IPC setup
//   setupBetManagementIPC() {
//     console.log('🔌 Setting up bet management IPC handlers...');

//     // ✅ FIXED: Bet set amount handler
//     ipcMain.handle('bet:setAmount', async (event, amount) => {
//       try {
//         console.log(`🎯 Bet set amount requested: ${amount}`);
        
//         // ✅ FIXED: Ensure processor exists
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }
        
//         const success = this.processor.handleBetChange(amount);
//         return { 
//           success: success,
//           message: success ? `Bet amount set to ${amount}` : 'Failed to set bet amount',
//           newAmount: amount,
//           config: this.processor.getBetConfig()
//         };
//       } catch (error) {
//         console.error('❌ Error setting bet amount:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     // ✅ FIXED: Bet reset handler
//     ipcMain.handle('bet:reset', async () => {
//       try {
//         console.log('🔄 Bet reset requested');
        
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }
        
//         const defaultBet = this.processor.resetToDefaultBet();
//         return { 
//           success: true,
//           message: 'Bet reset to default',
//           defaultBet: defaultBet,
//           config: this.processor.getBetConfig()
//         };
//       } catch (error) {
//         console.error('❌ Error resetting bet:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     // ✅ FIXED: Get bet config handler
//     ipcMain.handle('bet:getConfig', async () => {
//       try {
//         console.log('📋 Get bet config requested');
        
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }
        
//         const config = this.processor.getBetConfig();
//         return { 
//           success: true,
//           config: config
//         };
//       } catch (error) {
//         console.error('❌ Error getting bet config:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     // ✅ FIXED: Update bet config handler
//     ipcMain.handle('bet:updateConfig', async (event, config) => {
//       try {
//         console.log('⚙️ Update bet config requested:', config);
        
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }
        
//         const success = this.processor.updateBetConfig(config);
//         return { 
//           success: success,
//           message: success ? 'Bet configuration updated' : 'Failed to update configuration',
//           config: this.processor.getBetConfig()
//         };
//       } catch (error) {
//         console.error('❌ Error updating bet config:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     // ✅ FIXED: Get current bet handler
//     ipcMain.handle('bet:getCurrent', async () => {
//       try {
//         console.log('🎯 Get current bet requested');
        
//         if (!this.processor) {
//           this.initializeProcessorForBetManagement();
//         }
        
//         const currentBet = this.processor.getCurrentBetAmount();
//         const config = this.processor.getBetConfig();
//         return { 
//           success: true,
//           currentBet: currentBet,
//           config: config
//         };
//       } catch (error) {
//         console.error('❌ Error getting current bet:', error);
//         return { 
//           success: false, 
//           message: error.message 
//         };
//       }
//     });

//     console.log('✅ Bet management IPC handlers setup completed');
//   }
// }

// // App initialization
// app.whenReady().then(() => {
//   const fireKirinApp = new FireKirinApp();
//   fireKirinApp.init().catch(error => {
//     console.error('💥 Failed to initialize app:', error);
//   });
// });

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit();
//   }
// });

// app.on('activate', () => {
//   if (BrowserWindow.getAllWindows().length === 0) {
//     const fireKirinApp = new FireKirinApp();
//     fireKirinApp.init();
//   }
// });

// app.on('before-quit', () => {
//   console.log('🔴 App quitting...');
// });

// process.on('uncaughtException', (error) => {
//   console.error('💥 Uncaught Exception:', error);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
// });
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
// ROOT PROBLEM WITH MULTIPLE PROFILES ON ONE PC:
// All Electron renderer processes in the same app share one ipcMain. When
// Profile 1 registers 'accounts:getAll' and then Profile 2 also registers
// 'accounts:getAll', Profile 2's handler silently replaces Profile 1's.
// From that point, both windows call the same handler — Profile 1's DB
// queries go to Profile 2's database.
//
// FIX: Each FireKirinApp instance gets a unique instanceId. All IPC channels
// are prefixed with that id (e.g. 'inst_a3f2:accounts:getAll'). The preload
// receives the instanceId via a dedicated bootstrap channel and builds all
// its ipcRenderer.invoke() calls using that prefix. This completely isolates
// IPC handlers between profiles running on the same machine.
// ---------------------------------------------------------------------------

const activeInstances = new Map();    // instanceId -> FireKirinApp
const instanceHandlers = new Map();   // instanceId -> Set of channel names

function registerInstanceHandler(instanceId, channel, handler) {
  const fullChannel = `${instanceId}:${channel}`;
  // Remove any previous handler for this exact full channel
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
// With 4 profiles on one PC, total concurrent sockets can reach 4 × 10 = 40.
// The OS/server starts dropping connections above ~15-20 simultaneous TCP
// handshakes from one IP. This coordinator enforces a global socket cap
// across ALL profiles so the total never exceeds MAX_GLOBAL_SOCKETS.
// Each profile acquires a slot before opening a socket and releases it after.
// ---------------------------------------------------------------------------
const GlobalSocketCoordinator = {
  // SPEED FIX: Raised from 12 to 30.
  // Old value of 12 allowed only 6 accounts to run concurrently (each holds
  // 2 slots momentarily during login→game transition). With 30 slots,
  // 4 profiles × 8 batch size = 32 peak — the coordinator queues the last 2
  // gracefully rather than serializing all 32.
  // On a single profile, 8 concurrent accounts fit easily within 30.
  // 14 = safe ceiling for 4 profiles on one IP.
  // Server blocks after ~16 simultaneous connections; 14 gives a 2-slot margin.
  // Single profile: 4 concurrent sockets, plenty of headroom.
  MAX_GLOBAL_SOCKETS: 14,
  currentCount: 0,
  waitQueue: [],

  acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.currentCount < this.MAX_GLOBAL_SOCKETS) {
          this.currentCount++;
          resolve();
        } else {
          this.waitQueue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  },

  release() {
    this.currentCount = Math.max(0, this.currentCount - 1);
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next();
    }
  },

  getCount() { return this.currentCount; },
  getQueueLength() { return this.waitQueue.length; }
};

// Expose coordinator to processor instances
global.GlobalSocketCoordinator = GlobalSocketCoordinator;

// ---------------------------------------------------------------------------
// FireKirinApp — one instance per profile window
// ---------------------------------------------------------------------------
class FireKirinApp {
  constructor() {
    this.mainWindow = null;
    this.db = null;
    this.processor = null;
    this.userManager = null;
    this.profileName = null;
    this._processingListenersAttached = false;

    // Unique id for this profile instance's IPC namespace
    this.instanceId = `inst_${Math.random().toString(36).substring(2, 8)}`;
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
    const buttons = [
      ...existingProfiles.slice(0, 5),
      '➕ Create New Profile'
    ];

    const result = await dialog.showMessageBox(null, {
      type: 'question',
      buttons,
      defaultId: 0,
      title: '🎯 Milkyway - Select Profile',
      message: 'Choose which profile to use',
      detail: `Instance: ${this.instanceId}\nEach profile has separate accounts.\nYou can run multiple instances with different profiles.`,
      noLink: true
    });

    if (result.response === buttons.length - 1) {
      return await this.createNewProfile();
    }
    return existingProfiles[result.response];
  }

  getExistingProfiles() {
    const fs = require('fs');
    const isDev = !app.isPackaged;
    const baseDataDir = isDev
      ? path.join(__dirname, '..', 'data')
      : path.join(process.resourcesPath, 'data');

    try {
      if (fs.existsSync(baseDataDir)) {
        const profiles = fs.readdirSync(baseDataDir).filter(item => {
          const fullPath = path.join(baseDataDir, item);
          return fs.statSync(fullPath).isDirectory();
        });
        if (profiles.length > 0) return profiles;
      }
    } catch (error) {
      console.log('No existing profiles found');
    }
    return ['Profile_1', 'Profile_2', 'Profile_3', 'Profile_4'];
  }

  async createNewProfile() {
    const profileNumber = Math.floor(Math.random() * 10000);
    const defaultName = `Profile_${profileNumber}`;
    const result = await dialog.showMessageBox(null, {
      type: 'question',
      buttons: ['Use Default', 'Cancel'],
      defaultId: 0,
      title: 'Create New Profile',
      message: 'Create new profile?',
      detail: `New profile name: ${defaultName}\n\nClick "Use Default" to create this profile.`
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

    // Pass instance metadata to processor so it can stagger relative to others
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
    console.log(`🖥️ Creating main window [${this.instanceId}]...`);

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        enableRemoteModule: false
      },
      title: `Milkyway - ${this.profileName}`,
      show: false
    });

    const isDev = !app.isPackaged;

    // Register a synchronous IPC handler so the preload can fetch this
    // window's instanceId before contextBridge.exposeInMainWorld() runs.
    // Using ipcMain.on (not handle) because preload uses sendSync.
    // We store the handler reference so we can remove it after first use
    // — one response per window is all that's needed.
    const syncChannel = 'preload:getInstanceId';
    const syncHandler = (event) => {
      // Only answer if the request comes from THIS window's webContents
      if (event.sender === this.mainWindow.webContents) {
        event.returnValue = this.instanceId;
      }
    };
    ipcMain.on(syncChannel, syncHandler);
    // Clean up after the window is destroyed
    this.mainWindow.once('closed', () => {
      ipcMain.removeListener(syncChannel, syncHandler);
    });

    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
    if (!isDev) this.mainWindow.setMenu(null);

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.initializeFirebase();
      if (isDev) this.mainWindow.webContents.openDevTools();
    });

    this.mainWindow.on('closed', () => {
      console.log(`🔴 Window closed [${this.instanceId}]`);
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
    console.log(`🔌 Setting up IPC handlers [${this.instanceId}]...`);

    // Bootstrap: renderer calls this generic channel with no prefix to learn its instanceId
    // This is the ONLY global (non-namespaced) handler per instance
    const bootstrapChannel = `bootstrap:instanceId:${this.instanceId}`;
    try { ipcMain.removeHandler(bootstrapChannel); } catch (_) {}
    ipcMain.handle(bootstrapChannel, () => ({
      instanceId: this.instanceId,
      profileName: this.profileName
    }));

    // All other handlers are namespaced
    this.setupProfileIPC();
    this.setupUserManagementIPC();
    this.setupAccountManagementIPC();
    this.setupProcessingIPC();
    this.setupBetManagementIPC();

    // Tell the renderer which instanceId to use (send after window is ready)
    this.mainWindow.webContents.once('did-finish-load', () => {
      this._sendToWindow('app:instanceId', {
        instanceId: this.instanceId,
        profileName: this.profileName
      });
    });

    console.log(`✅ IPC handlers setup completed [${this.instanceId}]`);
  }

  h(channel, handler) {
    // Shorthand: register a namespaced handler for this instance
    registerInstanceHandler(this.instanceId, channel, handler);
  }

  setupProfileIPC() {
    this.h('profile:getCurrent', async () => ({ profileName: this.profileName }));
    this.h('profile:getAll', async () => ({ profiles: this.getExistingProfiles() }));
  }

  setupUserManagementIPC() {
    this.h('user-management:initialize', async () => {
      try {
        if (!this.db) throw new Error('Database not initialized');
        return { success: true, message: 'User management ready' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    this.h('user-management:getCurrentUser', async () => {
      try {
        if (this.userManager?.currentUser) return { success: true, user: this.userManager.currentUser };
        return { success: true, user: null };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    this.h('user-management:register', async (event, email, password) => {
      try {
        if (!this.userManager) throw new Error('User manager not initialized');
        return await this.userManager.registerUser(email, password);
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    this.h('user-management:login', async (event, email, password) => {
      try {
        if (!this.userManager) throw new Error('User manager not initialized');
        return await this.userManager.loginUser(email, password);
      } catch (error) {
        return { success: false, message: error.message };
      }
    });
  }

  setupAccountManagementIPC() {
    this.h('accounts:getAll', async () => this.db.getAllAccounts());

    this.h('accounts:add', async (event, account) => {
      if (account.password && !account.password.match(/^[a-f0-9]{32}$/)) {
        account.password = crypto.createHash('md5').update(account.password).digest('hex');
      }
      return await this.db.addAccount(account);
    });

    this.h('accounts:addBulk', async (event, accounts) => {
      const withMD5 = accounts.map(a => ({
        ...a,
        password: crypto.createHash('md5').update(a.password).digest('hex')
      }));
      return await this.db.addBulkAccounts(withMD5);
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
        const result = await this.processor.startProcessing(accountIds, repetitions);
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

    const processingEvents = [
      'status', 'terminal', 'progress', 'completed',
      'cycleUpdate', 'cycleStart', 'cycleComplete', 'cycleProgress'
    ];
    processingEvents.forEach(evt => this.processor.removeAllListeners(evt));

    // Re-attach bet listeners (cleared above)
    this.processor.on('betConfigChanged', (data) => this._sendToWindow('bet:configChanged', data));
    this.processor.on('betUpdate', (data) => this._sendToWindow('bet:update', data));
    this.processor.on('betError', (data) => this._sendToWindow('bet:error', data));

    // Processing listeners
    this.processor.on('status', (data) => this._sendToWindow('processing:status', data));
    this.processor.on('terminal', (data) => this._sendToWindow('processing:terminal', data));
    this.processor.on('progress', (data) => this._sendToWindow('processing:progress', data));
    this.processor.on('completed', (data) => this._sendToWindow('processing:completed', data));
    this.processor.on('cycleUpdate', (data) => this._sendToWindow('processing:cycleUpdate', data));
    this.processor.on('cycleStart', (data) => this._sendToWindow('processing:cycleStart', data));
    this.processor.on('cycleComplete', (data) => this._sendToWindow('processing:cycleComplete', data));
    this.processor.on('cycleProgress', (data) => this._sendToWindow('processing:cycleProgress', data));

    this._processingListenersAttached = true;
    console.log(`✅ Processor event listeners attached [${this.instanceId}]`);
  }

  setupBetManagementIPC() {
    this.h('bet:setAmount', async (event, amount) => {
      try {
        if (!this.processor) this.initializeProcessor();
        const success = this.processor.handleBetChange(amount);
        return { success, message: success ? `Bet set to ${amount}` : 'Failed', newAmount: amount, config: this.processor.getBetConfig() };
      } catch (error) { return { success: false, message: error.message }; }
    });

    this.h('bet:reset', async () => {
      try {
        if (!this.processor) this.initializeProcessor();
        const defaultBet = this.processor.resetToDefaultBet();
        return { success: true, defaultBet, config: this.processor.getBetConfig() };
      } catch (error) { return { success: false, message: error.message }; }
    });

    this.h('bet:getConfig', async () => {
      try {
        if (!this.processor) this.initializeProcessor();
        return { success: true, config: this.processor.getBetConfig() };
      } catch (error) { return { success: false, message: error.message }; }
    });

    this.h('bet:updateConfig', async (event, config) => {
      try {
        if (!this.processor) this.initializeProcessor();
        const success = this.processor.updateBetConfig(config);
        return { success, config: this.processor.getBetConfig() };
      } catch (error) { return { success: false, message: error.message }; }
    });

    this.h('bet:getCurrent', async () => {
      try {
        if (!this.processor) this.initializeProcessor();
        return { success: true, currentBet: this.processor.getCurrentBetAmount(), config: this.processor.getBetConfig() };
      } catch (error) { return { success: false, message: error.message }; }
    });
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const fireKirinApp = new FireKirinApp();
  fireKirinApp.init().catch(error => {
    console.error('💥 Failed to initialize app:', error);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const fireKirinApp = new FireKirinApp();
    fireKirinApp.init().catch(error => {
      console.error('💥 Failed to re-initialize app:', error);
    });
  }
});

app.on('before-quit', () => {
  console.log('🔴 App quitting...');
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', promise, 'reason:', reason);
});