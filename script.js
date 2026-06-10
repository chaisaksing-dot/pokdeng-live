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

let currentRoom = null;
let myPlayerId = null;
let players = [];
let isDealing = false;

const cards = [
  "A♠","2♠","3♠","4♠","5♠","6♠","7♠","8♠","9♠","10♠","J♠","Q♠","K♠",
  "A♥","2♥","3♥","4♥","5♥","6♥","7♥","8♥","9♥","10♥","J♥","Q♥","K♥",
  "A♦","2♦","3♦","4♦","5♦","6♦","7♦","8♦","9♦","10♦","J♦","Q♦","K♦",
  "A♣","2♣","3♣","4♣","5♣","6♣","7♣","8♣","9♣","10♣","J♣","Q♣","K♣"
];

function showPage(pageId) {
  ["loginPage", "adminPage", "lobbyPage", "roomPage"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  if (pageId === "lobbyPage") {
    const playerId = localStorage.getItem("playerId") || "";
    db.ref("wallet/" + playerId).once("value").then(snap => {
      const money = Number(snap.val()) || 0;
      localStorage.setItem("playerMoney", money);
      const userInfo = document.getElementById("userInfo");
      if (userInfo) userInfo.innerText = "รหัส: " + playerId + " | เครดิต: " + money;
    });
  }

  const page = document.getElementById(pageId);
  if (page) page.style.display = "block";
}

function loginLine() {
  const playerId = document.getElementById("playerId").value.trim();
  if (!playerId) return alert("กรุณาใส่รหัสผู้เล่น");

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;
    myPlayerId = playerId;
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("playerMoney", money);
    showPage("lobbyPage");
  });
}

function logout() {
  localStorage.clear();
  showPage("loginPage");
}

function createRoom() {
  const roomId = Date.now();
  let minBet = Number(document.getElementById("minBet").value) || 8;
  let maxBet = Number(document.getElementById("maxBet").value) || 0;
  const playerId = localStorage.getItem("playerId") || "owner";

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const walletMoney = Number(snap.val()) || 0;
    const autoMaxBet = Math.floor(walletMoney / 8);
    if (!maxBet) maxBet = autoMaxBet;

    if (minBet > maxBet) return alert("ขั้นต่ำต้องไม่เกินสูงสุด");
    if (maxBet * 8 > walletMoney) return alert("เงินเจ้ามือไม่พอ");

    currentRoom = {
      id: roomId,
      banker: playerId,
      bankerMoney: walletMoney,
      maxBet,
      minBet,
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
          role: "banker",
          cards: null,
          actionDone: false
        }
      }
    }).then(() => {
      myPlayerId = playerId;
      listenRoom(roomId);
      showPage("roomPage");
    });
  });
}

function joinRoom() {
  const roomId = document.getElementById("joinRoomId").value.trim();
  if (!roomId) return alert("กรุณาใส่เลขห้อง");

  myPlayerId = localStorage.getItem("playerId");
  if (!myPlayerId) {
    alert("กรุณาเข้าสู่ระบบก่อน");
    showPage("loginPage");
    return;
  }

  db.ref("rooms/" + roomId).once("value").then(roomSnap => {
    if (!roomSnap.exists()) return alert("ไม่พบห้องนี้");

    currentRoom = { ...roomSnap.val(), id: roomId };
    loadBetOptions(currentRoom);

    db.ref("wallet/" + myPlayerId).once("value").then(moneySnap => {
      const walletMoney = Number(moneySnap.val()) || 0;

      db.ref("rooms/" + roomId + "/players/" + myPlayerId).once("value").then(playerSnap => {
        if (!playerSnap.exists()) {
          db.ref("rooms/" + roomId + "/players/" + myPlayerId).set({
            name: myPlayerId,
            money: walletMoney,
            bet: 0,
            ready: false,
            role: "player",
            cards: null,
            actionDone: false
          });
        } else {
          db.ref("rooms/" + roomId + "/players/" + myPlayerId).update({
            money: walletMoney
          });
        }

        listenRoom(roomId);
        showPage("roomPage");
      });
    });
  });
}

