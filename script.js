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

  if (pageId === "lobbyPage") {
    const playerId = localStorage.getItem("playerId") || "";

    db.ref("wallet/" + playerId).once("value").then((snap) => {
      const money = snap.val() || 0;
      console.log("เงินจาก Firebase =", snap.val());
      localStorage.setItem("playerMoney", money);

      document.getElementById("userInfo").innerText =
        "รหัส: " + playerId + " | เครดิต: " + money;
    });
  }

  document.getElementById(pageId).style.display = "block";
}

window.showPage = showPage;

function loginLine() {
const playerId =
document.getElementById("playerId")
.value
.trim();

db.ref("wallet/" + playerId)
.once("value")
.then((snap) => {

const money = Number(snap.val()) || 0;

localStorage.setItem("playerId", playerId);
localStorage.setItem("playerMoney", money);

document.getElementById("userInfo").innerText =
"รหัส: " + playerId + " | เครดิต: " + money;

showPage("lobbyPage");
});
}

window.loginLine = loginLine;
let roomNumber = 1000;
let currentRoom = null;
let myPlayerId = null;
let players = [];
let playerCards = [];
let bankerCards = [];

function logout() {
  localStorage.clear();
  showPage("loginPage");
}

 function createRoom() {
  const roomId = Date.now();
   let minBet = Number(document.getElementById("minBet").value) || 8;
let maxBet = Number(document.getElementById("maxBet").value) || 0;

  const playerId = localStorage.getItem("playerId") || "owner";

  db.ref("wallet/" + playerId).once("value").then((snap) => {
    const walletMoney = Number(snap.val()) || 0;
const bankerMoney = walletMoney;
const autoMaxBet = Math.floor(walletMoney / 8);

if (!maxBet) maxBet = autoMaxBet;

if (minBet > maxBet) {
  alert("ขั้นต่ำต้องไม่เกินสูงสุด");
  return;
}

if (maxBet * 8 > walletMoney) {
  alert("เงินเจ้ามือไม่พอ");
  return;
}

    currentRoom = {
      id: roomId,
      banker: playerId,
      bankerMoney: walletMoney,
      maxBet: maxBet,
      minBet: minBet,
      status: "waiting"
    };

    db.ref("rooms/" + roomId).set({
      ...currentRoom,
      players: {
        [playerId]: {
          name: playerId,
          money: walletMoney,
          bet: 0,
          ready: false,
          role: "banker"
        }
      }
    }).then(() => {
      myPlayerId = playerId;

      alert("สร้างห้องสำเร็จ ห้องเลข: " + roomId);

      listenPlayers(roomId);
      listenGame();

      document.getElementById("roomIdText").innerText = roomId;
      document.getElementById("bankerMoneyText").innerText = bankerMoney;
      document.getElementById("maxBetText").innerText = maxBet;

      showPage("roomPage");
      document.getElementById("betCard").style.display = "none";
document.getElementById("startGameBtn").style.display = "block";
    });
  });
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
  const roomId = document.getElementById("joinRoomId").value.trim();

  if (!roomId) {
    alert("กรุณาใส่เลขห้อง");
    return;
  }

  myPlayerId = localStorage.getItem("playerId");

  if (!myPlayerId) {
    alert("กรุณาเข้าสู่ระบบก่อน");
    showPage("loginPage");
    return;
  }

  db.ref("rooms/" + roomId).once("value").then((roomSnap) => {
    if (!roomSnap.exists()) {
      alert("ไม่พบห้องนี้");
      return;
    }

    currentRoom = roomSnap.val();

    document.getElementById("roomIdText").innerText = currentRoom.id;
    document.getElementById("bankerMoneyText").innerText = currentRoom.bankerMoney;
    document.getElementById("minBetText").innerText = currentRoom.minBet || 10;
    document.getElementById("maxBetText").innerText = currentRoom.maxBet;
loadBetOptions(currentRoom);
    
    db.ref("wallet/" + myPlayerId).once("value").then((moneySnap) => {
      const walletMoney = Number(moneySnap.val()) || 0;

      db.ref("rooms/" + roomId + "/players/" + myPlayerId)
        .once("value")
        .then((playerSnap) => {
          if (!playerSnap.exists()) {
            db.ref("rooms/" + roomId + "/players/" + myPlayerId).set({
              name: myPlayerId,
              money: walletMoney,
              bet: 0,
              ready: false,
              role: "player"
            });
          } else {
            db.ref("rooms/" + roomId + "/players/" + myPlayerId).update({
              money: walletMoney
            });
          }

          listenPlayers(roomId);
          listenGame();
          showPage("roomPage");
        });
    });
  });
}

function leaveRoom() {
  
  showPage("lobbyPage");
  
}

