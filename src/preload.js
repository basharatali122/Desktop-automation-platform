const { contextBridge, ipcRenderer } = require('electron');

// Get instanceId synchronously from main before anything else
let instanceId;
try {
  instanceId = ipcRenderer.sendSync('preload:getInstanceId');
} catch (e) {
  instanceId = `inst_fallback_${Date.now().toString(36)}`;
  console.error('❌ preload: failed to get instanceId:', e.message);
}
if (!instanceId || typeof instanceId !== 'string') {
  instanceId = `inst_bad_${Date.now().toString(36)}`;
}

function ch(channel) { return `${instanceId}:${channel}`; }

const listenerRegistry = new Map();
function safeOn(channel, callback) {
  if (listenerRegistry.has(channel)) ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
  const wrapped = (_event, data) => callback(_event, data);
  listenerRegistry.set(channel, wrapped);
  ipcRenderer.on(channel, wrapped);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getInstanceId: () => instanceId,

  userManagement: {
    initialize:     ()            => ipcRenderer.invoke(ch('user-management:initialize')),
    getCurrentUser: ()            => ipcRenderer.invoke(ch('user-management:getCurrentUser')),
    registerUser:   (email, pass) => ipcRenderer.invoke(ch('user-management:register'), email, pass),
    loginUser:      (email, pass) => ipcRenderer.invoke(ch('user-management:login'), email, pass),
    onShowRegistration:    (cb) => safeOn('show-registration',    cb),
    onShowMainApp:         (cb) => safeOn('show-main-app',        cb),
    onShowPendingApproval: (cb) => safeOn('show-pending-approval', cb)
  },

  accounts: {
    getAll:         ()         => ipcRenderer.invoke(ch('accounts:getAll')),
    add:            (a)        => ipcRenderer.invoke(ch('accounts:add'),            a),
    addBulk:        (a)        => ipcRenderer.invoke(ch('accounts:addBulk'),        a),
    update:         (a)        => ipcRenderer.invoke(ch('accounts:update'),         a),
    delete:         (id)       => ipcRenderer.invoke(ch('accounts:delete'),         id),
    deleteMultiple: (ids)      => ipcRenderer.invoke(ch('accounts:deleteMultiple'), ids)
  },

  processing: {
    start:     (ids, reps) => ipcRenderer.invoke(ch('processing:start'), ids, reps),
    stop:      ()          => ipcRenderer.invoke(ch('processing:stop')),
    getStatus: ()          => ipcRenderer.invoke(ch('processing:getStatus'))
  },

  profile: {
    getCurrent: () => ipcRenderer.invoke(ch('profile:getCurrent')),
    getAll:     () => ipcRenderer.invoke(ch('profile:getAll'))
  },

  bet: {
    setAmount:    (amount) => ipcRenderer.invoke(ch('bet:setAmount'),    amount),
    reset:        ()       => ipcRenderer.invoke(ch('bet:reset')),
    getConfig:    ()       => ipcRenderer.invoke(ch('bet:getConfig')),
    updateConfig: (cfg)    => ipcRenderer.invoke(ch('bet:updateConfig'), cfg),
    getCurrent:   ()       => ipcRenderer.invoke(ch('bet:getCurrent'))
  },

  // Proxy management — per profile
  proxy: {
    setConfig: (cfg)      => ipcRenderer.invoke(ch('proxy:setConfig'), cfg),
    getConfig: ()         => ipcRenderer.invoke(ch('proxy:getConfig')),
    test:      (proxyUrl) => ipcRenderer.invoke(ch('proxy:test'),      proxyUrl)
  },

  onProcessingStatus:    (cb) => safeOn('processing:status',     cb),
  onProcessingTerminal:  (cb) => safeOn('processing:terminal',   cb),
  onProcessingProgress:  (cb) => safeOn('processing:progress',   cb),
  onProcessingCompleted: (cb) => safeOn('processing:completed',  cb),
  onCycleUpdate:         (cb) => safeOn('processing:cycleUpdate',   cb),
  onCycleStart:          (cb) => safeOn('processing:cycleStart',    cb),
  onCycleComplete:       (cb) => safeOn('processing:cycleComplete', cb),
  onCycleProgress:       (cb) => safeOn('processing:cycleProgress', cb),

  onBetConfigChanged: (cb) => safeOn('bet:configChanged', cb),
  onBetUpdate:        (cb) => safeOn('bet:update',        cb),
  onBetError:         (cb) => safeOn('bet:error',         cb),
  onAppInstanceId:    (cb) => safeOn('app:instanceId',    cb),

  removeAllListeners: (channel) => {
    if (listenerRegistry.has(channel)) {
      ipcRenderer.removeListener(channel, listenerRegistry.get(channel));
      listenerRegistry.delete(channel);
    }
    ipcRenderer.removeAllListeners(channel);
  }
});