function listenRoom(roomId) {
  db.ref("rooms/" + roomId).on("value", snap => {
    const room = snap.val();
    if (!room) return;

    currentRoom = { ...room, id: roomId };
    players = Object.values(room.players || {});

    document.getElementById("roomIdText").innerText = roomId;
    document.getElementById("bankerMoneyText").innerText = room.bankerMoney || 0;
    document.getElementById("minBetText").innerText = room.minBet || 10;
    document.getElementById("maxBetText").innerText = room.maxBet || 0;

    renderPlayers();
    updateDeckRemain();
    setTimeout(updateActionButtons, 300);
  });
}

function leaveRoom() {
  showPage("lobbyPage");
}

function showCard(c) {
  let value, suit;
  if (typeof c === "string") {
    suit = c.slice(-1);
    value = c.slice(0, -1);
  } else {
    value = c.value;
    suit = c.suit;
  }

  if (value == 1) value = "A";
  if (value == 11) value = "J";
  if (value == 12) value = "Q";
  if (value == 13) value = "K";

  const colorClass = suit === "♥" || suit === "♦" ? "red-card" : "black-card";
  return `<span class="${colorClass}">${value}${suit}</span>`;
}

function cardValue(card) {
  let v = card;
  if (typeof card !== "string") {
    v = card.value;
  } else {
    const last = card.slice(-1);
    if (["♠", "♥", "♦", "♣"].includes(last)) v = card.slice(0, -1);
  }

  if (["J", "Q", "K"].includes(v)) return 0;
  if (v === "A") return 1;
  return Number(v) % 10;
}

function getPoint(cardList) {
  if (!cardList) return 0;
  let total = 0;
  Object.values(cardList).forEach(card => total += cardValue(card));
  return total % 10;
}

function isPok(cardList) {
  if (!cardList) return false;
  const arr = Object.values(cardList);
  if (arr.length !== 2) return false;
  const point = getPoint(arr);
  return point === 8 || point === 9;
}

function renderCards(cardList, isOpen) {
  if (!cardList) return "";
  const arr = Object.values(cardList);

  return `
    <br>
    <div class="banker-cards">
      ${arr.map(c => isOpen
        ? `<div class="mini-card">${showCard(c)}</div>`
        : `<div class="mini-card back"></div>`
      ).join("")}
    </div>
  `;
}

function renderPlayers() {
  for (let i = 1; i <= 8; i++) {
    const seat = document.getElementById("player" + i);
    if (seat) seat.innerHTML = "";
  }

  const normalPlayers = players.filter(p => p.role !== "banker");

  normalPlayers.forEach((player, index) => {
    const seat = document.getElementById("player" + (index + 1));
    if (!seat) return;

    const isMe = String(player.name) === String(myPlayerId);
    const cardText = renderCards(player.cards, isMe || isPok(player.cards));

    seat.innerHTML = `
      <b>🙂 ${player.name}</b><br>
      เงิน: ${player.money}<br>
      แทง: ${player.bet || 0}<br>
      ${player.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม"}
      ${cardText}
    `;
  });

  const bankerBox = document.getElementById("banker");
  const bankerPlayer = players.find(p => p.role === "banker");

  if (bankerBox && bankerPlayer) {
    const isBankerMe = String(bankerPlayer.name) === String(myPlayerId);
    const bankerCardsText = renderCards(bankerPlayer.cards, isBankerMe || isPok(bankerPlayer.cards));

    bankerBox.innerHTML = `
      <b>👑 เจ้ามือ</b><br>
      เงิน: ${bankerPlayer.money}<br>
      🎮 รอเริ่มเกม
      ${bankerCardsText}
    `;
  }

  renderBetBox();
  checkAllReady();
}

function renderBetBox() {
  const betCard = document.getElementById("betCard");
  if (!betCard) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (me && me.role === "player" && me.ready !== true && !me.cards && currentRoom && currentRoom.status === "waiting") {
    betCard.style.display = "block";
  } else {
    betCard.style.display = "none";
  }
}

function checkAllReady() {
  const startBtn = document.getElementById("startGameBtn");
  if (!startBtn) return;

  if (!currentRoom || currentRoom.status !== "waiting") {
    startBtn.style.display = "none";
    startBtn.disabled = false;
    return;
  }

  const me = players.find(p => String(p.name) === String(myPlayerId));
  const normalPlayers = players.filter(p => p.role === "player");

  if (me && me.role === "banker" && normalPlayers.length > 0 && normalPlayers.every(p => p.ready === true)) {
    startBtn.style.display = "block";
    startBtn.disabled = false;
  } else {
    startBtn.style.display = "none";
  }
}

