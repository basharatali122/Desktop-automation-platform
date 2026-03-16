

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // User Management APIs
  userManagement: {
    initialize: () => ipcRenderer.invoke('user-management:initialize'),
    getCurrentUser: () => ipcRenderer.invoke('user-management:getCurrentUser'),
    registerUser: (email, password) => ipcRenderer.invoke('user-management:register', email, password),
    loginUser: (email, password) => ipcRenderer.invoke('user-management:login', email, password),
    
    // Auth state listeners
    onShowRegistration: (callback) => ipcRenderer.on('show-registration', callback),
    onShowMainApp: (callback) => ipcRenderer.on('show-main-app', callback),
    onShowPendingApproval: (callback) => ipcRenderer.on('show-pending-approval', callback)
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
  
  // ✅ UPDATED: Bet Management APIs - Correct structure
  bet: {
    setAmount: (amount) => ipcRenderer.invoke('bet:setAmount', amount),
    reset: () => ipcRenderer.invoke('bet:reset'),
    getConfig: () => ipcRenderer.invoke('bet:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('bet:updateConfig', config),
    getCurrent: () => ipcRenderer.invoke('bet:getCurrent')
  },
  
  // Event listeners
  onProcessingStatus: (callback) => ipcRenderer.on('processing:status', callback),
  onProcessingTerminal: (callback) => ipcRenderer.on('processing:terminal', callback),
  onProcessingProgress: (callback) => ipcRenderer.on('processing:progress', callback),
  onProcessingCompleted: (callback) => ipcRenderer.on('processing:completed', callback),
  onCycleUpdate: (callback) => ipcRenderer.on('processing:cycleUpdate', callback),
  onCycleStart: (callback) => ipcRenderer.on('processing:cycleStart', callback),
  onCycleComplete: (callback) => ipcRenderer.on('processing:cycleComplete', callback),
  onCycleProgress: (callback) => ipcRenderer.on('processing:cycleProgress', callback),
  
  // ✅ UPDATED: Bet event listeners - Correct channel names
  onBetConfigChanged: (callback) => ipcRenderer.on('bet:configChanged', callback),
  onBetUpdate: (callback) => ipcRenderer.on('bet:update', callback),
  onBetError: (callback) => ipcRenderer.on('bet:error', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});