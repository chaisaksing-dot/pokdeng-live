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

function showPage(pageId) {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("adminPage").style.display = "none";
  document.getElementById("lobbyPage").style.display = "none";
  document.getElementById("roomPage").style.display = "none";

  document.getElementById(pageId).style.display = "block";
}

function loginLine() {
  alert("LINE LOGIN");
  showPage("lobbyPage");
}
let roomNumber = 1000;
let currentRoom = null;
let myPlayerId = null;
let players = [];
let playerCards = [];
let bankerCards = [];

function logout() {
  showPage("loginPage");
}

  function createRoom() {

  const roomId = Date.now();

  const bankerMoney =
    document.getElementById("bankerMoney").value;

  const maxBet =
    document.getElementById("maxBet").value;

  currentRoom = {
    id: roomId,
    bankerMoney: bankerMoney,
    maxBet: maxBet
  };

  db.ref("rooms/" + roomId).set(currentRoom);
  myPlayerId = "owner";
localStorage.setItem("playerId", "owner");
db.ref("rooms/" + roomId + "/players/" + myPlayerId).set({
  name: "เจ้าของห้อง",
  money: 1500,
  bet: 0,
  ready: false
});
  alert("สร้างห้องสำเร็จ ห้องเลข: " + roomId);
listenPlayers(roomId);
listenGame();
  document.getElementById("roomIdText").innerText = roomId;

  document.getElementById("bankerMoneyText").innerText =
    bankerMoney;

  document.getElementById("maxBetText").innerText =
    maxBet;

  showPage("roomPage");
}
function listenPlayers(roomId) {

  db.ref("rooms/" + roomId + "/players")
  .on("value", (snap) => {

    const data = snap.val() || {};
    players = Object.values(data);

    renderPlayers();
    checkAllReady();

  });
}

function joinRoom() {
  const roomId = document.getElementById("joinRoomId").value;

  if (!roomId) {
    alert("กรุณาใส่เลขห้อง");
    return;
  }

  db.ref("rooms/" + roomId).once("value").then((snapshot) => {
    if (!snapshot.exists()) {
      alert("ไม่พบห้องนี้");
      return;
    }

    currentRoom = snapshot.val();

    document.getElementById("roomIdText").innerText = currentRoom.id;
    document.getElementById("bankerMoneyText").innerText = currentRoom.bankerMoney;
    document.getElementById("maxBetText").innerText = currentRoom.maxBet;
myPlayerId = localStorage.getItem("playerId");

if (!myPlayerId) {
  myPlayerId = "player_" + Date.now();
  localStorage.setItem("playerId", myPlayerId);
}

const playerId = myPlayerId;


db.ref("rooms/" + roomId + "/players/" + playerId)
.once("value")
.then((snap) => {

  if (!snap.exists()) {

    db.ref("rooms/" + roomId + "/players/" + playerId).set({
      name: "ผู้เล่น LINE",
      money: 1500,
      bet: 0,
      ready: false
    });

  }

});
    
db.ref("rooms/" + roomId + "/players").off();

db.ref("rooms/" + roomId + "/players").on("value", (snap) => {

  const data = snap.val() || {};
  players = Object.values(data);
  renderPlayers();
  listenGame();
  checkAllReady();
});
    
    showPage("roomPage");
  });
}
  

function leaveRoom() {
  
  showPage("lobbyPage");
  
}

function addMeToRoom() {
  players = [
    {
      name: "ผู้เล่น LINE",
      money: 1500,
      bet: 0,
      ready: false
    }
  ];

  renderPlayers();
  checkAllReady();
}

function renderPlayers() {
  const box = document.getElementById("playersList");
  box.innerHTML = "";
  if (players[0]) {
  document.getElementById("myMoneyText").innerText =
    "เงินของฉัน: " + players[0].money;

}
  players.forEach(player => {
    box.innerHTML += `
      <div class="player">
        <div>
        <b>${player.name === "เจ้าของห้อง"? "👑 เจ้าของห้อง (เจ้ามือ)" : "🙂 " +player.name}</b><br>
          เงิน: ${player.money}<br>
          แทง: ${player.bet}
        </div>
        <div>${player.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม"}</div>
      </div>
    `;
  });
  const newRoundBtn = document.getElementById("newRoundBtn");

if (newRoundBtn) {
newRoundBtn.style.display =
  myPlayerId === "owner" ? "block" : "none";

}
  const betCard = document.getElementById("betCard");

if (betCard) {
  betCard.style.display = myPlayerId === "owner" ? "none" : "block";
}
}

function setReady() {
  const bet = Number(document.getElementById("betAmount").value);
if (!players[0]) {
  addMeToRoom();
}
  if (!bet || bet <= 0) {
    alert("กรุณาใส่เงินแทง");
    return;
  }

  if (bet > Number(currentRoom.maxBet)) {
    alert("แทงเกินที่เจ้ามือกำหนด");
    return;
  }

  const maxLose = bet * 5;

  if (players[0]?.money < maxLose) {
    alert("เงินไม่พอ ต้องมีอย่างน้อย " + maxLose);
    return;
  }

  players[0].bet = bet;
  players[0].ready = true;

  renderPlayers();
dealCards();

}