function playerReady() {
  const bet = Number(document.getElementById("betAmount").value) || 0;

  if (!currentRoom || !currentRoom.id) return alert("ไม่พบห้อง");
  if (!myPlayerId) return alert("ไม่พบผู้เล่น");

  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me) return alert("ไม่พบข้อมูลผู้เล่น");

  if (!bet || bet <= 0) return alert("กรุณาเลือกเงินแทง");
  if (bet > Number(currentRoom.maxBet)) return alert("แทงเกินที่เจ้ามือกำหนด");
  if (me.money < bet * 5) return alert("เงินไม่พอ ต้องมีอย่างน้อย " + bet * 5);

  const betCard = document.getElementById("betCard");
  if (betCard) betCard.style.display = "none";

  db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
    bet,
    ready: true,
    actionDone: false
  });
}

function shuffleDeck() {
  const deck = [...cards];
  deck.sort(() => Math.random() - 0.5);
  return deck;
}

function getUsedCards() {
  const used = [];
  players.forEach(p => {
    if (p.cards) used.push(...Object.values(p.cards));
  });
  return used;
}

function drawOneCard() {
  const used = getUsedCards();
  const available = cards.filter(c => !used.includes(c));
  if (available.length === 0) return cards[Math.floor(Math.random() * cards.length)];
  return available[Math.floor(Math.random() * available.length)];
}

function dealCards() {
  if (isDealing) return;
  if (!currentRoom || !currentRoom.id) return;
  if (currentRoom.status !== "waiting") return;

  isDealing = true;

  const startBtn = document.getElementById("startGameBtn");
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.style.display = "none";
  }

  const normalPlayers = players.filter(p => p.role === "player");
  const bankerPlayer = players.find(p => p.role === "banker");

  if (normalPlayers.length === 0) {
    isDealing = false;
    return alert("ต้องมีผู้เล่นก่อนเริ่มเกม");
  }

  if (!normalPlayers.every(p => p.ready === true)) {
    isDealing = false;
    return alert("ผู้เล่นต้องกดพร้อมทุกคนก่อน");
  }

  const betCard = document.getElementById("betCard");
  if (betCard) betCard.style.display = "none";

  document.getElementById("resultText").innerText = "กำลังแจกไพ่...";

  const deck = shuffleDeck();
  const dealOrder = [];

  for (let round = 0; round < 2; round++) {
    normalPlayers.forEach(p => dealOrder.push(p.name));
    if (bankerPlayer) dealOrder.push(bankerPlayer.name);
  }

  const dealtCards = {};
  players.forEach(p => dealtCards[p.name] = []);

  db.ref("rooms/" + currentRoom.id).update({ status: "dealing" }).then(() => {
    let index = 0;

    function dealNextCard() {
      if (index >= dealOrder.length) {
        const updates = {};
        updates["rooms/" + currentRoom.id + "/status"] = "playing";

        players.forEach(p => {
          updates["rooms/" + currentRoom.id + "/players/" + p.name + "/actionDone"] = false;
        });

        db.ref().update(updates).then(() => {
          document.getElementById("resultText").innerText = "แจกไพ่แล้ว";

          setTimeout(() => {
            isDealing = false;
            renderPlayers();
            updateDeckRemain();
            updateActionButtons();
          }, 500);
        });

        return;
      }

      const playerName = dealOrder[index];
      const card = deck.pop();

      dealtCards[playerName].push(card);

      db.ref("rooms/" + currentRoom.id + "/players/" + playerName + "/cards")
        .set(dealtCards[playerName])
        .then(() => {
          index++;
          setTimeout(dealNextCard, 500);
        });
    }

    dealNextCard();
  });
}

function updateDeckRemain() {
  let usedCards = 0;
  players.forEach(p => {
    if (p.cards) usedCards += Object.values(p.cards).length;
  });

  const el = document.getElementById("deckRemainCount");
  if (el) el.innerText = 52 - usedCards;
}

