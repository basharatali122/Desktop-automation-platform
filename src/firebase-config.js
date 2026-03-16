const firebaseConfig = {
  apiKey: "AIzaSyAeIT2hCiKZnt2BpaduMFbX8RzaegcWSgI",
  authDomain: "user-management-system-8d68c.firebaseapp.com",
  projectId: "user-management-system-8d68c",
  storageBucket: "user-management-system-8d68c.firebasestorage.app",
  messagingSenderId: "426104489502",
  appId: "1:426104489502:web:9ea1fa556dc73bcb31100f",
  measurementId: "G-QCC64L6SZW"
};

console.log('📋 Firebase Config Loaded:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});

module.exports = { firebaseConfig };