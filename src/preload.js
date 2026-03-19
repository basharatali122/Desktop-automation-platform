

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

// ---------------------------------------------------------------------------
// INSTANCE ID — fetched synchronously from main before anything else runs
// ---------------------------------------------------------------------------
// WHY NOT additionalArguments / process.argv:
//   additionalArguments are injected into the RENDERER's process.argv, not
//   the preload's. The preload runs in a separate V8 context where
//   process.argv only contains Electron's own launch flags. So the
//   --instanceId=... arg is invisible here and the fallback fires, producing
//   a different ID than main registered handlers under → "No handler" errors.
//
// FIX: ipcRenderer.sendSync on a one-time bootstrap channel that main
//   registers before the window loads. sendSync blocks the preload until
//   main responds, guaranteeing the correct ID before contextBridge.expose.
// ---------------------------------------------------------------------------

let instanceId;
try {
  // Main registers 'preload:getInstanceId' per-window before loadFile()
  instanceId = ipcRenderer.sendSync('preload:getInstanceId');
} catch (e) {
  // Absolute fallback — should never happen in normal operation
  instanceId = `inst_fallback_${Date.now().toString(36)}`;
  console.error('❌ preload: failed to get instanceId from main:', e.message);
}

if (!instanceId || typeof instanceId !== 'string') {
  instanceId = `inst_bad_${Date.now().toString(36)}`;
  console.error('❌ preload: instanceId from main was invalid:', instanceId);
}

// Prefix every IPC channel with this instance's namespace
function ch(channel) {
  return `${instanceId}:${channel}`;
}

// ---------------------------------------------------------------------------
// DEDUPLICATION — one active listener per logical channel name
// ---------------------------------------------------------------------------
const listenerRegistry = new Map();

function safeOn(channel, callback) {
  if (listenerRegistry.has(channel)) {
    ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
  }
  const wrapped = (_event, data) => callback(_event, data);
  listenerRegistry.set(channel, wrapped);
  ipcRenderer.on(channel, wrapped);
}

// ---------------------------------------------------------------------------
// EXPOSE API TO RENDERER
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('electronAPI', {

  // Renderer can read the resolved instanceId for debugging
  getInstanceId: () => instanceId,

  // User Management
  userManagement: {
    initialize:     ()             => ipcRenderer.invoke(ch('user-management:initialize')),
    getCurrentUser: ()             => ipcRenderer.invoke(ch('user-management:getCurrentUser')),
    registerUser:   (email, pass)  => ipcRenderer.invoke(ch('user-management:register'), email, pass),
    loginUser:      (email, pass)  => ipcRenderer.invoke(ch('user-management:login'), email, pass),
    onShowRegistration:    (cb) => safeOn('show-registration',    cb),
    onShowMainApp:         (cb) => safeOn('show-main-app',         cb),
    onShowPendingApproval: (cb) => safeOn('show-pending-approval', cb)
  },

  // Accounts — talk to THIS instance's database only
  accounts: {
    getAll:         ()          => ipcRenderer.invoke(ch('accounts:getAll')),
    add:            (account)   => ipcRenderer.invoke(ch('accounts:add'),            account),
    addBulk:        (accounts)  => ipcRenderer.invoke(ch('accounts:addBulk'),        accounts),
    update:         (account)   => ipcRenderer.invoke(ch('accounts:update'),         account),
    delete:         (id)        => ipcRenderer.invoke(ch('accounts:delete'),         id),
    deleteMultiple: (ids)       => ipcRenderer.invoke(ch('accounts:deleteMultiple'), ids)
  },

  // Processing
  processing: {
    start:     (accountIds, reps) => ipcRenderer.invoke(ch('processing:start'), accountIds, reps),
    stop:      ()                 => ipcRenderer.invoke(ch('processing:stop')),
    getStatus: ()                 => ipcRenderer.invoke(ch('processing:getStatus'))
  },

  // Profile
  profile: {
    getCurrent: () => ipcRenderer.invoke(ch('profile:getCurrent')),
    getAll:     () => ipcRenderer.invoke(ch('profile:getAll'))
  },

  // Bet management
  bet: {
    setAmount:    (amount) => ipcRenderer.invoke(ch('bet:setAmount'),    amount),
    reset:        ()       => ipcRenderer.invoke(ch('bet:reset')),
    getConfig:    ()       => ipcRenderer.invoke(ch('bet:getConfig')),
    updateConfig: (config) => ipcRenderer.invoke(ch('bet:updateConfig'), config),
    getCurrent:   ()       => ipcRenderer.invoke(ch('bet:getCurrent'))
  },

  // Processing events — sent directly to this BrowserWindow, no namespace needed
  onProcessingStatus:    (cb) => safeOn('processing:status',    cb),
  onProcessingTerminal:  (cb) => safeOn('processing:terminal',  cb),
  onProcessingProgress:  (cb) => safeOn('processing:progress',  cb),
  onProcessingCompleted: (cb) => safeOn('processing:completed', cb),
  onCycleUpdate:         (cb) => safeOn('processing:cycleUpdate',  cb),
  onCycleStart:          (cb) => safeOn('processing:cycleStart',   cb),
  onCycleComplete:       (cb) => safeOn('processing:cycleComplete', cb),
  onCycleProgress:       (cb) => safeOn('processing:cycleProgress', cb),

  // Bet events
  onBetConfigChanged: (cb) => safeOn('bet:configChanged', cb),
  onBetUpdate:        (cb) => safeOn('bet:update',        cb),
  onBetError:         (cb) => safeOn('bet:error',         cb),

  // App identity (main pushes this after load as a convenience)
  onAppInstanceId: (cb) => safeOn('app:instanceId', cb),

  // Remove a registered listener by logical channel name
  removeAllListeners: (channel) => {
    if (listenerRegistry.has(channel)) {
      ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
      listenerRegistry.delete(channel);
    }
    ipcRenderer.removeAllListeners(channel);
  }
});