function updateActionButtons() {
  const playerDrawBtn = document.getElementById("playerDrawBtn");
  const playerStandBtn = document.getElementById("playerStandBtn");
  const bankerDrawBtn = document.getElementById("bankerDrawBtn");
  const bankerStandBtn = document.getElementById("bankerStandBtn");

  [playerDrawBtn, playerStandBtn, bankerDrawBtn, bankerStandBtn].forEach(btn => {
    if (btn) btn.style.display = "none";
  });

  if (!currentRoom || currentRoom.status !== "playing") return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me || !me.cards) return;

  const myCards = Object.values(me.cards);
  const point = getPoint(myCards);

  if (myCards.length >= 3) {
    if (me.role === "player" && me.actionDone !== true) {
      db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({ actionDone: true });
    }
    return;
  }

  if (me.role === "player") {
    if (point >= 8) {
      if (me.actionDone !== true) {
        db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({ actionDone: true });
      }
      return;
    }

    document.getElementById("resultText").innerText = "เลือกจั่วหรืออยู่";
    if (playerDrawBtn) playerDrawBtn.style.display = "block";
    if (playerStandBtn) playerStandBtn.style.display = "block";
    return;
  }

  if (me.role === "banker") {
    const normalPlayers = players.filter(p => p.role === "player");

    const allPlayersDone = normalPlayers.every(p => {
      if (!p.cards) return false;
      const cardsNow = Object.values(p.cards);
      const pPoint = getPoint(cardsNow);
      return cardsNow.length >= 3 || pPoint >= 8 || p.actionDone === true;
    });

    if (!allPlayersDone) {
      document.getElementById("resultText").innerText = "รอผู้เล่นจั่ว/อยู่";
      return;
    }

    if (point >= 8) {
      finishGame();
      return;
    }

    document.getElementById("resultText").innerText = "เจ้ามือเลือกจั่วหรืออยู่";
    if (bankerDrawBtn) bankerDrawBtn.style.display = "block";
    if (bankerStandBtn) bankerStandBtn.style.display = "block";
  }
}

function checkPlayersDoneThenBanker() {
  const normalPlayers = players.filter(p => p.role === "player");

  const allDone = normalPlayers.every(p => {
    if (!p.cards) return false;
    const cardsNow = Object.values(p.cards);
    const point = getPoint(cardsNow);
    return cardsNow.length >= 3 || point >= 8 || p.actionDone === true;
  });

  if (allDone) {
    setTimeout(nextBankerTurn, 500);
  }
}

function playerDraw() {
  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me || !me.cards) return;

  const currentCards = Object.values(me.cards);
  if (currentCards.length >= 3 || me.actionDone === true) return;

  document.getElementById("resultText").innerText = "ผู้เล่นกำลังจั่ว...";

  currentCards.push(drawOneCard());

  db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
    cards: currentCards,
    actionDone: true
  }).then(() => {
    document.getElementById("playerDrawBtn").style.display = "none";
    document.getElementById("playerStandBtn").style.display = "none";

    players = players.map(p => String(p.name) === String(myPlayerId)
      ? { ...p, cards: currentCards, actionDone: true }
      : p
    );

    updateDeckRemain();
    checkPlayersDoneThenBanker();
  });
}

function playerStand() {
  document.getElementById("playerDrawBtn").style.display = "none";
  document.getElementById("playerStandBtn").style.display = "none";

  db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
    actionDone: true
  }).then(() => {
    document.getElementById("resultText").innerText = "ผู้เล่นอยู่";

    players = players.map(p => String(p.name) === String(myPlayerId)
      ? { ...p, actionDone: true }
      : p
    );

    checkPlayersDoneThenBanker();
  });
}

function nextBankerTurn() {
  const banker = players.find(p => p.role === "banker");
  if (!banker || !banker.cards) return;

  const bankerCardsNow = Object.values(banker.cards);
  const point = getPoint(bankerCardsNow);

  if (bankerCardsNow.length >= 3 || point >= 8) {
    finishGame();
    return;
  }

  document.getElementById("resultText").innerText = "เจ้ามือเลือกจั่วหรืออยู่";
  document.getElementById("bankerDrawBtn").style.display = "block";
  document.getElementById("bankerStandBtn").style.display = "block";
}

function bankerDraw() {
  const banker = players.find(p => p.role === "banker");
  if (!banker || !banker.cards) return;

  const currentCards = Object.values(banker.cards);
  if (currentCards.length >= 3) return;

  document.getElementById("resultText").innerText = "เจ้ามือกำลังจั่ว...";

  currentCards.push(drawOneCard());

  db.ref("rooms/" + currentRoom.id + "/players/" + banker.name).update({
    cards: currentCards,
    actionDone: true
  }).then(() => {
    document.getElementById("bankerDrawBtn").style.display = "none";
    document.getElementById("bankerStandBtn").style.display = "none";
    setTimeout(finishGame, 500);
  });
}

