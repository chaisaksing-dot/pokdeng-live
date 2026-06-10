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
      if (userInfo) {
        userInfo.innerText = "รหัส: " + playerId + " | เครดิต: " + money;
      }
    });
  }

  const page = document.getElementById(pageId);
  if (page) page.style.display = "block";
}

function loginLine() {
  const playerId = document.getElementById("playerId").value.trim();

  if (!playerId) {
    alert("กรุณาใส่รหัสผู้เล่น");
    return;
  }

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

      document.getElementById("roomIdText").innerText = roomId;
      document.getElementById("bankerMoneyText").innerText = walletMoney;
      document.getElementById("minBetText").innerText = minBet;
      document.getElementById("maxBetText").innerText = maxBet;
      document.getElementById("deckRemainCount").innerText = 52;

      listenRoom(roomId);
      showPage("roomPage");
    });
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

  db.ref("rooms/" + roomId).once("value").then(roomSnap => {
    if (!roomSnap.exists()) {
      alert("ไม่พบห้องนี้");
      return;
    }

    currentRoom = roomSnap.val();

    document.getElementById("roomIdText").innerText = currentRoom.id;
    document.getElementById("bankerMoneyText").innerText = currentRoom.bankerMoney;
    document.getElementById("minBetText").innerText = currentRoom.minBet || 10;
    document.getElementById("maxBetText").innerText = currentRoom.maxBet;
    document.getElementById("deckRemainCount").innerText = 52;

    loadBetOptions(currentRoom);

    db.ref("wallet/" + myPlayerId).once("value").then(moneySnap => {
      const walletMoney = Number(moneySnap.val()) || 0;

      db.ref("rooms/" + roomId + "/players/" + myPlayerId)
        .once("value")
        .then(playerSnap => {
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

    currentRoom = {
  ...room,
  id: roomId
};

    const data = room.players || {};
    players = Object.values(data);
    console.log("MY ID =", myPlayerId);
    console.log("PLAYERS =", players);

    document.getElementById("roomIdText").innerText = room.id;
    document.getElementById("bankerMoneyText").innerText = room.bankerMoney;
    document.getElementById("minBetText").innerText = room.minBet || 10;
    document.getElementById("maxBetText").innerText = room.maxBet;

    renderPlayers();
updateDeckRemain();
setTimeout(updateActionButtons, 300);
setTimeout(updateActionButtons, 1000);
setTimeout(updateActionButtons, 1500);

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

function renderCards(cardList, isOpen) {
  if (!cardList) return "";

  const arr = Object.values(cardList);

  return `
    <br>
    <div class="banker-cards">
      ${arr.map(c => {
        return isOpen
          ? `<div class="mini-card">${showCard(c)}</div>`
          : `<div class="mini-card back"></div>`;
      }).join("")}
    </div>
  `;
}

function isPok(cards) {
  if (!cards) return false;
  const arr = Object.values(cards);
  if (arr.length !== 2) return false;
  const point = getPoint(arr);
  return point === 8 || point === 9;
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
  updateActionButtons();
}

function renderBetBox() {
  const betCard = document.getElementById("betCard");
  if (!betCard) return;

  const me = players.find(p => p.name === myPlayerId);

  if (!me || me.role !== "player") {
    betCard.style.display = "none";
    return;
  }

  if (me.ready === true || me.cards || currentRoom.status === "playing") {
    betCard.style.display = "none";
    return;
  }

  betCard.style.display = "block";
}

function checkAllReady() {
  const startBtn = document.getElementById("startGameBtn");
  if (!startBtn) return;

  if (!currentRoom || currentRoom.status === "playing") {
    startBtn.style.display = "none";
    return;
  }

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

function playerReady() {
  const bet = Number(document.getElementById("betAmount").value) || 0;

  if (!currentRoom || !currentRoom.id) {
    alert("ไม่พบห้อง");
    return;
  }

  if (!myPlayerId) {
    alert("ไม่พบผู้เล่น");
    return;
  }

  const me = players.find(p => p.name === myPlayerId);

  if (!me) {
    alert("ไม่พบข้อมูลผู้เล่น");
    return;
  }

  if (!bet || bet <= 0) {
    alert("กรุณาเลือกเงินแทง");
    return;
  }

  if (bet > Number(currentRoom.maxBet)) {
    alert("แทงเกินที่เจ้ามือกำหนด");
    return;
  }

  if (me.money < bet * 5) {
    alert("เงินไม่พอ ต้องมีอย่างน้อย " + bet * 5);
    return;
  }

  const betCard = document.getElementById("betCard");
  if (betCard) betCard.style.display = "none";

  db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
    bet: bet,
    ready: true
  }).then(() => {
    const betCard = document.getElementById("betCard");
    if (betCard) betCard.style.display = "none";
  });
}

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

  const startBtn = document.getElementById("startGameBtn");
  const betCard = document.getElementById("betCard");

  if (startBtn) startBtn.style.display = "none";
  if (betCard) betCard.style.display = "none";

  const deck = [...cards];
  deck.sort(() => Math.random() - 0.5);

  const dealOrder = [];
  const bankerPlayer = players.find(p => p.role === "banker");

  for (let round = 0; round < 2; round++) {
    normalPlayers.forEach(p => {
      dealOrder.push(p.name);
    });

    if (bankerPlayer) {
      dealOrder.push(bankerPlayer.name);
    }
  }

  const dealtCards = {};
  players.forEach(p => {
    dealtCards[p.name] = [];
  });

  db.ref("rooms/" + currentRoom.id + "/status").set("playing");

  let index = 0;

  function dealNextCard() {
    if (index >= dealOrder.length) {
    document.getElementById("resultText").innerText = "แจกไพ่แล้ว";
    updateDeckRemain();

      setTimeout(() => {
  renderPlayers();
  updateActionButtons();
}, 1000);

    return;
}

    const playerName = dealOrder[index];
    const card = randomCard();

    dealtCards[playerName].push(card);

    db.ref("rooms/" + currentRoom.id + "/players/" + playerName + "/cards")
      .set(dealtCards[playerName])
      .then(() => {
        updateDeckRemain();
        index++;
        setTimeout(dealNextCard, 700);
      });
  }

  dealNextCard();
}

function updateDeckRemain() {
  let usedCards = 0;

  players.forEach(p => {
    if (p.cards) {
      usedCards += Object.values(p.cards).length;
    }
  });

  const remain = 52 - usedCards;
  const el = document.getElementById("deckRemainCount");

  if (el) el.innerText = remain;
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
  });
  window.autoDrawLock = false;
window.autoBankerLock = false;
  window.lastAutoDrawKey = "";
}

function cardValue(card) {
  let v = card;

  if (typeof card !== "string") {
    v = card.value;
  } else {
    const last = card.slice(-1);
    if (["♠", "♥", "♦", "♣"].includes(last)) {
      v = card.slice(0, -1);
    }
  }

  if (["J", "Q", "K"].includes(v)) return 0;
  if (v === "A") return 1;

  return Number(v) % 10;
}

function getPoint(cardList) {
  if (!cardList) return 0;

  let total = 0;
  Object.values(cardList).forEach(card => {
    total += cardValue(card);
  });

  return total % 10;
}

function randomCard() {
  return cards[Math.floor(Math.random() * cards.length)];
}

function checkPlayersDoneThenBanker() {
  const normalPlayers = players.filter(p => p.role === "player");

  const allDone = normalPlayers.every(p => {
    if (!p.cards) return false;

    const cards = Object.values(p.cards);
    const point = getPoint(cards);

    return (
      cards.length >= 3 ||
      point >= 8 ||
      p.actionDone === true
    );
  });

  if (allDone) {
    setTimeout(() => {
      nextBankerTurn();
    }, 800);
  }
}

function playerDraw() {
  document.getElementById("resultText").innerText = "ผู้เล่นกำลังจั่ว...";

  setTimeout(() => {
    const me = players.find(p => String(p.name) === String(myPlayerId));
    if (!me) return;

    const currentCards = me.cards ? Object.values(me.cards) : [];
    const card = randomCard();

    currentCards.push(card);

    db.ref(
      "rooms/" + currentRoom.id + "/players/" + myPlayerId
    ).update({
      cards: currentCards,
      actionDone: true
    }).then(() => {
players = players.map(p => {
  if (String(p.name) === String(myPlayerId)) {
    return { ...p, cards: currentCards, actionDone: true };
  }
  return p;
});
      updateDeckRemain();

      document.getElementById("playerDrawBtn").style.display = "none";
      document.getElementById("playerStandBtn").style.display = "none";

      checkPlayersDoneThenBanker();
    });
  }, 800);
}

function playerStand() {
  document.getElementById("playerDrawBtn").style.display = "none";
  document.getElementById("playerStandBtn").style.display = "none";

  db.ref(
    "rooms/" + currentRoom.id + "/players/" + myPlayerId
  ).update({
    actionDone: true
  }).then(() => {
    document.getElementById("resultText").innerText = "ผู้เล่นอยู่";
    checkPlayersDoneThenBanker();
  });
}

function nextBankerTurn() {
  const banker = players.find(p => p.role === "banker");
  if (!banker || !banker.cards) return;

  const bankerCardsNow = Object.values(banker.cards);
  const point = getPoint(bankerCardsNow);

  if (bankerCardsNow.length >= 3) {
    finishGame();
    return;
  }

  if (point <= 3) {
    bankerDraw();
    return;
  }

  if (point >= 4 && point <= 7) {
    document.getElementById("bankerDrawBtn").style.display = "block";
    document.getElementById("bankerStandBtn").style.display = "block";
    return;
  }

  finishGame();
}

function bankerDraw() {
  document.getElementById("resultText").innerText = "เจ้ามือกำลังจั่ว...";

  setTimeout(() => {
    const banker = players.find(p => p.role === "banker");
    if (!banker) return;

    const currentCards = banker.cards ? Object.values(banker.cards) : [];
    const card = randomCard();

    currentCards.push(card);

    db.ref("rooms/" + currentRoom.id + "/players/" + banker.name + "/cards")
      .set(currentCards)
      .then(() => {
        updateDeckRemain();

        document.getElementById("bankerDrawBtn").style.display = "none";
        document.getElementById("bankerStandBtn").style.display = "none";

        setTimeout(() => {
          finishGame();
        }, 800);
      });
  }, 1000);
}

function bankerStand() {
  document.getElementById("bankerDrawBtn").style.display = "none";
  document.getElementById("bankerStandBtn").style.display = "none";
  finishGame();
}

function finishGame() {
  document.getElementById("resultText").innerText = "จบตาแล้ว";

  document.getElementById("playerDrawBtn").style.display = "none";
  document.getElementById("playerStandBtn").style.display = "none";
  document.getElementById("bankerDrawBtn").style.display = "none";
  document.getElementById("bankerStandBtn").style.display = "none";

  const newRoundBtn = document.getElementById("newRoundBtn");
  if (newRoundBtn) newRoundBtn.style.display = "block";
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
  if (!currentRoom || !currentRoom.id) {
    alert("ยังไม่มีห้อง");
    return;
  }

  const link = "https://chaisaksing-dot.github.io/pokdeng-live/?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
}

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

  if (!playerName) {
    alert("กรอกชื่อผู้เล่น");
    return;
  }

  if (!amount || amount <= 0) {
    alert("กรอกจำนวนเงิน");
    return;
  }

  db.ref("wallet/" + playerName).once("value").then(snap => {
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

  if (myCards.length >= 3) return;

  if (me.role === "player") {
    if (point >= 8) {
      db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
        actionDone: true
      });
      return;
    }

    if (point <= 3) {
      document.getElementById("resultText").innerText = "ผู้เล่นกำลังจั่ว...";
      setTimeout(() => {
        playerDraw();
      }, 500);
      return;
    }

    if (point >= 4 && point <= 7) {
      document.getElementById("resultText").innerText = "เลือกจั่วหรืออยู่";
      if (playerDrawBtn) playerDrawBtn.style.display = "block";
      if (playerStandBtn) playerStandBtn.style.display = "block";
      return;
    }
  }

  if (me.role === "banker") {
    const normalPlayers = players.filter(p => p.role === "player");

    const allPlayersDone = normalPlayers.every(p => {
      if (!p.cards) return false;
      const cards = Object.values(p.cards);
      const pPoint = getPoint(cards);
      return cards.length >= 3 || pPoint >= 8 || p.actionDone === true;
    });

    if (!allPlayersDone) {
      document.getElementById("resultText").innerText = "รอผู้เล่นจั่ว/อยู่";
      return;
    }

    if (point >= 8) {
      finishGame();
      return;
    }

    if (point <= 3) {
      if (window.autoBankerLock) return;
      window.autoBankerLock = true;
      setTimeout(() => {
        bankerDraw();
      }, 800);
      return;
    }

    if (point >= 4 && point <= 7) {
      if (bankerDrawBtn) bankerDrawBtn.style.display = "block";
      if (bankerStandBtn) bankerStandBtn.style.display = "block";
    }
  }
}

window.updateActionButtons = updateActionButtons;

function forcePlayerTurn() {
  if (!currentRoom || currentRoom.status !== "playing") return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me || me.role !== "player" || !me.cards) return;

  const playerDrawBtn = document.getElementById("playerDrawBtn");
  const playerStandBtn = document.getElementById("playerStandBtn");

  const myCards = Object.values(me.cards);
  const point = getPoint(myCards);

  if (myCards.length >= 3 ) return;

  if (point >= 8) {
    db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
      actionDone: true
    });
    return;
  }

  if (point <= 3) {
    const key = currentRoom.id + "-" + myPlayerId + "-" + myCards.join(",");
    if (window.forceDrawKey === key) return;
    window.forceDrawKey = key;

    document.getElementById("resultText").innerText = "ผู้เล่นกำลังจั่ว...";
    setTimeout(() => playerDraw(), 500);
    return;
  }

  if (point >= 4 && point <= 7) {
    document.getElementById("resultText").innerText = "เลือกจั่วหรืออยู่";
    if (playerDrawBtn) playerDrawBtn.style.display = "block";
    if (playerStandBtn) playerStandBtn.style.display = "block";
  }
}

setInterval(forcePlayerTurn, 500);
