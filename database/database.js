

// const sqlite3 = require('sqlite3').verbose();
// const path = require('path');
// const { app } = require('electron');
// const fs = require('fs');

// class Database {
//   constructor(profileName = 'Default') {
//     this.db = null;
//     this.profileName = profileName;
    
//     // Fix for production database path with profiles
//     const isDev = !app.isPackaged;
    
//     // Create profile-specific directory
//     const baseDataDir = isDev 
//       ? path.join(__dirname, '..', 'data')
//       : path.join(process.resourcesPath, 'data');
    
//     const profileDir = path.join(baseDataDir, this.sanitizeProfileName(profileName));
//     this.dbPath = path.join(profileDir, 'accounts.db');
    
//     console.log('👤 Profile:', profileName);
//     console.log('📁 Database path:', this.dbPath);
//   }

//   sanitizeProfileName(name) {
//     // Remove special characters for safe folder names
//     return name.replace(/[^a-zA-Z0-9_-]/g, '_');
//   }

//   async init() {
//     return new Promise((resolve, reject) => {
//       const dataDir = path.dirname(this.dbPath);
      
//       console.log('📂 Creating profile directory:', dataDir);
      
//       if (!fs.existsSync(dataDir)) {
//         fs.mkdirSync(dataDir, { recursive: true });
//       }

//       this.db = new sqlite3.Database(this.dbPath, (err) => {
//         if (err) {
//           console.error('❌ Error opening database:', err);
//           reject(err);
//         } else {
//           // ✅ CRITICAL FIX: Configure SQLite for optimal performance
//           this.db.run("PRAGMA journal_mode=WAL");
//           this.db.run("PRAGMA synchronous=NORMAL");
//           this.db.run("PRAGMA cache_size=10000");
//           this.db.run("PRAGMA temp_store=MEMORY");
          
//           console.log(`✅ Connected to SQLite database: ${this.profileName}`);
//           this.createTables().then(resolve).catch(reject);
//         }
//       });
//     });
//   }

//   async createTables() {
//     return new Promise((resolve, reject) => {
//       const accountsTable = `
//         CREATE TABLE IF NOT EXISTS accounts (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           username TEXT NOT NULL UNIQUE,
//           password TEXT NOT NULL,
//           score INTEGER DEFAULT 0,
//           userid TEXT,
//           dynamicpass TEXT,
//           bossid TEXT,
//           gameid TEXT,
//           last_processed DATETIME,
//           created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//           updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
//         )
//       `;

//       const processingLogTable = `
//         CREATE TABLE IF NOT EXISTS processing_logs (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           account_id INTEGER,
//           timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
//           status TEXT,
//           message TEXT,
//           details TEXT,
//           FOREIGN KEY (account_id) REFERENCES accounts (id)
//         )
//       `;

//       this.db.run(accountsTable, (err) => {
//         if (err) {
//           console.error('❌ Error creating accounts table:', err);
//           reject(err);
//           return;
//         }

//         this.db.run(processingLogTable, (err) => {
//           if (err) {
//             console.error('❌ Error creating processing_logs table:', err);
//             reject(err);
//           } else {
//             console.log('✅ Database tables created successfully');
//             resolve();
//           }
//         });
//       });
//     });
//   }

//   async getAllAccounts() {
//     return new Promise((resolve, reject) => {
//       this.db.all("SELECT * FROM accounts ORDER BY created_at DESC", (err, rows) => {
//         if (err) {
//           console.error('❌ Error getting all accounts:', err);
//           reject(err);
//         } else {
//           console.log(`✅ Retrieved ${rows.length} accounts from database`);
//           resolve(rows);
//         }
//       });
//     });
//   }

//   async addAccount(account) {
//     return new Promise((resolve, reject) => {
//       const { username, password, score = 0 } = account;
//       const sql = `INSERT INTO accounts (username, password, score) VALUES (?, ?, ?)`;
      
