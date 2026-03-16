
const { initializeApp } = require('firebase/app');
const { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} = require('firebase/auth');
const { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs 
} = require('firebase/firestore');
const { firebaseConfig } = require('../firebase-config.js');
const { v4: uuidv4 } = require('uuid');

// Use a simple file-based storage instead of electron-store for now
const fs = require('fs');
const path = require('path');
const os = require('os');

class MainUserManager {
  constructor(mainWindow) {
    try {
      console.log('🔄 Initializing Firebase in Main Process...');
      this.app = initializeApp(firebaseConfig);
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);
      this.currentUser = null;
      this.mainWindow = mainWindow;
      this.deviceId = this.getDeviceId();
      
      console.log('✅ Firebase initialized successfully in Main Process');
      console.log('📡 Firebase Project:', firebaseConfig.projectId);
      
      this.init();
    } catch (error) {
      console.error('❌ Firebase initialization failed in Main Process:', error);
    }
  }

  getDeviceId() {
    // Create a simple file-based storage for device ID
    const configDir = path.join(os.homedir(), '.firekirin');
    const deviceIdFile = path.join(configDir, 'deviceId');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Read device ID from file or create new one
    let deviceId;
    if (fs.existsSync(deviceIdFile)) {
      deviceId = fs.readFileSync(deviceIdFile, 'utf8');
    } else {
      deviceId = uuidv4();
      fs.writeFileSync(deviceIdFile, deviceId);
    }
    
    return deviceId;
  }

  async getIPAddress() {
    try {
        const interfaces = os.networkInterfaces();
        
        for (const name of Object.keys(interfaces)) {
            for (const netInterface of interfaces[name]) {
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    return netInterface.address;
                }
            }
        }
        return 'unknown';
    } catch (error) {
        return 'unknown';
    }
  }

  init() {
    console.log('🔐 Setting up auth state listener in Main Process...');
    
    // Check authentication state
    onAuthStateChanged(this.auth, async (user) => {
      console.log('🔄 Auth state changed in Main Process:', user ? `User: ${user.email}` : 'No user');
      
      if (user) {
        this.currentUser = user;
        await this.checkUserStatus();
      } else {
        this.currentUser = null;
        console.log('👤 No user found in Main Process');
        this.sendToRenderer('show-registration');
      }
    }, (error) => {
      console.error('❌ Auth state listener error in Main Process:', error);
      this.sendToRenderer('show-registration');
    });
  }

  sendToRenderer(channel, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log(`📤 Sending ${channel} to renderer:`, data);
      this.mainWindow.webContents.send(channel, data);
    } else {
      console.warn(`⚠️ Cannot send ${channel}: mainWindow not available`);
    }
  }

  async checkUserStatus() {
    if (!this.currentUser) {
      console.log('❌ No current user for status check in Main Process');
      this.sendToRenderer('show-registration');
      return;
    }

    try {
      console.log('📋 Checking user status for:', this.currentUser.uid);
      const userDoc = await getDoc(doc(this.db, 'users', this.currentUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('📊 User status:', userData.status);
        
        if (userData.status === 'approved') {
          // Check if license expired
          if (userData.expiresAt && new Date() > userData.expiresAt.toDate()) {
            console.log('📅 License expired');
            await this.handleLicenseExpired();
            return;
          }
          console.log('✅ User approved, sending to renderer');
          this.sendToRenderer('show-main-app', { user: userData });
        } else if (userData.status === 'pending') {
          console.log('⏳ User pending approval');
          this.sendToRenderer('show-pending-approval');
        } else {
          console.log('❓ User status unknown:', userData.status);
          this.sendToRenderer('show-registration');
        }
      } else {
        console.log('📝 User document not found');
        this.sendToRenderer('show-registration');
      }
    } catch (error) {
      console.error('❌ User status check error:', error);
      this.sendToRenderer('show-registration');
    }
  }

  async registerUser(email, password) {
    try {
      console.log('📝 Starting registration for:', email);
      
      // Check if email already exists with different IP
      const ipAddress = await this.getIPAddress();
      console.log('🌐 IP Address:', ipAddress);
      
      console.log('🔍 Checking existing users...');
      const existingUserQuery = query(
        collection(this.db, 'users'), 
        where('email', '==', email)
      );
      
      const existingUsers = await getDocs(existingUserQuery);
      
      if (!existingUsers.empty) {
        const existingUser = existingUsers.docs[0].data();
        console.log('⚠️ Existing user found:', existingUser.email);
        
        if (existingUser.ipAddress !== ipAddress) {
          throw new Error('This email is already registered from a different device');
        }
      }

      // Create Firebase auth user
      console.log('🔥 Creating Firebase user...');
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      console.log('✅ Firebase user created:', user.uid);

      // Create user document in Firestore
      const userData = {
        email: email,
        status: 'pending',
        ipAddress: ipAddress,
        deviceId: this.deviceId,
        createdAt: new Date(),
        loginCount: 0,
        lastLogin: null,
        approvedAt: null,
        expiresAt: null,
        approvedBy: null
      };

      console.log('💾 Saving user to Firestore...');
      await setDoc(doc(this.db, 'users', user.uid), userData);
      console.log('✅ User saved to Firestore');

      return {
        success: true,
        message: 'Registration successful! Waiting for admin approval.',
        userId: user.uid
      };

    } catch (error) {
      console.error('❌ Registration error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  async loginUser(email, password) {
    try {
      console.log('🔐 Attempting login for:', email);
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      console.log('✅ Login successful:', user.uid);

      // Check user status
      const userDoc = await getDoc(doc(this.db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        throw new Error('User not found in database');
      }

      const userData = userDoc.data();

      if (userData.status !== 'approved') {
        await signOut(this.auth);
        throw new Error(`Account is ${userData.status}. Please wait for admin approval.`);
      }

      // Check license expiry
      if (userData.expiresAt && new Date() > userData.expiresAt.toDate()) {
        await this.handleLicenseExpired();
        throw new Error('Your license has expired. Please register again.');
      }

      // Update login info
      await updateDoc(doc(this.db, 'users', user.uid), {
        lastLogin: new Date(),
        loginCount: (userData.loginCount || 0) + 1
      });

      this.currentUser = userData;
      console.log('🎉 User fully authenticated');
      
      return {
        success: true,
        user: userData
      };

    } catch (error) {
      console.error('❌ Login error:', error);
      console.error('Error code:', error.code);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async handleLicenseExpired() {
    if (this.currentUser) {
      await updateDoc(doc(this.db, 'users', this.currentUser.uid), {
        status: 'expired'
      });
    }
    await signOut(this.auth);
    this.sendToRenderer('show-registration');
  }

  async logout() {
    try {
      await signOut(this.auth);
      console.log('👋 User logged out from Main Process');
      this.sendToRenderer('show-registration');
    } catch (error) {
      console.error('Logout error in Main Process:', error);
    }
  }
}

module.exports = MainUserManager;