/* =====================================================
   firebase-config.js
   ตั้งค่าและเริ่มต้น Firebase — ต้องโหลดเป็นไฟล์แรกสุด
   ===================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyD2huyYMc8TD0oA7SJ1sfaejgpcb2H7x0U",
  authDomain: "kang-card-game.firebaseapp.com",
  databaseURL: "https://kang-card-game-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kang-card-game",
  storageBucket: "kang-card-game.firebasestorage.app",
  messagingSenderId: "400713700794",
  appId: "1:400713700794:web:726cb6e525026a90a53983"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const LIFF_ID = "2010387758-ZiMGYm5E";