//       this.db.run(sql, [username, password, score], function(err) {
//         if (err) {
//           console.error('❌ Error adding account:', err);
//           reject(err);
//         } else {
//           console.log(`✅ Account added: ${username}`);
//           resolve({ id: this.lastID, username, password, score });
//         }
//       });
//     });
//   }

//   async addBulkAccounts(accounts) {
//     return new Promise((resolve, reject) => {
//       const results = {
//         added: 0,
//         duplicates: 0,
//         errors: 0,
//         duplicateUsernames: [],
//         errorMessages: []
//       };

//       let processed = 0;
//       const total = accounts.length;

//       if (total === 0) {
//         resolve(results);
//         return;
//       }

//       const processNext = () => {
//         if (processed >= total) {
//           console.log(`✅ Bulk accounts processed: ${results.added} added, ${results.duplicates} duplicates, ${results.errors} errors`);
//           resolve(results);
//           return;
//         }

//         const account = accounts[processed];
//         const { username, password, score = 0 } = account;

//         this.db.get("SELECT id FROM accounts WHERE username = ?", [username], (err, row) => {
//           if (err) {
//             results.errors++;
//             results.errorMessages.push(`Database error for ${username}: ${err.message}`);
//             processed++;
//             processNext();
//             return;
//           }

//           if (row) {
//             results.duplicates++;
//             results.duplicateUsernames.push(username);
//             processed++;
//             processNext();
//             return;
//           }

//           const sql = `INSERT INTO accounts (username, password, score) VALUES (?, ?, ?)`;
//           this.db.run(sql, [username, password, score], function(err) {
//             if (err) {
//               results.errors++;
//               results.errorMessages.push(`Failed to add ${username}: ${err.message}`);
//             } else {
//               results.added++;
//             }
//             processed++;
//             processNext();
//           });
//         });
//       };

//       processNext();
//     });
//   }

//   // ✅ FIXED: Removed redundant PRAGMA call
//   async updateAccount(account) {
//     return new Promise((resolve, reject) => {
//       const { id, username, password, score, userid, dynamicpass, bossid, gameid } = account;
//       const sql = `UPDATE accounts SET 
//         username = ?, password = ?, score = ?, userid = ?, dynamicpass = ?, bossid = ?, gameid = ?,
//         updated_at = CURRENT_TIMESTAMP 
//         WHERE id = ?`;
      
//       this.db.run(sql, [username, password, score, userid, dynamicpass, bossid, gameid, id], function(err) {
//         if (err) {
//           reject(err);
//         } else {
//           resolve(account);
//         }
//       });
//     });
//   }

//   async deleteAccount(id) {
//     return new Promise((resolve, reject) => {
//       this.db.run("DELETE FROM accounts WHERE id = ?", [id], function(err) {
//         if (err) {
//           console.error('❌ Error deleting account:', err);
//           reject(err);
//         } else {
//           console.log(`✅ Account deleted: ID ${id}`);
//           resolve({ deleted: this.changes });
//         }
//       });
//     });
//   }

//   async deleteMultipleAccounts(ids) {
//     return new Promise((resolve, reject) => {
//       if (!ids || ids.length === 0) {
//         resolve({ deleted: 0 });
//         return;
//       }

//       const placeholders = ids.map(() => '?').join(',');
//       const sql = `DELETE FROM accounts WHERE id IN (${placeholders})`;
      
//       this.db.run(sql, ids, function(err) {
//         if (err) {
//           console.error('❌ Error deleting multiple accounts:', err);
//           reject(err);
//         } else {
//           console.log(`✅ ${this.changes} accounts deleted`);
//           resolve({ deleted: this.changes });
//         }
//       });
//     });
//   }

//   async addProcessingLog(accountId, status, message, details = null) {
//     return new Promise((resolve, reject) => {
//       const sql = `INSERT INTO processing_logs (account_id, status, message, details) VALUES (?, ?, ?, ?)`;
      
//       this.db.run(sql, [accountId, status, message, JSON.stringify(details)], function(err) {
//         if (err) {
//           console.error('❌ Error adding processing log:', err);
//           reject(err);
//         } else {
//           resolve(this.lastID);
//         }
//       });
//     });
//   }

