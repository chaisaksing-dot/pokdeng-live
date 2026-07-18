/* =====================================================
   state.js
   ตัวแปร/ค่าคงที่ที่ใช้ร่วมกันทุกไฟล์ — โหลดต่อจาก firebase-config.js
   ===================================================== */

let currentRoom = null;
let myPlayerId = null;
let players = [];
let roomListenerRef = null;
let openRoomsListenerRef = null;
let timerInterval = null;
let isDealing = false;
let isDrawing = false;
let moneyRequestType = "topup";
let myAdminRole = null;

// แชท / วิดีโอ
let chatListenerRef = null;
let localStream = null;
let peerConnections = {};
let myVideoStarted = false;
let myMicMuted = false;

const OWNER_ID = "U375ecfc0b60af85d8e5ed97e512cc76d";
const MAX_PLAYERS = 8;
const TURN_SECONDS = 60;

const cards = [
  "A♠","2♠","3♠","4♠","5♠","6♠","7♠","8♠","9♠","10♠","J♠","Q♠","K♠",
  "A♥","2♥","3♥","4♥","5♥","6♥","7♥","8♥","9♥","10♥","J♥","Q♥","K♥",
  "A♦","2♦","3♦","4♦","5♦","6♦","7♦","8♦","9♦","10♦","J♦","Q♦","K♦",
  "A♣","2♣","3♣","4♣","5♣","6♣","7♣","8♣","9♣","10♣","J♣","Q♣","K♣"
];