function updateMaxLose() {
  const bet = Number(document.getElementById("betAmount").value) || 0;
  document.getElementById("maxLoseText").innerText = bet * 5;
}
const cards = [
  "A♠","2♠","3♠","4♠","5♠","6♠","7♠","8♠","9♠","10♠","J♠","Q♠","K♠",
  "A♥","2♥","3♥","4♥","5♥","6♥","7♥","8♥","9♥","10♥","J♥","Q♥","K♥",
  "A♦","2♦","3♦","4♦","5♦","6♦","7♦","8♦","9♦","10♦","J♦","Q♦","K♦",
  "A♣","2♣","3♣","4♣","5♣","6♣","7♣","8♣","9♣","10♣","J♣","Q♣","K♣"
];

function cardColor(card) {
  if (card.includes("♥") || card.includes("♦")) {
    return "card-red";
  }
  return "";
}

function randomCard() {
  return cards[Math.floor(Math.random() * cards.length)];
}
function cardValue(card) {
  let v = card;

  if (card.length > 1) {
    const last = card.slice(-1);
    if (["♠", "♥", "♦", "♣"].includes(last)) {
      v = card.slice(0, -1);
    }
  }

  if (["J", "Q", "K"].includes(v)) return 0;
  if (v === "A") return 1;

  return Number(v) % 10;
}

function calculatePoint(card1, card2) {
  return (cardValue(card1) + cardValue(card2)) % 10;
}
function getPoint(cards) {
  let total = 0;

  cards.forEach(card => {
    total += cardValue(card);
  });

  return total % 10;
}
function dealCards() {
  if (!currentRoom) return;

  const player1 = randomCard();
  const player2 = randomCard();
  const banker1 = randomCard();
  const banker2 = randomCard();
playerCards = [player1, player2];
bankerCards = [banker1, banker2];
  const playerPoint =
    (cardValue(player1) + cardValue(player2)) % 10;

  const bankerPoint =
    (cardValue(banker1) + cardValue(banker2)) % 10;

  document.getElementById("cardsArea").innerHTML =
    "ผู้เล่น: " + player1 + " " + player2 + " (" + playerPoint + ")" +
    "<br>เจ้ามือ: " + banker1 + " " + banker2 + " (" + bankerPoint + ")";

  document.getElementById("resultText").innerText = "ยังไม่มีผล";

  if (playerPoint >= 8 || bankerPoint >= 8) {
    document.getElementById("resultText").innerText =
      "ป๊อก! เปิดผลทันที";
    return;
  }

  if (playerPoint <= 3) {
    playerDraw();
  } else {
    document.getElementById("playerDrawBtn").style.display = "block";
    document.getElementById("playerStandBtn").style.display = "block";
  }
}
function newRound() {
  document.getElementById("cardsArea").innerHTML = "";
  document.getElementById("resultText").innerText = "ยังไม่มีผล";
document.getElementById("playerDrawBtn").style.display = "none";
document.getElementById("playerStandBtn").style.display = "none";
document.getElementById("bankerDrawBtn").style.display = "none";
document.getElementById("bankerStandBtn").style.display = "none";
  
  playerCards = [];
  bankerCards = [];

  document.getElementById("betAmount").value = "";

  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    snap.forEach(child => {
      child.ref.update({
        ready: false,
        bet: 0
      });
    });
  });
}



window.onload = function () {
  showPage("loginPage");
};
function inviteLine() {
  alert("ระบบเชิญเพื่อนกำลังพัฒนา");
}
function playerReady() {
  if (!currentRoom || !myPlayerId) return;

  const betInput = document.getElementById("betAmount");
  const bet = Number(betInput ? betInput.value : 0);

  if (bet <= 0) {
    alert("กรุณาใส่เงินแทง");
    return;
  }
  const me = players.find(p => p.name === "เจ้าของห้อง") || players[0];

if (me.money < bet) {
  alert("เงินไม่พอ");
  return;
}

me.money -= bet;
db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
  money: me.money,
  bet: bet,
  ready: true
});

  alert("พร้อมแล้ว");
}

function listenGame() {
  if (!currentRoom) return;

  db.ref("rooms/" + currentRoom.id + "/game").off();

  db.ref("rooms/" + currentRoom.id + "/game").on("value", (snap) => {
    const game = snap.val();
    if (!game) return;

    document.getElementById("cardsArea").innerHTML =
      "ผู้เล่น: " + game.playerCard + "<br>เจ้ามือ: " + game.bankerCard;

    document.getElementById("resultText").innerText = game.result;
  });
}

