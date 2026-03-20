// /**
//  * ProxyPanel — injects a proxy configuration section into the sidebar.
//  * Call ProxyPanel.init() once after DOMContentLoaded.
//  * Works alongside the existing FireKirinRenderer class.
//  */
// const ProxyPanel = {

//   async init() {
//     this.createUI();
//     this.bindEvents();
//     await this.loadSaved();
//   },

//   createUI() {
//     const sidebar = document.querySelector('.sidebar-content');
//     if (!sidebar || document.getElementById('proxySection')) return;

//     const section = document.createElement('div');
//     section.className = 'section';
//     section.id = 'proxySection';
//     section.innerHTML = `
//       <div class="section-header">
//         <h3><i class="fas fa-shield-alt"></i> Proxy Settings</h3>
//       </div>
//       <div style="padding:8px 0">

//         <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
//           <label class="proxy-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
//             <input type="checkbox" id="proxyEnabled" style="width:16px;height:16px;cursor:pointer"/>
//             <span>Enable Proxy for this Profile</span>
//           </label>
//         </div>

//         <div id="proxyFields" style="display:none">

//           <div class="form-group" style="margin-bottom:8px">
//             <label style="font-size:12px;color:var(--text-secondary)">
//               <i class="fas fa-globe"></i> Single Proxy URL
//             </label>
//             <input type="text" id="proxyUrl" class="form-input"
//               placeholder="socks5://user:pass@host:port"
//               style="font-size:12px;font-family:monospace"/>
//             <small style="color:var(--text-secondary);font-size:11px">
//               Supports: socks5://, socks4://, http://
//             </small>
//           </div>

//           <div class="form-group" style="margin-bottom:8px">
//             <label style="font-size:12px;color:var(--text-secondary)">
//               <i class="fas fa-list"></i> Proxy List (one per line, optional)
//             </label>
//             <textarea id="proxyList" class="form-input"
//               rows="4" placeholder="socks5://user:pass@host1:port&#10;socks5://user:pass@host2:port"
//               style="font-size:11px;font-family:monospace;resize:vertical"></textarea>
//             <small style="color:var(--text-secondary);font-size:11px">
//               If list provided, accounts rotate through these proxies
//             </small>
//           </div>

//           <div style="display:flex;gap:6px;margin-bottom:8px">
//             <button id="proxyTest" class="btn btn-small btn-info" style="flex:1">
//               <i class="fas fa-plug"></i> Test Proxy
//             </button>
//             <button id="proxySave" class="btn btn-small btn-success" style="flex:1">
//               <i class="fas fa-save"></i> Save
//             </button>
//           </div>

//           <div id="proxyStatus" style="
//             font-size:12px;padding:6px 8px;border-radius:4px;
//             background:rgba(0,0,0,0.2);display:none;word-break:break-all">
//           </div>
//         </div>

//         <div id="proxyBadge" style="
//           font-size:11px;padding:4px 8px;border-radius:12px;display:inline-flex;
//           align-items:center;gap:4px;margin-top:4px;
//           background:rgba(108,117,125,0.2);color:var(--text-secondary)">
//           <i class="fas fa-circle" style="font-size:8px"></i>
//           <span id="proxyBadgeText">No proxy — shared IP</span>
//         </div>

//       </div>
//     `;

//     sidebar.appendChild(section);
//   },

//   bindEvents() {
//     const enabledCb = document.getElementById('proxyEnabled');
//     const fields    = document.getElementById('proxyFields');
//     const testBtn   = document.getElementById('proxyTest');
//     const saveBtn   = document.getElementById('proxySave');

//     enabledCb?.addEventListener('change', () => {
//       fields.style.display = enabledCb.checked ? 'block' : 'none';
//       this.updateBadge(enabledCb.checked, document.getElementById('proxyUrl').value.trim());
//     });

//     testBtn?.addEventListener('click', () => this.testProxy());
//     saveBtn?.addEventListener('click', () => this.saveConfig());

//     document.getElementById('proxyUrl')?.addEventListener('input', () => {
//       this.updateBadge(document.getElementById('proxyEnabled').checked, document.getElementById('proxyUrl').value.trim());
//     });
//   },

//   async loadSaved() {
//     try {
//       if (!window.electronAPI?.proxy?.getConfig) return;
//       const res = await window.electronAPI.proxy.getConfig();
//       if (!res.success) return;
//       const cfg = res.config;