function renderPlayers() {
  for (let i = 1; i <= 8; i++) {
    const seat = document.getElementById("player" + i);
    if (seat) seat.innerHTML = "";
  }
  
  players
  .filter(p => p.role !== "banker")
  .forEach((player, index) => {
    const seat = document.getElementById("player" + (index + 1));
    if (!seat) return;

const isMe = player.name === myPlayerId;

const cardText = player.cards
  ? (isMe
      ? "<br>ไพ่: " + player.cards.join(" ")
      : "<br>ไพ่: 🂠 🂠")
  : "";
    
seat.innerHTML = `
<b>${player.role === "banker" ? "👑 เจ้ามือ" : "🙂 " + player.name}</b><br>
เงิน: ${player.money}<br>
${player.role === "banker" ? "" : "แทง: " + (player.bet || 0) + "<br>"}
${player.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม"}
${cardText}
`;

  });

  const betCard = document.getElementById("betCard");
  if (betCard) {
    const me = players.find(p => p.name === myPlayerId);
    betCard.style.display = me && me.role === "banker" ? "none" : "block";
  }
  
  const startBtn = document.getElementById("startGameBtn");
  if (startBtn) {
    const banker = players.find(p => p.role === "banker");
    const normalPlayers = players.filter(p => p.role === "player");

    if (
      banker &&
      banker.name === myPlayerId &&
      normalPlayers.length > 0 &&
      normalPlayers.every(p => p.ready === true)
    ) {
      startBtn.style.display = "block";
    } else {
      startBtn.style.display = "none";
    }
  }
  const bankerBox = document.getElementById("banker");
const bankerPlayer = players.find(p => p.role === "banker");

if (bankerBox && bankerPlayer) {
  bankerBox.innerHTML = `
    <b>👑 เจ้ามือ</b><br>
    เงิน: ${bankerPlayer.money}<br>
    🎮 รอเริ่มเกม
  `;
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

["♠","♥","♦","♣"].forEach(suit => {
  for(let value = 1; value <= 13; value++){
    cards.push({
      value:value,
      suit:suit
    });
  }
});

function dealCards() {
  if (!currentRoom || !currentRoom.id) {
    alert("ไม่พบห้อง");
    return;
  }

  const normalPlayers = players.filter(p => p.role === "player");

  if (normalPlayers.length === 0) {
    alert("ต้องมีผู้เล่นก่อนเริ่มเกม");
    return;
  }

  if (!normalPlayers.every(p => p.ready === true)) {
    alert("ผู้เล่นต้องกดพร้อมทุกคนก่อน");
    return;
  }

  const deck = [...cards];
  deck.sort(() => Math.random() - 0.5);

  const updates = {};

  players.forEach(player => {
    updates["rooms/" + currentRoom.id + "/players/" + player.name + "/cards"] = [
      deck.pop(),
      deck.pop()
    ];
  });

  updates["rooms/" + currentRoom.id + "/status"] = "playing";

  db.ref().update(updates).then(() => {
  document.getElementById("startGameBtn").style.display = "none";
  document.getElementById("resultText").innerText = "แจกไพ่แล้ว";
  document.getElementById("betCard").style.display = "none";
  players.forEach(p => {
    if (updates["rooms/" + currentRoom.id + "/players/" + p.name + "/cards"]) {
      p.cards = updates["rooms/" + currentRoom.id + "/players/" + p.name + "/cards"];
    }
  });

  renderPlayers();
});
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
function checkAllReady() {
  const startBtn = document.getElementById("startGameBtn");
  if (!startBtn) return;

  const me = players.find(p => p.name === myPlayerId);
  const normalPlayers = players.filter(p => p.role === "player");

  if (
    me &&
    me.role === "banker" &&
    normalPlayers.length > 0 &&
    normalPlayers.every(p => p.ready === true)
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
document.getElementById("resultText").innerText = result;
}
window.loginLine = loginLine;
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

  window.topUp = function() {
    const playerName =
document.getElementById("playerName")
.value
.trim();

  const amount = Number(document.getElementById("amount").value);

  if (!playerName) {
    alert("กรอกชื่อผู้เล่น");
    return;
  }

  if (!amount || amount <= 0) {
    alert("กรอกจำนวนเงิน");
    return;
  }

  db.ref("wallet/" + playerName).once("value").then((snap) => {
  const oldMoney = snap.val() || 0;
  const newMoney = oldMoney + amount;

  db.ref("wallet/" + playerName).set(newMoney).then(() => {
    alert("เติมเงินให้ " + playerName + " รวมเป็น " + newMoney);

    document.getElementById("playerName").value = "";
    document.getElementById("amount").value = "";
  });
});
  };
window.withdraw = function() {
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

  db.ref("wallet/" + playerName).once("value").then((snap) => {
    const oldMoney = Number(snap.val()) || 0;

    if (oldMoney < amount) {
      alert("ยอดเงินไม่พอถอน");
      return;
    }

    const newMoney = oldMoney - amount;

    db.ref("wallet/" + playerName).set(newMoney).then(() => {
      alert("ถอนเงินให้ " + playerName + " จำนวน " + amount + " บาท คงเหลือ " + newMoney);

      document.getElementById("playerName").value = "";
      document.getElementById("amount").value = "";
    });
  });
};
function loadBetOptions(room) {
  const select = document.getElementById("betAmount");
  if (!select) return;

  select.innerHTML = "";

  const min = Number(room.minBet) || 10;
  const max = Number(room.maxBet) || 10;

  const options = [10,20,30,50,100,200,300,500,1000,2000,5000];

  options.forEach(amount => {
    if (amount >= min && amount <= max) {
      select.innerHTML += `<option value="${amount}">${amount}</option>`;
    }
  });
updateMaxLose();
}
function updateMaxLose() {
  const bet = Number(document.getElementById("betAmount").value) || 0;
  document.getElementById("maxLoseText").innerText = bet * 5;
}

window.updateMaxLose = updateMaxLose;