window.loginLine = function () {
  alert("LINE LOGIN");
  showPage("lobbyPage");
};
function checkAllReady() {
  const startBtn = document.getElementById("startGameBtn");
  if (!startBtn) return;
const normalPlayers = players.filter(p => !String(p.name).includes("เจ้าของห้อง"));

  if (
    myPlayerId === "owner" &&
    localStorage.getItem("playerId") === "owner" &&
    normalPlayers.every(p => p.ready)
  ) {
    startBtn.style.display = "block";
  } else {
    startBtn.style.display = "none";
  }
}

function playerDraw() {

  const card = randomCard();
playerCards.push(card);
  document.getElementById("cardsArea").innerHTML +=
    "<br>ผู้เล่นจั่ว: " + card;

  document.getElementById("playerDrawBtn").style.display = "none";
  document.getElementById("playerStandBtn").style.display = "none";

  nextBankerTurn();
}
function playerStand() {
  document.getElementById("playerDrawBtn").style.display = "none";
  document.getElementById("playerStandBtn").style.display = "none";

  nextBankerTurn();
}
function nextBankerTurn() {

  const bankerPoint = getPoint(bankerCards);

  if (bankerPoint >= 8) {

    finishGame();

  } else if (bankerPoint < 4) {

    bankerDraw();

  } else {

    document.getElementById("bankerDrawBtn").style.display = "block";
    document.getElementById("bankerStandBtn").style.display = "block";

  }

}

window.nextBankerTurn = nextBankerTurn;

function bankerDraw() {

  const card = randomCard();
bankerCards.push(card);
  
  document.getElementById("cardsArea").innerHTML +=
    "<br>เจ้ามือจั่ว: " + card;

  document.getElementById("bankerDrawBtn").style.display = "none";
  document.getElementById("bankerStandBtn").style.display = "none";
finishGame();
  
}

function bankerStand() {

  document.getElementById("bankerDrawBtn").style.display = "none";
  document.getElementById("bankerStandBtn").style.display = "none";
finishGame();
}
function finishGame() {

  const playerPoint = getPoint(playerCards);
const bankerPoint = getPoint(bankerCards);

  let result = "";

  if (playerPoint > bankerPoint) {
    result = "ผู้เล่นชนะ";
  } else if (bankerPoint > playerPoint) {
    result = "เจ้ามือชนะ";
  } else {
    result = "เสมอ";
  }
document.getElementById("cardsArea").innerHTML =
  "ผู้เล่น: " + playerCards.join(" ") + " (" + playerPoint + ")" +
  "<br>เจ้ามือ: " + bankerCards.join(" ") + " (" + bankerPoint + ")";
const bet = players[1] ? Number(players[1].bet || 0) : 0;

if (players[0] && players[1]) {
  if (result === "ผู้เล่นชนะ") {
    players[1].money += bet * 2;
    players[0].money -= bet;
  } else if (result === "เจ้ามือชนะ") {
    players[0].money += bet;
  } else if (result === "เสมอ") {
    players[1].money += bet;
  }

  db.ref("rooms/" + currentRoom.id + "/players/owner").update({
    money: players[0].money
  });

  const playerId = Object.keys(currentRoom.players).find(id => id !== "owner");

  if (playerId) {
    db.ref("rooms/" + currentRoom.id + "/players/" + playerId).update({
      money: players[1].money,
      bet: 0,
      ready: false
    });
  }
}

renderPlayers();

document.getElementById("resultText").innerText = result;
}

window.loginLine = function () {
  alert("LINE LOGIN");
  showPage("lobbyPage");
};

window.logout = logout;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.playerReady = playerReady;
window.dealCards = dealCards;
window.newRound = newRound;
window.inviteLine = inviteLine;
window.playerDraw = playerDraw;
window.playerStand = playerStand;
window.bankerDraw = bankerDraw;
window.bankerStand = bankerStand;
window.finishGame = finishGame;
 
window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");

  if (roomId) {
    showPage("lobbyPage");
    document.getElementById("joinRoomId").value = roomId;
    joinRoom();
  } else {
    showPage("loginPage");
  }
};
function copyInviteLink() {
  if (!currentRoom || !currentRoom.id) {
    alert("ยังไม่มีห้อง");
    return;
  }

  const link = "https://chaisaksing-dot.github.io/pokdeng-live/?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
}

window.copyInviteLink = copyInviteLink;

function topUp() {
  const playerName = document.getElementById("playerName").value.trim();
  const amount = Number(document.getElementById("amount").value);

  if (!playerName) {
    alert("กรอกชื่อผู้เล่น");
    return;
  }

  if (!amount || amount <= 0) {
    alert("กรอกจำนวนเงิน");
    return;
  }

  db.ref("wallet/" + playerName)
    .once("value")
    .then((snap) => {

      let currentMoney = snap.val() || 0;

      db.ref("wallet/" + playerName)
        .set(currentMoney + amount);

      alert(
        "เติมเงินให้ " +
        playerName +
        " จำนวน " +
        amount +
        " บาท สำเร็จ"
      );

      document.getElementById("playerName").value = "";
      document.getElementById("amount").value = "";
    });
}
