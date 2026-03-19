

// const { contextBridge, ipcRenderer } = require('electron');

// contextBridge.exposeInMainWorld('electronAPI', {
//   // User Management APIs
//   userManagement: {
//     initialize: () => ipcRenderer.invoke('user-management:initialize'),
//     getCurrentUser: () => ipcRenderer.invoke('user-management:getCurrentUser'),
//     registerUser: (email, password) => ipcRenderer.invoke('user-management:register', email, password),
//     loginUser: (email, password) => ipcRenderer.invoke('user-management:login', email, password),
    
//     // Auth state listeners
//     onShowRegistration: (callback) => ipcRenderer.on('show-registration', callback),
//     onShowMainApp: (callback) => ipcRenderer.on('show-main-app', callback),
//     onShowPendingApproval: (callback) => ipcRenderer.on('show-pending-approval', callback)
//   },
  
//   // Account management
//   accounts: {
//     getAll: () => ipcRenderer.invoke('accounts:getAll'),
//     add: (account) => ipcRenderer.invoke('accounts:add', account),
//     addBulk: (accounts) => ipcRenderer.invoke('accounts:addBulk', accounts),
//     update: (account) => ipcRenderer.invoke('accounts:update', account),
//     delete: (id) => ipcRenderer.invoke('accounts:delete', id),
//     deleteMultiple: (ids) => ipcRenderer.invoke('accounts:deleteMultiple', ids)
//   },
  
//   // Processing control
//   processing: {
//     start: (accountIds, repetitions) => ipcRenderer.invoke('processing:start', accountIds, repetitions),
//     stop: () => ipcRenderer.invoke('processing:stop'),
//     getStatus: () => ipcRenderer.invoke('processing:getStatus')
//   },
  
//   profile: {
//     getCurrent: () => ipcRenderer.invoke('profile:getCurrent'),
//     getAll: () => ipcRenderer.invoke('profile:getAll')
//   },
  
//   // ✅ UPDATED: Bet Management APIs - Correct structure
//   bet: {
//     setAmount: (amount) => ipcRenderer.invoke('bet:setAmount', amount),
//     reset: () => ipcRenderer.invoke('bet:reset'),
//     getConfig: () => ipcRenderer.invoke('bet:getConfig'),
//     updateConfig: (config) => ipcRenderer.invoke('bet:updateConfig', config),
//     getCurrent: () => ipcRenderer.invoke('bet:getCurrent')
//   },
  
//   // Event listeners
//   onProcessingStatus: (callback) => ipcRenderer.on('processing:status', callback),
//   onProcessingTerminal: (callback) => ipcRenderer.on('processing:terminal', callback),
//   onProcessingProgress: (callback) => ipcRenderer.on('processing:progress', callback),
//   onProcessingCompleted: (callback) => ipcRenderer.on('processing:completed', callback),
//   onCycleUpdate: (callback) => ipcRenderer.on('processing:cycleUpdate', callback),
//   onCycleStart: (callback) => ipcRenderer.on('processing:cycleStart', callback),
//   onCycleComplete: (callback) => ipcRenderer.on('processing:cycleComplete', callback),
//   onCycleProgress: (callback) => ipcRenderer.on('processing:cycleProgress', callback),
  
//   // ✅ UPDATED: Bet event listeners - Correct channel names
//   onBetConfigChanged: (callback) => ipcRenderer.on('bet:configChanged', callback),
//   onBetUpdate: (callback) => ipcRenderer.on('bet:update', callback),
//   onBetError: (callback) => ipcRenderer.on('bet:error', callback),
  
//   // Remove listeners
//   removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
// });


const { contextBridge, ipcRenderer } = require('electron');

// FIX 7: Wrap ipcRenderer.on() so that each channel can only have ONE
// listener at a time. The renderer's setupIPCListeners() was called
// multiple times (on init AND on onShowMainApp), causing every terminal
// message, progress update, and bet event to be delivered 2-4× and
// printed multiple times in the terminal output.
const listenerRegistry = new Map();

function safeOn(channel, callback) {
  // Remove any existing listener for this channel first
  if (listenerRegistry.has(channel)) {
    ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
  }
  // Wrap to match Electron's (event, data) signature
  const wrapped = (event, data) => callback(event, data);
  listenerRegistry.set(channel, wrapped);
  ipcRenderer.on(channel, wrapped);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // User Management APIs
  userManagement: {
    initialize: () => ipcRenderer.invoke('user-management:initialize'),
    getCurrentUser: () => ipcRenderer.invoke('user-management:getCurrentUser'),
    registerUser: (email, password) => ipcRenderer.invoke('user-management:register', email, password),
    loginUser: (email, password) => ipcRenderer.invoke('user-management:login', email, password),

    // Auth state listeners - also deduplicated
    onShowRegistration: (callback) => safeOn('show-registration', callback),
    onShowMainApp: (callback) => safeOn('show-main-app', callback),
    onShowPendingApproval: (callback) => safeOn('show-pending-approval', callback)
  },

  // Account management
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    add: (account) => ipcRenderer.invoke('accounts:add', account),
    addBulk: (accounts) => ipcRenderer.invoke('accounts:addBulk', accounts),
    update: (account) => ipcRenderer.invoke('accounts:update', account),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    deleteMultiple: (ids) => ipcRenderer.invoke('accounts:deleteMultiple', ids)
  },

  // Processing control
  processing: {
    start: (accountIds, repetitions) => ipcRenderer.invoke('processing:start', accountIds, repetitions),
    stop: () => ipcRenderer.invoke('processing:stop'),
    getStatus: () => ipcRenderer.invoke('processing:getStatus')
  },

  profile: {
    getCurrent: () => ipcRenderer.invoke('profile:getCurrent'),
    getAll: () => ipcRenderer.invoke('profile:getAll')
  },

  // Bet Management APIs
  bet: {
    setAmount: (amount) => ipcRenderer.invoke('bet:setAmount', amount),
    reset: () => ipcRenderer.invoke('bet:reset'),
    getConfig: () => ipcRenderer.invoke('bet:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('bet:updateConfig', config),
    getCurrent: () => ipcRenderer.invoke('bet:getCurrent')
  },

  // Event listeners - all deduplicated via safeOn
  onProcessingStatus: (callback) => safeOn('processing:status', callback),
  onProcessingTerminal: (callback) => safeOn('processing:terminal', callback),
  onProcessingProgress: (callback) => safeOn('processing:progress', callback),
  onProcessingCompleted: (callback) => safeOn('processing:completed', callback),
  onCycleUpdate: (callback) => safeOn('processing:cycleUpdate', callback),
  onCycleStart: (callback) => safeOn('processing:cycleStart', callback),
  onCycleComplete: (callback) => safeOn('processing:cycleComplete', callback),
  onCycleProgress: (callback) => safeOn('processing:cycleProgress', callback),

  // Bet event listeners
  onBetConfigChanged: (callback) => safeOn('bet:configChanged', callback),
  onBetUpdate: (callback) => safeOn('bet:update', callback),
  onBetError: (callback) => safeOn('bet:error', callback),

  // Remove a specific channel's listener
  removeAllListeners: (channel) => {
    if (listenerRegistry.has(channel)) {
      ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
      listenerRegistry.delete(channel);
    }
    ipcRenderer.removeAllListeners(channel);
  }
});