//   close() {
//     if (this.db) {
//       this.db.close();
//       console.log('✅ Database connection closed');
//     }
//   }
// }

// module.exports = Database;



const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

class Database {
  constructor(profileName = 'Default') {
    this.db = null;
    this.profileName = profileName;
    
    const isDev = !app.isPackaged;
    
    const baseDataDir = isDev 
      ? path.join(__dirname, '..', 'data')
      : path.join(process.resourcesPath, 'data');
    
    const profileDir = path.join(baseDataDir, this.sanitizeProfileName(profileName));
    this.dbPath = path.join(profileDir, 'accounts.db');
    
    console.log('👤 Profile:', profileName);
    console.log('📁 Database path:', this.dbPath);
  }

  sanitizeProfileName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async init() {
    return new Promise((resolve, reject) => {
      const dataDir = path.dirname(this.dbPath);
      
      console.log('📂 Creating profile directory:', dataDir);
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Error opening database:', err);
          reject(err);
        } else {
          this.db.run("PRAGMA journal_mode=WAL");
          this.db.run("PRAGMA synchronous=NORMAL");
          this.db.run("PRAGMA cache_size=10000");
          this.db.run("PRAGMA temp_store=MEMORY");
          
          console.log(`✅ Connected to SQLite database: ${this.profileName}`);
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const accountsTable = `
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          score INTEGER DEFAULT 0,
          userid TEXT,
          dynamicpass TEXT,
          bossid TEXT,
          gameid TEXT,
          last_processed DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const processingLogTable = `
        CREATE TABLE IF NOT EXISTS processing_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT,
          message TEXT,
          details TEXT,
          FOREIGN KEY (account_id) REFERENCES accounts (id)
        )
      `;

      // Stores this profile's proxy configuration (single row, id=1)
      const proxyConfigTable = `
        CREATE TABLE IF NOT EXISTS proxy_config (
          id INTEGER PRIMARY KEY,
          config TEXT NOT NULL DEFAULT '{}'
        )
      `;

      this.db.run(accountsTable, (err) => {
        if (err) {
          console.error('❌ Error creating accounts table:', err);
          reject(err);
          return;
        }

        this.db.run(processingLogTable, (err) => {
          if (err) {
            console.error('❌ Error creating processing_logs table:', err);
            reject(err);
            return;
          }

          this.db.run(proxyConfigTable, (err) => {
            if (err) {
              console.error('❌ Error creating proxy_config table:', err);
              reject(err);
            } else {
              console.log('✅ Database tables created successfully');
              resolve();
            }
          });
        });
      });
    });
  }

  async getAllAccounts() {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT * FROM accounts ORDER BY created_at DESC", (err, rows) => {
        if (err) {
          console.error('❌ Error getting all accounts:', err);
          reject(err);
        } else {
          console.log(`✅ Retrieved ${rows.length} accounts from database`);
          resolve(rows);
        }
      });
    });
  }

  async addAccount(account) {
    return new Promise((resolve, reject) => {
      const { username, password, score = 0 } = account;
      const sql = `INSERT INTO accounts (username, password, score) VALUES (?, ?, ?)`;
      
      this.db.run(sql, [username, password, score], function(err) {
        if (err) {
          console.error('❌ Error adding account:', err);
          reject(err);
        } else {
          console.log(`✅ Account added: ${username}`);
          resolve({ id: this.lastID, username, password, score });
        }
      });
    });
  }

  async addBulkAccounts(accounts) {
    return new Promise((resolve, reject) => {
      const results = {
        added: 0,
        duplicates: 0,
        errors: 0,
        duplicateUsernames: [],
        errorMessages: []
      };

      let processed = 0;
      const total = accounts.length;

      if (total === 0) {
        resolve(results);
        return;
      }

      const processNext = () => {
        if (processed >= total) {
          console.log(`✅ Bulk accounts processed: ${results.added} added, ${results.duplicates} duplicates, ${results.errors} errors`);
          resolve(results);
          return;
        }

        const account = accounts[processed];
        const { username, password, score = 0 } = account;

        this.db.get("SELECT id FROM accounts WHERE username = ?", [username], (err, row) => {
          if (err) {
            results.errors++;
            results.errorMessages.push(`Database error for ${username}: ${err.message}`);
            processed++;
            processNext();
            return;
          }

          if (row) {
            results.duplicates++;
            results.duplicateUsernames.push(username);
            processed++;
            processNext();
            return;
          }

          const sql = `INSERT INTO accounts (username, password, score) VALUES (?, ?, ?)`;
          this.db.run(sql, [username, password, score], function(err) {
            if (err) {
              results.errors++;
              results.errorMessages.push(`Failed to add ${username}: ${err.message}`);
            } else {
              results.added++;
            }
            processed++;
            processNext();
          });
        });
      };

      processNext();
    });
  }

  async updateAccount(account) {
    return new Promise((resolve, reject) => {
      const { id, username, password, score, userid, dynamicpass, bossid, gameid } = account;
      const sql = `UPDATE accounts SET 
        username = ?, password = ?, score = ?, userid = ?, dynamicpass = ?, bossid = ?, gameid = ?,
        updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`;
      
      this.db.run(sql, [username, password, score, userid, dynamicpass, bossid, gameid, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(account);
        }
      });
    });
  }

  async deleteAccount(id) {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM accounts WHERE id = ?", [id], function(err) {
        if (err) {
          console.error('❌ Error deleting account:', err);
          reject(err);
        } else {
          console.log(`✅ Account deleted: ID ${id}`);
          resolve({ deleted: this.changes });
        }
      });
    });
  }

  async deleteMultipleAccounts(ids) {
    return new Promise((resolve, reject) => {
      if (!ids || ids.length === 0) {
        resolve({ deleted: 0 });
        return;
      }

      const placeholders = ids.map(() => '?').join(',');
      const sql = `DELETE FROM accounts WHERE id IN (${placeholders})`;
      
      this.db.run(sql, ids, function(err) {
        if (err) {
          console.error('❌ Error deleting multiple accounts:', err);
          reject(err);
        } else {
          console.log(`✅ ${this.changes} accounts deleted`);
          resolve({ deleted: this.changes });
        }
      });
    });
  }

  async addProcessingLog(accountId, status, message, details = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO processing_logs (account_id, status, message, details) VALUES (?, ?, ?, ?)`;
      
      this.db.run(sql, [accountId, status, message, JSON.stringify(details)], function(err) {
        if (err) {
          console.error('❌ Error adding processing log:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Proxy configuration — one row per profile database (id always = 1)
  // ---------------------------------------------------------------------------

  async saveProxyConfig(config) {
    return new Promise((resolve, reject) => {
      const json = JSON.stringify(config || {});
      // Try INSERT OR REPLACE first (supported in SQLite 3.x)
      const sql = `INSERT OR REPLACE INTO proxy_config (id, config) VALUES (1, ?)`;
      this.db.run(sql, [json], function(err) {
        if (err) {
          // Fallback: delete then insert (very old SQLite)
          this.db.run(`DELETE FROM proxy_config WHERE id = 1`, [], (delErr) => {
            if (delErr) { reject(delErr); return; }
            this.db.run(`INSERT INTO proxy_config (id, config) VALUES (1, ?)`, [json], function(insErr) {
              if (insErr) reject(insErr);
              else resolve({ saved: true });
            });
          });
        } else {
          resolve({ saved: true });
        }
      }.bind(this));
    });
  }

  async getProxyConfig() {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT config FROM proxy_config WHERE id = 1`, (err, row) => {
        if (err) { reject(err); return; }
        if (!row) { resolve(null); return; }
        try {
          resolve(JSON.parse(row.config));
        } catch (parseErr) {
          console.warn('⚠️ Failed to parse proxy config JSON:', parseErr.message);
          resolve(null);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------

  close() {
    if (this.db) {
      this.db.close();
      console.log('✅ Database connection closed');
    }
  }
}

module.exports = Database;