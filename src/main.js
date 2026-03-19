

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

// FIX 1: Track registered IPC handlers globally so multiple FireKirinApp
// instances (created on 'activate') never double-register channels.
// ipcMain.handle() throws "Attempted to register a second handler" if called
// twice on the same channel, crashing the app on macOS re-open.
const registeredHandlers = new Set();

function safeHandle(channel, handler) {
  if (registeredHandlers.has(channel)) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle(channel, handler);
  registeredHandlers.add(channel);
}

class FireKirinApp {
  constructor() {
    this.mainWindow = null;
    this.db = null;
    this.processor = null;
    this.userManager = null;
    this.profileName = null;
    // FIX 2: Track whether processing listeners are attached to this
    // specific processor instance, not just whether any listeners exist.
    this._processingListenersAttached = false;
  }

  async init() {
    console.log('🚀 Initializing Milkyway App...');
    this.profileName = await this.selectInstanceProfile();
    await this.initializeDatabase();
    this.createMainWindow();
    this.setupIPC();
    console.log('✅ Milkyway App initialized successfully');
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
      detail: 'Each profile has separate accounts.\nYou can run multiple instances with different profiles.',
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
    return ['Profile_1', 'Profile_2', 'Profile_3'];
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
    console.log(`📁 Initializing database for profile: ${this.profileName}...`);
    this.db = new Database(this.profileName);
    await this.db.init();
    this.initializeProcessorForBetManagement();
  }

  // FIX 3: Processor initialization now removes all previous listeners
  // before adding new ones. The old code added bet listeners here AND
  // processing listeners in setupProcessorEventListeners(), with no
  // deduplication. When the window was re-shown or processing restarted,
  // both sets could accumulate, causing duplicate events and memory leaks.
  initializeProcessorForBetManagement() {
    if (this.processor) {
      this.processor.removeAllListeners();
      this._processingListenersAttached = false;
    }

    this.processor = new RouletteProcessor(this.db);

    // Attach bet-specific listeners immediately
    this.processor.on('betConfigChanged', (data) => {
      this._sendToWindow('bet:configChanged', data);
    });
    this.processor.on('betUpdate', (data) => {
      this._sendToWindow('bet:update', data);
    });
    this.processor.on('betError', (data) => {
      this._sendToWindow('bet:error', data);
    });

    console.log('🎯 Bet processor initialized');
  }