function bankerStand() {
  document.getElementById("bankerDrawBtn").style.display = "none";
  document.getElementById("bankerStandBtn").style.display = "none";
  finishGame();
}

function finishGame() {
  document.getElementById("resultText").innerText = "จบตาแล้ว";

  ["playerDrawBtn", "playerStandBtn", "bankerDrawBtn", "bankerStandBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const newRoundBtn = document.getElementById("newRoundBtn");
  if (newRoundBtn) newRoundBtn.style.display = "block";

  if (currentRoom && currentRoom.id && currentRoom.status !== "finished") {
    db.ref("rooms/" + currentRoom.id).update({ status: "finished" });
  }
}

function newRound() {
  if (!currentRoom || !currentRoom.id) return;

  document.getElementById("cardsArea").innerHTML = "";
  document.getElementById("resultText").innerText = "ยังไม่มีผล";

  ["playerDrawBtn", "playerStandBtn", "bankerDrawBtn", "bankerStandBtn", "newRoundBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const betAmount = document.getElementById("betAmount");
  if (betAmount) betAmount.value = "";

  isDealing = false;

  const updates = {};
  updates["rooms/" + currentRoom.id + "/status"] = "waiting";

  players.forEach(p => {
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/ready"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/bet"] = 0;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/cards"] = null;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/actionDone"] = false;
  });

  db.ref().update(updates).then(() => {
    const deckRemain = document.getElementById("deckRemainCount");
    if (deckRemain) deckRemain.innerText = 52;

    const startBtn = document.getElementById("startGameBtn");
    if (startBtn) startBtn.disabled = false;
  });
}

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
  const el = document.getElementById("maxLoseText");
  if (el) el.innerText = bet * 5;
}

function copyInviteLink() {
  if (!currentRoom || !currentRoom.id) return alert("ยังไม่มีห้อง");

  const link = "https://chaisaksing-dot.github.io/pokdeng-live/?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
}

function topUp() {
  const playerName = document.getElementById("playerName").value.trim();
  const amount = Number(document.getElementById("amount").value);

  if (!playerName) return alert("กรอกชื่อผู้เล่น");
  if (!amount || amount <= 0) return alert("กรอกจำนวนเงิน");

  db.ref("wallet/" + playerName).once("value").then(snap => {
    const oldMoney = Number(snap.val()) || 0;
    const newMoney = oldMoney + amount;

    db.ref("wallet/" + playerName).set(newMoney).then(() => {
      alert("เติมเงินให้ " + playerName + " รวมเป็น " + newMoney);
      document.getElementById("playerName").value = "";
      document.getElementById("amount").value = "";
    });
  });
}

function withdraw() {
  const playerName = document.getElementById("playerName").value.trim();
  const amount = Number(document.getElementById("amount").value);

  if (!playerName) return alert("กรอกชื่อผู้เล่น");
  if (!amount || amount <= 0) return alert("กรอกจำนวนเงิน");

  db.ref("wallet/" + playerName).once("value").then(snap => {
    const oldMoney = Number(snap.val()) || 0;
    if (oldMoney < amount) return alert("ยอดเงินไม่พอถอน");

    const newMoney = oldMoney - amount;

    db.ref("wallet/" + playerName).set(newMoney).then(() => {
      alert("ถอนเงินให้ " + playerName + " จำนวน " + amount + " บาท คงเหลือ " + newMoney);
      document.getElementById("playerName").value = "";
      document.getElementById("amount").value = "";
    });
  });
}

window.loginLine = loginLine;
window.logout = logout;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.playerReady = playerReady;
window.dealCards = dealCards;
window.newRound = newRound;
window.copyInviteLink = copyInviteLink;
window.playerDraw = playerDraw;
window.playerStand = playerStand;
window.bankerDraw = bankerDraw;
window.bankerStand = bankerStand;
window.finishGame = finishGame;
window.updateMaxLose = updateMaxLose;
window.updateActionButtons = updateActionButtons;
window.topUp = topUp;
window.withdraw = withdraw;

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