//       document.getElementById('proxyEnabled').checked = !!cfg.enabled;
//       document.getElementById('proxyUrl').value = cfg.proxyUrl || '';
//       document.getElementById('proxyList').value = Array.isArray(cfg.proxyList) ? cfg.proxyList.join('\n') : '';
//       document.getElementById('proxyFields').style.display = cfg.enabled ? 'block' : 'none';
//       this.updateBadge(cfg.enabled, cfg.proxyUrl || '');
//     } catch (e) {
//       console.warn('ProxyPanel: failed to load saved config', e);
//     }
//   },

//   async saveConfig() {
//     const enabled   = document.getElementById('proxyEnabled').checked;
//     const proxyUrl  = document.getElementById('proxyUrl').value.trim();
//     const proxyList = document.getElementById('proxyList').value;

//     this.showStatus('Saving...', 'info');

//     try {
//       const res = await window.electronAPI.proxy.setConfig({ enabled, proxyUrl, proxyList });
//       if (res.success) {
//         this.showStatus('✅ Proxy settings saved', 'success');
//         this.updateBadge(enabled, proxyUrl);
//         if (window.app?.addTerminalMessage) {
//           window.app.addTerminalMessage('info', `🌐 Proxy config saved: ${enabled ? (proxyUrl || 'list mode') : 'disabled'}`);
//         }
//       } else {
//         this.showStatus(`❌ Save failed: ${res.message}`, 'error');
//       }
//     } catch (e) {
//       this.showStatus(`❌ ${e.message}`, 'error');
//     }
//   },

//   async testProxy() {
//     const proxyUrl = document.getElementById('proxyUrl').value.trim();
//     if (!proxyUrl) {
//       this.showStatus('⚠️ Enter a proxy URL to test', 'warning'); return;
//     }
//     this.showStatus('⏳ Testing connection...', 'info');
//     try {
//       const res = await window.electronAPI.proxy.test(proxyUrl);
//       this.showStatus(res.message, res.success ? 'success' : 'error');
//     } catch (e) {
//       this.showStatus(`❌ ${e.message}`, 'error');
//     }
//   },

//   showStatus(message, type) {
//     const el = document.getElementById('proxyStatus');
//     if (!el) return;
//     el.style.display = 'block';
//     const colors = { success: 'rgba(40,167,69,0.2)', error: 'rgba(220,53,69,0.2)', warning: 'rgba(255,193,7,0.2)', info: 'rgba(0,0,0,0.2)' };
//     el.style.background = colors[type] || colors.info;
//     el.textContent = message;
//   },

//   updateBadge(enabled, proxyUrl) {
//     const badge = document.getElementById('proxyBadge');
//     const text  = document.getElementById('proxyBadgeText');
//     const icon  = badge?.querySelector('i');
//     if (!badge || !text) return;

//     if (enabled && proxyUrl) {
//       try {
//         const u = new URL(proxyUrl);
//         text.textContent = `Proxy: ${u.hostname}:${u.port}`;
//       } catch (_) {
//         text.textContent = 'Proxy: configured';
//       }
//       badge.style.background = 'rgba(40,167,69,0.2)';
//       badge.style.color = '#28a745';
//       if (icon) icon.style.color = '#28a745';
//     } else if (enabled) {
//       text.textContent = 'Proxy: list mode';
//       badge.style.background = 'rgba(0,123,255,0.2)';
//       badge.style.color = '#007bff';
//       if (icon) icon.style.color = '#007bff';
//     } else {
//       text.textContent = 'No proxy — shared IP';
//       badge.style.background = 'rgba(108,117,125,0.2)';
//       badge.style.color = 'var(--text-secondary)';
//       if (icon) icon.style.color = 'var(--text-secondary)';
//     }
//   }
// };

// // Auto-init when DOM is ready
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', () => ProxyPanel.init());
// } else {
//   ProxyPanel.init();
// }

// window.ProxyPanel = ProxyPanel;


/**
 * ProxyPanel — injects a proxy configuration section into the sidebar.
 * Call ProxyPanel.init() once after DOMContentLoaded.
 * Works alongside the existing FireKirinRenderer class.
 */



/**
 * ProxyPanel — injects a proxy configuration section into the sidebar.
 * Works alongside the existing FireKirinRenderer class.
 */