  // Helper: safely send to window if it still exists
  _sendToWindow(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  createMainWindow() {
    console.log('🖥️ Creating main window...');

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        enableRemoteModule: false,
      },
      title: `Milkyway - ${this.profileName}`,
      show: false
    });

    const isDev = !app.isPackaged;
    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));

    if (!isDev) {
      this.mainWindow.setMenu(null);
    }

    this.mainWindow.once('ready-to-show', () => {
      console.log('✅ Window ready to show');
      this.mainWindow.show();
      this.initializeFirebase();
      if (isDev) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    this.mainWindow.on('closed', () => {
      console.log('🔴 Main window closed');
      this.mainWindow = null;
      if (this.processor) {
        this.processor.stopProcessing();
      }
      if (this.db) {
        this.db.close();
      }
    });
  }

  async initializeFirebase() {
    try {
      this.userManager = new MainUserManager(this.mainWindow);
      console.log('✅ Firebase UserManager initialized');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
    }
  }

  setupIPC() {
    console.log('🔌 Setting up IPC handlers...');
    this.setupUserManagementIPC();
    this.setupAccountManagementIPC();
    this.setupProcessingIPC();
    this.setupProfileIPC();
    this.setupBetManagementIPC();
    console.log('✅ IPC handlers setup completed');
  }

  setupProfileIPC() {
    safeHandle('profile:getCurrent', async () => {
      return { profileName: this.profileName };
    });
    safeHandle('profile:getAll', async () => {
      return { profiles: this.getExistingProfiles() };
    });
  }

  setupUserManagementIPC() {
    safeHandle('user-management:initialize', async () => {
      try {
        if (!this.db) throw new Error('Database not initialized');
        return { success: true, message: 'User management ready' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    safeHandle('user-management:getCurrentUser', async () => {
      try {
        if (this.userManager?.currentUser) {
          return { success: true, user: this.userManager.currentUser };
        }
        return { success: true, user: null };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    safeHandle('user-management:register', async (event, email, password) => {
      try {
        if (!this.userManager) throw new Error('User manager not initialized');
        return await this.userManager.registerUser(email, password);
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    safeHandle('user-management:login', async (event, email, password) => {
      try {
        if (!this.userManager) throw new Error('User manager not initialized');
        return await this.userManager.loginUser(email, password);
      } catch (error) {
        return { success: false, message: error.message };
      }
    });
  }

  setupAccountManagementIPC() {
    safeHandle('accounts:getAll', async () => {
      return await this.db.getAllAccounts();
    });

    safeHandle('accounts:add', async (event, account) => {
      if (account.password && !account.password.match(/^[a-f0-9]{32}$/)) {
        account.password = crypto.createHash('md5').update(account.password).digest('hex');
      }
      return await this.db.addAccount(account);
    });

    safeHandle('accounts:addBulk', async (event, accounts) => {
      const accountsWithMD5 = accounts.map(account => ({
        ...account,
        password: crypto.createHash('md5').update(account.password).digest('hex')
      }));
      return await this.db.addBulkAccounts(accountsWithMD5);
    });

    safeHandle('accounts:update', async (event, account) => {
      return await this.db.updateAccount(account);
    });

    safeHandle('accounts:delete', async (event, id) => {
      return await this.db.deleteAccount(id);
    });

    safeHandle('accounts:deleteMultiple', async (event, ids) => {
      return await this.db.deleteMultipleAccounts(ids);
    });
  }

  setupProcessingIPC() {
    safeHandle('processing:start', async (event, accountIds, repetitions = 1) => {
      try {
        if (!this.processor) {
          this.initializeProcessorForBetManagement();
        }

        // FIX 4: Use instance flag instead of listener count check.
        // The old processorHasEventListeners() returned true as soon as
        // bet listeners were attached, so processing listeners were NEVER
        // registered. This meant status/terminal/progress events were
        // emitted by the processor but never forwarded to the renderer.
        if (!this._processingListenersAttached) {
          this.setupProcessorEventListeners();
        }

        const result = await this.processor.startProcessing(accountIds, repetitions);
        return result;
      } catch (error) {
        console.error('❌ Error starting processing:', error);
        return { success: false, message: error.message };
      }
    });

    safeHandle('processing:stop', async () => {
      if (this.processor) {
        await this.processor.stopProcessing();
        return true;
      }
      return false;
    });

    safeHandle('processing:getStatus', async () => {
      return this.processor ? this.processor.getStatus?.() ?? { running: false } : { running: false };
    });
  }

  setupProcessorEventListeners() {
    if (!this.processor) return;

    // FIX 5: Remove any stale processing listeners before attaching fresh ones.
    // Without this, calling startProcessing twice (e.g. after stop+start)
    // doubles up terminal/progress events, flooding the renderer.
    const processingEvents = [
      'status', 'terminal', 'progress', 'completed',
      'cycleUpdate', 'cycleStart', 'cycleComplete', 'cycleProgress'
    ];
    processingEvents.forEach(evt => this.processor.removeAllListeners(evt));

    // Re-attach bet listeners since removeAllListeners cleared them too
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
    console.log('✅ Processor event listeners attached');
  }

  setupBetManagementIPC() {
    console.log('🔌 Setting up bet management IPC handlers...');

    safeHandle('bet:setAmount', async (event, amount) => {
      try {
        if (!this.processor) this.initializeProcessorForBetManagement();
        const success = this.processor.handleBetChange(amount);
        return {
          success,
          message: success ? `Bet amount set to ${amount}` : 'Failed to set bet amount',
          newAmount: amount,
          config: this.processor.getBetConfig()
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    safeHandle('bet:reset', async () => {
      try {
        if (!this.processor) this.initializeProcessorForBetManagement();
        const defaultBet = this.processor.resetToDefaultBet();
        return {
          success: true,
          message: 'Bet reset to default',
          defaultBet,
          config: this.processor.getBetConfig()
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    safeHandle('bet:getConfig', async () => {
      try {
        if (!this.processor) this.initializeProcessorForBetManagement();
        return { success: true, config: this.processor.getBetConfig() };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    safeHandle('bet:updateConfig', async (event, config) => {
      try {
        if (!this.processor) this.initializeProcessorForBetManagement();
        const success = this.processor.updateBetConfig(config);
        return {
          success,
          message: success ? 'Bet configuration updated' : 'Failed to update configuration',
          config: this.processor.getBetConfig()
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    safeHandle('bet:getCurrent', async () => {
      try {
        if (!this.processor) this.initializeProcessorForBetManagement();
        return {
          success: true,
          currentBet: this.processor.getCurrentBetAmount(),
          config: this.processor.getBetConfig()
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    console.log('✅ Bet management IPC handlers setup completed');
  }
}

// App initialization
app.whenReady().then(() => {
  const fireKirinApp = new FireKirinApp();
  fireKirinApp.init().catch(error => {
    console.error('💥 Failed to initialize app:', error);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // FIX 6: On macOS 'activate' (dock click), only create a new instance if
  // no windows exist. The old code always created a new FireKirinApp(),
  // re-registering all IPC handlers and causing the "second handler" crash.
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
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});