const ProxyPanel = {

  async init() {
    this.createUI();
    this.bindEvents();
    await this.loadSaved();
  },

  createUI() {
    const sidebar = document.querySelector('.sidebar-content');
    if (!sidebar || document.getElementById('proxySection')) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.id = 'proxySection';
    section.innerHTML = `
      <div class="section-header">
        <h3><i class="fas fa-shield-alt"></i> Proxy Settings</h3>
      </div>
      <div style="padding:8px 0">

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="proxyEnabled" style="width:16px;height:16px;cursor:pointer"/>
            <span>Enable Proxy for this Profile</span>
          </label>
        </div>

        <div id="proxyFields" style="display:none">

          <div class="form-group" style="margin-bottom:8px">
            <label style="font-size:12px;color:var(--text-secondary)">
              <i class="fas fa-globe"></i> Single Proxy URL
            </label>
            <input type="text" id="proxyUrl" class="form-input"
              placeholder="http://username:password@gate.decodo.com:10001"
              style="font-size:11px;font-family:monospace"/>
            <small style="color:var(--text-secondary);font-size:11px">
              Format: http://username:password@host:port
            </small>
          </div>

          <div class="form-group" style="margin-bottom:8px">
            <label style="font-size:12px;color:var(--text-secondary)">
              <i class="fas fa-list"></i> Proxy List — one per line (for rotation)
            </label>
            <textarea id="proxyList" class="form-input"
              rows="5"
              placeholder="http://sp98ok8c73:password@gate.decodo.com:10001&#10;http://sp98ok8c73:password@gate.decodo.com:10002&#10;http://sp98ok8c73:password@gate.decodo.com:10003"
              style="font-size:11px;font-family:monospace;resize:vertical"></textarea>
            <small style="color:var(--text-secondary);font-size:11px">
              Accounts rotate through this list. Paste your Decodo proxies here.
            </small>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:8px">
            <button id="proxyTest" class="btn btn-small btn-info" style="flex:1">
              <i class="fas fa-plug"></i> Test Proxy
            </button>
            <button id="proxySave" class="btn btn-small btn-success" style="flex:1">
              <i class="fas fa-save"></i> Save
            </button>
          </div>

          <div id="proxyStatus" style="
            font-size:12px;padding:6px 8px;border-radius:4px;margin-top:4px;
            background:rgba(0,0,0,0.2);display:none;word-break:break-all;
            white-space:pre-wrap">
          </div>

        </div>

        <div id="proxyBadge" style="
          font-size:11px;padding:4px 8px;border-radius:12px;display:inline-flex;
          align-items:center;gap:4px;margin-top:6px;
          background:rgba(108,117,125,0.2);color:var(--text-secondary)">
          <i class="fas fa-circle" style="font-size:8px"></i>
          <span id="proxyBadgeText">No proxy — shared IP</span>
        </div>

      </div>
    `;

    sidebar.appendChild(section);
  },

  bindEvents() {
    const enabledCb = document.getElementById('proxyEnabled');
    const fields    = document.getElementById('proxyFields');

    enabledCb?.addEventListener('change', () => {
      fields.style.display = enabledCb.checked ? 'block' : 'none';
      this.updateBadge(enabledCb.checked, document.getElementById('proxyUrl').value.trim());
    });

    document.getElementById('proxyTest')?.addEventListener('click', () => this.testProxy());
    document.getElementById('proxySave')?.addEventListener('click', () => this.saveConfig());

    document.getElementById('proxyUrl')?.addEventListener('input', () => {
      this.updateBadge(
        document.getElementById('proxyEnabled').checked,
        document.getElementById('proxyUrl').value.trim()
      );
    });
  },

  async loadSaved() {
    try {
      if (!window.electronAPI?.proxy?.getConfig) return;
      const res = await window.electronAPI.proxy.getConfig();
      if (!res?.success || !res.config) return;
      const cfg = res.config;

      document.getElementById('proxyEnabled').checked = !!cfg.enabled;
      document.getElementById('proxyUrl').value = cfg.proxyUrl || '';
      // proxyList is stored as array in DB, display as newline-separated text
      document.getElementById('proxyList').value = Array.isArray(cfg.proxyList)
        ? cfg.proxyList.join('\n')
        : (cfg.proxyList || '');
      document.getElementById('proxyFields').style.display = cfg.enabled ? 'block' : 'none';
      this.updateBadge(cfg.enabled, cfg.proxyUrl || '');
    } catch (e) {
      console.warn('ProxyPanel: failed to load saved config', e);
    }
  },

  // Returns true if the URL uses a supported proxy protocol
  _isValidProxyUrl(url) {
    return (
      url.startsWith('http://')    ||
      url.startsWith('https://')   ||
      url.startsWith('socks5h://') ||
      url.startsWith('socks5://')  ||
      url.startsWith('socks4://')
    );
  },

  // Parse the textarea into a clean array of valid proxy URLs
  _parseProxyList(raw) {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && this._isValidProxyUrl(l));
  },

  async saveConfig() {
    const enabled   = document.getElementById('proxyEnabled').checked;
    const proxyUrl  = document.getElementById('proxyUrl').value.trim();
    const rawList   = document.getElementById('proxyList').value;
    const proxyList = this._parseProxyList(rawList);

    // Validate single URL if provided
    if (enabled && proxyUrl && !this._isValidProxyUrl(proxyUrl)) {
      this.showStatus(
        '⚠️ Invalid URL format.\nUse: http://username:password@host:port',
        'warning'
      );
      return;
    }

    // Warn if enabled but nothing configured
    if (enabled && !proxyUrl && proxyList.length === 0) {
      this.showStatus('⚠️ Enter a proxy URL or add proxies to the list.', 'warning');
      return;
    }

    this.showStatus('Saving...', 'info');

    try {
      // Send proxyList as a newline string — main.js splits it back to array
      const res = await window.electronAPI.proxy.setConfig({
        enabled,
        proxyUrl,
        proxyList: proxyList.join('\n')
      });

      if (res.success) {
        const count = proxyList.length;
        const detail = count > 0
          ? `${count} proxies in rotation`
          : proxyUrl
            ? `single proxy: ${this._maskUrl(proxyUrl)}`
            : 'disabled';
        this.showStatus(`✅ Saved — ${detail}`, 'success');
        this.updateBadge(enabled, proxyUrl || (proxyList[0] || ''));

        if (window.app?.addTerminalMessage) {
          window.app.addTerminalMessage('info', `🌐 Proxy config saved: ${detail}`);
        }
      } else {
        this.showStatus(`❌ Save failed: ${res.message}`, 'error');
      }
    } catch (e) {
      this.showStatus(`❌ ${e.message}`, 'error');
    }
  },

  async testProxy() {
    // Test the single URL field; if empty, test the first proxy in the list
    let proxyUrl = document.getElementById('proxyUrl').value.trim();
    if (!proxyUrl) {
      const list = this._parseProxyList(document.getElementById('proxyList').value);
      proxyUrl = list[0] || '';
    }

    if (!proxyUrl) {
      this.showStatus('⚠️ Enter a proxy URL or add one to the list first.', 'warning');
      return;
    }

    if (!this._isValidProxyUrl(proxyUrl)) {
      this.showStatus(
        '⚠️ Invalid format.\nUse: http://username:password@host:port',
        'warning'
      );
      return;
    }

    this.showStatus(`⏳ Testing ${this._maskUrl(proxyUrl)} ...`, 'info');

    try {
      const res = await window.electronAPI.proxy.test(proxyUrl);
      this.showStatus(res.message, res.success ? 'success' : 'error');
    } catch (e) {
      this.showStatus(`❌ ${e.message}`, 'error');
    }
  },

  // Mask credentials in a proxy URL for display: http://user:****@host:port
  _maskUrl(url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.username}:****@${u.hostname}:${u.port}`;
    } catch (_) {
      return url.replace(/:\/\/[^@]+@/, '://*:****@');
    }
  },

  showStatus(message, type) {
    const el = document.getElementById('proxyStatus');
    if (!el) return;
    el.style.display = 'block';
    const colors = {
      success: 'rgba(40,167,69,0.2)',
      error:   'rgba(220,53,69,0.2)',
      warning: 'rgba(255,193,7,0.15)',
      info:    'rgba(0,0,0,0.2)'
    };
    el.style.background = colors[type] || colors.info;
    el.textContent = message;
    // Auto-hide success messages after 5s
    if (type === 'success') {
      clearTimeout(this._statusTimer);
      this._statusTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
  },

  updateBadge(enabled, proxyUrl) {
    const badge = document.getElementById('proxyBadge');
    const text  = document.getElementById('proxyBadgeText');
    const icon  = badge?.querySelector('i');
    if (!badge || !text) return;

    if (enabled && proxyUrl) {
      try {
        const u = new URL(proxyUrl);
        text.textContent = `Proxy ON: ${u.hostname}:${u.port}`;
      } catch (_) {
        text.textContent = 'Proxy: configured';
      }
      badge.style.background = 'rgba(40,167,69,0.2)';
      badge.style.color = '#28a745';
      if (icon) icon.style.color = '#28a745';
    } else if (enabled) {
      text.textContent = 'Proxy ON: list mode';
      badge.style.background = 'rgba(0,123,255,0.2)';
      badge.style.color = '#007bff';
      if (icon) icon.style.color = '#007bff';
    } else {
      text.textContent = 'No proxy — shared IP';
      badge.style.background = 'rgba(108,117,125,0.2)';
      badge.style.color = 'var(--text-secondary)';
      if (icon) icon.style.color = 'var(--text-secondary)';
    }
  }
};

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ProxyPanel.init());
} else {
  ProxyPanel.init();
}

window.ProxyPanel = ProxyPanel;