script = r'''const firebaseConfig = {
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
let roomListenerRef = null;
let openRoomsListenerRef = null;
let timerInterval = null;
let isDealing = false;
let isDrawing = false;
let moneyRequestType = "topup";
let myAdminRole = null;

const OWNER_ID = "0001";
const MAX_PLAYERS = 8;
const TURN_SECONDS = 15;

const cards = [
  "A♠","2♠","3♠","4♠","5♠","6♠","7♠","8♠","9♠","10♠","J♠","Q♠","K♠",
  "A♥","2♥","3♥","4♥","5♥","6♥","7♥","8♥","9♥","10♥","J♥","Q♥","K♥",
  "A♦","2♦","3♦","4♦","5♦","6♦","7♦","8♦","9♦","10♦","J♦","Q♦","K♦",
  "A♣","2♣","3♣","4♣","5♣","6♣","7♣","8♣","9♣","10♣","J♣","Q♣","K♣"
];

function el(id) {
  return document.getElementById(id);
}

function showPage(pageId) {
  ["loginPage", "adminPage", "lobbyPage", "roomPage"].forEach(id => {
    const box = el(id);
    if (box) box.style.display = "none";
  });

  const page = el(pageId);
  if (page) page.style.display = "block";

  if (pageId === "lobbyPage") {
    refreshUserInfo();
    listenOpenRooms();
  }

  if (pageId === "adminPage") {
    loadAdminData();
  }
}

function showOldIdBox() {
  const box = el("oldIdBox");
  if (box) box.style.display = "block";
}

function autoLogin() {
  const savedId = localStorage.getItem("playerId");
  if (savedId) {
    loginWithId(savedId, null);
  } else {
    createNewPlayerId(null);
  }
}

function loginLine() {
  const input = el("playerId");
  const playerId = input ? input.value.trim() : "";
  if (!playerId) return alert("กรุณาใส่รหัสผู้เล่น");
  loginWithId(playerId, null);
}

function createNewPlayerId(roomIdAfterLogin) {
  db.ref("system/lastPlayerNo").transaction(v => (Number(v) || 0) + 1, (error, committed, snap) => {
    if (error || !committed) {
      alert("สร้างรหัสผู้เล่นไม่สำเร็จ");
      return;
    }

    const newId = String(snap.val()).padStart(4, "0");
    loginWithId(newId, roomIdAfterLogin);
  });
}

function loginWithId(playerId, roomIdAfterLogin) {
  myPlayerId = String(playerId);
  localStorage.setItem("playerId", myPlayerId);

  const walletRef = db.ref("wallet/" + myPlayerId);
  walletRef.once("value").then(snap => {
    if (!snap.exists()) walletRef.set(0);

    db.ref("users/" + myPlayerId).once("value").then(userSnap => {
      if (!userSnap.exists()) {
        db.ref("users/" + myPlayerId).set({
          id: myPlayerId,
          name: "ผู้เล่น " + myPlayerId,
          createdAt: Date.now()
        });
      }

      checkAdminRole(myPlayerId).then(() => {
        if (roomIdAfterLogin) {
          showPage("lobbyPage");
          setTimeout(() => {
            const joinInput = el("joinRoomId");
            if (joinInput) joinInput.value = roomIdAfterLogin;
            joinRoom();
          }, 500);
        } else {
          showPage("lobbyPage");
        }
      });
    });
  });
}

function checkAdminRole(playerId) {
  return db.ref("admins/" + playerId).once("value").then(snap => {
    if (playerId === OWNER_ID && !snap.exists()) {
      db.ref("admins/" + playerId).set("owner");
      myAdminRole = "owner";
    } else {
      myAdminRole = snap.val() || null;
    }
  });
}

function refreshUserInfo() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return;

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;
    const box = el("userInfo");
    if (box) box.innerText = "รหัส: " + playerId + " | เครดิต: " + money;
  });
}

function logout() {
  localStorage.removeItem("playerId");
  myPlayerId = null;
  myAdminRole = null;
  stopTimer();
  if (roomListenerRef) roomListenerRef.off();
  if (openRoomsListenerRef) openRoomsListenerRef.off();
  showPage("loginPage");
}

function openAdmin() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return alert("กรุณาเข้าสู่ระบบก่อน");

  checkAdminRole(playerId).then(() => {
    if (!myAdminRole) return alert("คุณไม่มีสิทธิ์เข้าแอดมิน");
    showPage("adminPage");
  });
}

function createRoom() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return alert("ไม่พบรหัสผู้เล่น");

  const minBet = Number(el("minBet")?.value) || 10;
  const maxBet = Number(el("maxBet")?.value) || 50;

  if (minBet > maxBet) return alert("ขั้นต่ำต้องไม่เกินสูงสุด");

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;
    if (money < maxBet * 5) {
      alert("เครดิตเจ้ามือต้องมีอย่างน้อย " + (maxBet * 5));
      return;
    }

    const roomId = String(Date.now());
    const roomData = {
      id: roomId,
      banker: playerId,
      bankerMoney: money,
      minBet,
      maxBet,
      status: "waiting",
      deck: null,
      turnOrder: [],
      turnIndex: 0,
      turnDeadline: 0,
      createdAt: Date.now(),
      players: {
        [playerId]: {
          name: playerId,
          money,
          bet: 0,
          ready: false,
          role: "banker",
          cards: null,
          actionDone: false,
          result: null
        }
      }
    };

    db.ref("rooms/" + roomId).set(roomData).then(() => {
      listenRoom(roomId);
      showPage("roomPage");
    });
  });
}

function listenOpenRooms() {
  const box = el("openRoomsList");
  if (!box) return;

  if (openRoomsListenerRef) openRoomsListenerRef.off();
  openRoomsListenerRef = db.ref("rooms");

  openRoomsListenerRef.on("value", snap => {
    const rooms = snap.val() || {};
    box.innerHTML = "";

    Object.values(rooms).forEach(room => {
      const roomPlayers = Object.values(room.players || {});
      const playerCount = roomPlayers.filter(p => p.role === "player").length;

      if (room.status === "waiting" && playerCount < MAX_PLAYERS) {
        box.innerHTML += `
          <div class="room-item">
            <b>ห้อง ${room.id}</b><br>
            เจ้ามือ: ${room.banker}<br>
            ผู้เล่น: ${playerCount}/${MAX_PLAYERS}<br>
            ขั้นต่ำ: ${room.minBet} | สูงสุด: ${room.maxBet}<br>
            <button class="btn small" onclick="joinOpenRoom('${room.id}')">เข้าห้อง</button>
          </div>
        `;
      }
    });

    if (!box.innerHTML) box.innerHTML = "ยังไม่มีห้องว่าง";
  });
}

function joinOpenRoom(roomId) {
  const input = el("joinRoomId");
  if (input) input.value = roomId;
  joinRoom();
}

function joinRoom() {
  const input = el("joinRoomId");
  const roomId = input ? input.value.trim() : "";
  const playerId = localStorage.getItem("playerId") || myPlayerId;

  if (!roomId) return alert("กรุณาใส่เลขห้อง");
  if (!playerId) {
    alert("กรุณาเข้าสู่ระบบก่อน");
    showPage("loginPage");
    return;
  }

  db.ref("rooms/" + roomId).once("value").then(roomSnap => {
    if (!roomSnap.exists()) return alert("ไม่พบห้องนี้");

    const room = roomSnap.val();
    if (room.status !== "waiting") return alert("ห้องนี้เริ่มเล่นแล้ว");

    const roomPlayers = Object.values(room.players || {});
    const normalPlayers = roomPlayers.filter(p => p.role === "player");

    if (!room.players?.[playerId] && normalPlayers.length >= MAX_PLAYERS) {
      return alert("ห้องเต็มแล้ว");
    }

    loadBetOptions(room);

    db.ref("wallet/" + playerId).once("value").then(moneySnap => {
      const money = Number(moneySnap.val()) || 0;
      const playerPath = "rooms/" + roomId + "/players/" + playerId;

      db.ref(playerPath).once("value").then(playerSnap => {
        if (!playerSnap.exists()) {
          db.ref(playerPath).set({
            name: playerId,
            money,
            bet: 0,
            ready: false,
            role: "player",
            cards: null,
            actionDone: false,
            result: null
          });
        } else {
          db.ref(playerPath).update({ money });
        }

        listenRoom(roomId);
        showPage("roomPage");
      });
    });
  });
}

function listenRoom(roomId) {
  if (roomListenerRef) roomListenerRef.off();
  roomListenerRef = db.ref("rooms/" + roomId);

  roomListenerRef.on("value", snap => {
    const room = snap.val();
    if (!room) return;

    currentRoom = { ...room, id: roomId };
    players = Object.values(room.players || {});

    if (el("roomIdText")) el("roomIdText").innerText = roomId;
    if (el("bankerMoneyText")) el("bankerMoneyText").innerText = getBanker()?.money || room.bankerMoney || 0;
    if (el("minBetText")) el("minBetText").innerText = room.minBet || 10;
    if (el("maxBetText")) el("maxBetText").innerText = room.maxBet || 0;

    renderPlayers();
    renderBetBox();
    checkAllReady();
    updateDeckRemain();
    updateActionButtons();
    updateTurnTimer();
  });
}

function leaveRoom() {
  stopTimer();
  if (roomListenerRef) roomListenerRef.off();
  currentRoom = null;
  players = [];
  showPage("lobbyPage");
}

function copyInviteLink() {
  if (!currentRoom || !currentRoom.id) return alert("ยังไม่มีห้อง");

  const link = "https://chaisaksing-dot.github.io/pokdeng-live/?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
}

function createShuffledDeck() {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function updateDeckRemain() {
  const remain = Array.isArray(currentRoom?.deck) ? currentRoom.deck.length : 52;
  const box = el("deckRemainCount");
  if (box) box.innerText = remain;
}

function dealCards() {
  if (isDealing) return;
  if (!currentRoom || currentRoom.status !== "waiting") return;

  const normalPlayers = players.filter(p => p.role === "player");
  const banker = getBanker();

  if (!banker) return alert("ไม่พบเจ้ามือ");
  if (normalPlayers.length === 0) return alert("ต้องมีผู้เล่นก่อนเริ่มเกม");
  if (!normalPlayers.every(p => p.ready === true)) return alert("ผู้เล่นต้องกดพร้อมทุกคนก่อน");

  isDealing = true;
  const deck = createShuffledDeck();
  const updates = {};

  updates["rooms/" + currentRoom.id + "/status"] = "dealing";
  updates["rooms/" + currentRoom.id + "/deck"] = deck;
  updates["rooms/" + currentRoom.id + "/turnOrder"] = [];
  updates["rooms/" + currentRoom.id + "/turnIndex"] = 0;
  updates["rooms/" + currentRoom.id + "/turnDeadline"] = 0;

  players.forEach(p => {
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/cards"] = [];
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/actionDone"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/result"] = null;
  });

  const startBtn = el("startGameBtn");
  if (startBtn) startBtn.style.display = "none";

  db.ref().update(updates).then(() => {
    const order = [];
    for (let r = 0; r < 2; r++) {
      normalPlayers.forEach(p => order.push(p.name));
      order.push(banker.name);
    }

    let index = 0;

    function dealNext() {
      if (index >= order.length) {
        db.ref("rooms/" + currentRoom.id + "/status").set("playing").then(() => {
          isDealing = false;
          setTimeout(checkPokImmediately, 500);
        });
        return;
      }

      const playerId = order[index];

      db.ref("rooms/" + currentRoom.id + "/deck").transaction(currentDeck => {
        if (!currentDeck || currentDeck.length === 0) return currentDeck;
        const newDeck = [...currentDeck];
        const card = newDeck.shift();
        window.__dealCard = card;
        return newDeck;
      }, (error, committed) => {
        if (error || !committed || !window.__dealCard) {
          isDealing = false;
          alert("แจกไพ่ผิดพลาด");
          return;
        }

        const card = window.__dealCard;
        window.__dealCard = null;

        db.ref("rooms/" + currentRoom.id + "/players/" + playerId + "/cards").once("value").then(cardSnap => {
          const nowCards = cardSnap.val() || [];
          nowCards.push(card);

          db.ref("rooms/" + currentRoom.id + "/players/" + playerId + "/cards")
            .set(nowCards)
            .then(() => {
              index++;
              setTimeout(dealNext, 400);
            });
        });
      });
    }

    dealNext();
  });
}

function checkPokImmediately() {
  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const banker = latestPlayers.find(p => p.role === "banker");

    if (!banker || !banker.cards) return;

    const bankerPoint = getPoint(banker.cards);

    if (bankerPoint >= 8) {
      db.ref("rooms/" + currentRoom.id + "/showAllCards").set(true).then(() => {
        finishGame();
      });
      return;
    }

    const updates = {};
    latestPlayers.forEach(p => {
      if (p.role === "player") {
        const pPoint = getPoint(p.cards || []);
        if (pPoint >= 8) {
          updates["rooms/" + currentRoom.id + "/players/" + p.name + "/actionDone"] = true;
        }
      }
    });

    db.ref().update(updates).then(() => {
      startTurnQueue();
    });
  });
}

function startTurnQueue() {
  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const turnOrder = [];

    latestPlayers
      .filter(p => p.role === "player")
      .forEach(p => {
        if (getPoint(p.cards || []) < 8) turnOrder.push(p.name);
      });

    const banker = latestPlayers.find(p => p.role === "banker");
    if (banker && getPoint(banker.cards || []) < 8) {
      turnOrder.push(banker.name);
    }

    if (turnOrder.length === 0) {
      finishGame();
      return;
    }

    db.ref("rooms/" + currentRoom.id).update({
      turnOrder,
      turnIndex: 0,
      turnDeadline: Date.now() + TURN_SECONDS * 1000
    }).then(startTimer);
  });
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(updateTurnTimer, 1000);
  updateTurnTimer();
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTurnTimer() {
  if (!currentRoom || currentRoom.status !== "playing") return;

  const order = currentRoom.turnOrder || [];
  const turnPlayer = order[currentRoom.turnIndex];

  if (!turnPlayer) return;

  const remain = Math.max(0, Math.ceil((Number(currentRoom.turnDeadline || 0) - Date.now()) / 1000));

  const timerBox = el("turnTimer");
  if (timerBox) timerBox.innerText = remain > 0 ? "เวลา: " + remain : "เวลา: 0";

  const resultBox = el("resultText");
  if (resultBox) resultBox.innerText = "คิว " + turnPlayer + " (" + remain + " วินาที)";

  if (remain <= 0) {
    const banker = getBanker();
    if (banker && String(myPlayerId) === String(banker.name)) {
      autoStand(turnPlayer);
    }
  }
}

function showCard(c) {
  if (!c) return "";
  const suit = c.slice(-1);
  const value = c.slice(0, -1);
  const cls = suit === "♥" || suit === "♦" ? "red-card" : "black-card";
  return `<span class="${cls}">${value}${suit}</span>`;
}

function cardValue(card) {
  if (!card) return 0;
  const v = card.slice(0, -1);
  if (["J", "Q", "K"].includes(v)) return 0;
  if (v === "A") return 1;
  return Number(v) % 10;
}

function getPoint(cardList) {
  if (!cardList) return 0;
  let total = 0;
  Object.values(cardList).forEach(c => {
    total += cardValue(c);
  });
  return total % 10;
}

function renderCards(cardList, open) {
  if (!cardList) return "";
  const arr = Object.values(cardList);

  return `
    <div class="banker-cards">
      ${arr.map(c =>
        open
          ? `<div class="mini-card open-card">${showCard(c)}</div>`
          : `<div class="mini-card back"></div>`
      ).join("")}
    </div>
  `;
}

function getBanker() {
  return players.find(p => p.role === "banker");
}

function renderPlayers() {
  for (let i = 1; i <= 8; i++) {
    const seat = el("player" + i);
    if (seat) seat.innerHTML = "";
  }

  const finished = currentRoom?.status === "finished";
  const showAll = currentRoom?.showAllCards === true;
  const normalPlayers = players.filter(p => p.role === "player");

  normalPlayers.forEach((p, i) => {
    const seat = el("player" + (i + 1));
    if (!seat) return;

    const isMe = String(p.name) === String(myPlayerId);
    const point = getPoint(p.cards || []);
    const open = isMe || point >= 8 || finished || showAll;

    seat.innerHTML = `
      <b>🙂 ผู้เล่น ${p.name}</b><br>
      เงิน: ${p.money || 0}<br>
      แทง: ${p.bet || 0}<br>
      แต้ม: ${p.cards ? point : "-"}<br>
      ${p.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม"}
      ${renderCards(p.cards, open)}
    `;
  });

  const bankerBox = el("banker");
  const banker = getBanker();

  if (bankerBox && banker) {
    const isMe = String(banker.name) === String(myPlayerId);
    const point = getPoint(banker.cards || []);
    const open = isMe || point >= 8 || finished || showAll;

    bankerBox.innerHTML = `
      <b>👑 เจ้ามือ ${banker.name}</b><br>
      เงิน: ${banker.money || 0}<br>
      แต้ม: ${banker.cards ? point : "-"}
      ${renderCards(banker.cards, open)}
    `;
  }
}

function renderBetBox() {
  const box = el("betCard");
  if (!box || !currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (me && me.role === "player" && currentRoom.status === "waiting" && me.ready !== true) {
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}

function checkAllReady() {
  const btn = el("startGameBtn");
  if (!btn || !currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  const ps = players.filter(p => p.role === "player");

  if (currentRoom.status === "waiting" && me && me.role === "banker" && ps.length > 0 && ps.every(p => p.ready === true)) {
    btn.style.display = "block";
    btn.disabled = false;
  } else {
    btn.style.display = "none";
  }
}

function updateActionButtons() {
  ["playerDrawBtn","playerStandBtn","bankerDrawBtn","bankerStandBtn","newRoundBtn"].forEach(id => {
    const b = el(id);
    if (b) b.style.display = "none";
  });

  if (!currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (currentRoom.status === "finished") {
    if (me && me.role === "banker") {
      const newBtn = el("newRoundBtn");
      if (newBtn) newBtn.style.display = "block";
    }
    return;
  }

  if (currentRoom.status !== "playing") return;

  const turnPlayer = (currentRoom.turnOrder || [])[currentRoom.turnIndex];
  if (String(turnPlayer) !== String(myPlayerId)) return;
  if (!me || !me.cards) return;

  const point = getPoint(me.cards);
  const cardCount = Object.values(me.cards).length;

  if (point >= 8 || cardCount >= 3) {
    finishTurn(myPlayerId);
    return;
  }

  if (me.role === "player") {
    if (el("playerDrawBtn")) el("playerDrawBtn").style.display = "block";
    if (el("playerStandBtn")) el("playerStandBtn").style.display = "block";
  }

  if (me.role === "banker") {
    if (el("bankerDrawBtn")) el("bankerDrawBtn").style.display = "block";
    if (el("bankerStandBtn")) el("bankerStandBtn").style.display = "block";
  }
}

function playerReady() {
  const bet = Number(el("betAmount")?.value) || 0;
  if (!currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me) return;

  if (bet <= 0) return alert("กรุณาเลือกเงินแทง");
  if (bet > Number(currentRoom.maxBet)) return alert("แทงเกินสูงสุด");
  if ((Number(me.money) || 0) < bet * 5) return alert("เครดิตไม่พอ");

  db.ref("rooms/" + currentRoom.id + "/players/" + myPlayerId).update({
    bet,
    ready: true,
    actionDone: false
  });
}

function finishTurn(playerId) {
  if (!currentRoom || !currentRoom.turnOrder) return;

  const nextIndex = Number(currentRoom.turnIndex || 0) + 1;

  if (nextIndex >= currentRoom.turnOrder.length) {
    finishGame();
    return;
  }

  db.ref("rooms/" + currentRoom.id).update({
    turnIndex: nextIndex,
    turnDeadline: Date.now() + TURN_SECONDS * 1000
  });
}

function autoStand(playerId) {
  if (!currentRoom || currentRoom.status !== "playing") return;

  db.ref("rooms/" + currentRoom.id + "/players/" + playerId).update({
    actionDone: true
  }).then(() => finishTurn(playerId));
}

function playerDraw() {
  drawForPlayer(myPlayerId);
}

function bankerDraw() {
  const banker = getBanker();
  if (banker) drawForPlayer(banker.name);
}

function drawForPlayer(playerId) {
  if (isDrawing) return;
  if (!currentRoom || currentRoom.status !== "playing") return;

  const turnPlayer = (currentRoom.turnOrder || [])[currentRoom.turnIndex];
  if (String(turnPlayer) !== String(playerId)) return;

  isDrawing = true;

  const p = players.find(x => String(x.name) === String(playerId));
  if (!p || !p.cards) {
    isDrawing = false;
    return;
  }

  const currentCards = Object.values(p.cards);
  if (currentCards.length >= 3) {
    isDrawing = false;
    finishTurn(playerId);
    return;
  }

  db.ref("rooms/" + currentRoom.id + "/deck").transaction(deck => {
    if (!deck || deck.length === 0) return deck;
    const newDeck = [...deck];
    const card = newDeck.shift();
    window.__drawnCard = card;
    return newDeck;
  }, (error, committed) => {
    if (error || !committed || !window.__drawnCard) {
      isDrawing = false;
      alert("จั่วไพ่ไม่สำเร็จ");
      return;
    }

    currentCards.push(window.__drawnCard);
    window.__drawnCard = null;

    db.ref("rooms/" + currentRoom.id + "/players/" + playerId).update({
      cards: currentCards,
      actionDone: true
    }).then(() => {
      isDrawing = false;
      finishTurn(playerId);
    });
  });
}

function playerStand() {
  standForPlayer(myPlayerId);
}

function bankerStand() {
  const banker = getBanker();
  if (banker) standForPlayer(banker.name);
}

function standForPlayer(playerId) {
  if (!currentRoom || currentRoom.status !== "playing") return;

  const turnPlayer = (currentRoom.turnOrder || [])[currentRoom.turnIndex];
  if (String(turnPlayer) !== String(playerId)) return;

  db.ref("rooms/" + currentRoom.id + "/players/" + playerId).update({
    actionDone: true
  }).then(() => finishTurn(playerId));
}

function getMultiplier(cardList) {
  const arr = Object.values(cardList || []);
  if (arr.length < 2) return 1;

  const values = arr.map(c => c.slice(0, -1));
  const suits = arr.map(c => c.slice(-1));

  if (arr.length === 3 && values[0] === values[1] && values[1] === values[2]) return 5;
  if (arr.length === 3 && suits.every(s => s === suits[0])) return 3;
  if (arr.length === 2 && suits[0] === suits[1]) return 2;

  return 1;
}

function finishGame() {
  if (!currentRoom || currentRoom.status === "finished") return;

  stopTimer();

  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const banker = latestPlayers.find(p => p.role === "banker");
    if (!banker) return;

    const bankerPoint = getPoint(banker.cards || []);
    const updates = {};
    let bankerMoney = Number(banker.money) || 0;
    let tongTotal = 0;

    latestPlayers.filter(p => p.role === "player").forEach(p => {
      const bet = Number(p.bet || 0);
      const point = getPoint(p.cards || []);
      const multi = getMultiplier(p.cards || []);

      let win = 0;
      let result = "draw";

      if (point > bankerPoint) {
        win = bet * multi;
        result = "win";
      } else if (point < bankerPoint) {
        win = -bet * multi;
        result = "lose";
      }

      let tong = 0;

      if (win > 0 && multi >= 2) {
        tong = Math.floor(win * 0.05);
        tongTotal += tong;
        win -= tong;
      }

      const playerMoney = Number(p.money || 0) + win;
      bankerMoney -= win;

      updates["rooms/" + currentRoom.id + "/players/" + p.name + "/money"] = playerMoney;
      updates["rooms/" + currentRoom.id + "/players/" + p.name + "/result"] = {
        point,
        bankerPoint,
        multiplier: multi,
        win,
        tong,
        result
      };

      updates["wallet/" + p.name] = playerMoney;
    });

    updates["rooms/" + currentRoom.id + "/players/" + banker.name + "/money"] = bankerMoney;
    updates["wallet/" + banker.name] = bankerMoney;
    updates["rooms/" + currentRoom.id + "/status"] = "finished";
    updates["rooms/" + currentRoom.id + "/showAllCards"] = true;
    updates["rooms/" + currentRoom.id + "/finishedAt"] = Date.now();

    db.ref().update(updates).then(() => {
      if (tongTotal > 0) {
        db.ref("system/tongBalance").transaction(v => (Number(v) || 0) + tongTotal);
      }

      const resultBox = el("resultText");
      if (resultBox) resultBox.innerText = "จบตาแล้ว";
    });
  });
}

function newRound() {
  if (!currentRoom) return;

  stopTimer();
  isDealing = false;
  isDrawing = false;

  const updates = {};
  updates["rooms/" + currentRoom.id + "/status"] = "waiting";
  updates["rooms/" + currentRoom.id + "/deck"] = null;
  updates["rooms/" + currentRoom.id + "/turnOrder"] = [];
  updates["rooms/" + currentRoom.id + "/turnIndex"] = 0;
  updates["rooms/" + currentRoom.id + "/turnDeadline"] = 0;
  updates["rooms/" + currentRoom.id + "/showAllCards"] = false;

  players.forEach(p => {
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/ready"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/bet"] = 0;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/cards"] = null;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/actionDone"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.name + "/result"] = null;
  });

  db.ref().update(updates).then(() => {
    if (el("turnTimer")) el("turnTimer").innerText = "เวลา: -";
    if (el("resultText")) el("resultText").innerText = "ยังไม่มีผล";
    if (el("deckRemainCount")) el("deckRemainCount").innerText = "52";
  });
}

function loadBetOptions(room) {
  const select = el("betAmount");
  if (!select) return;

  select.innerHTML = "";
  const min = Number(room.minBet || 10);
  const max = Number(room.maxBet || 50);
  const options = [10,20,30,50,100,200,300,500,1000,2000,5000];

  options.forEach(v => {
    if (v >= min && v <= max) {
      select.innerHTML += `<option value="${v}">${v}</option>`;
    }
  });

  updateMaxLose();
}

function updateMaxLose() {
  const bet = Number(el("betAmount")?.value) || 0;
  if (el("maxLoseText")) el("maxLoseText").innerText = bet * 5;
}

function showMoneyBox(type) {
  moneyRequestType = type;
  const box = el("moneyRequestBox");
  if (box) box.style.display = "block";
}

function submitMoneyRequest() {
  const amount = Number(el("requestAmount")?.value) || 0;
  const bankInfo = el("bankInfo")?.value || "";
  const playerId = localStorage.getItem("playerId") || myPlayerId;

  if (!amount) return alert("กรอกจำนวนเงิน");

  const path = moneyRequestType === "withdraw" ? "withdrawRequests" : "topupRequests";

  db.ref(path).push({
    playerId,
    amount,
    bankInfo,
    status: "pending",
    createdAt: Date.now()
  }).then(() => {
    alert("ส่งคำขอแล้ว");
    if (el("moneyRequestBox")) el("moneyRequestBox").style.display = "none";
    if (el("requestAmount")) el("requestAmount").value = "";
    if (el("bankInfo")) el("bankInfo").value = "";
  });
}

function topUp() {
  const id = el("playerName")?.value.trim();
  const amount = Number(el("amount")?.value) || 0;
  if (!id || !amount) return alert("กรอกข้อมูลให้ครบ");

  db.ref("wallet/" + id).transaction(v => (Number(v) || 0) + amount).then(() => {
    alert("เติมเงินแล้ว");
  });
}

function withdraw() {
  const id = el("playerName")?.value.trim();
  const amount = Number(el("amount")?.value) || 0;
  if (!id || !amount) return alert("กรอกข้อมูลให้ครบ");

  db.ref("wallet/" + id).transaction(v => Math.max(0, (Number(v) || 0) - amount)).then(() => {
    alert("ถอนเงินแล้ว");
  });
}

function addAdmin() {
  if (myAdminRole !== "owner") return alert("เฉพาะ Owner");
  const id = el("adminTargetId")?.value.trim();
  const role = el("adminRole")?.value || "staff";
  if (!id) return alert("ใส่รหัสผู้เล่น");

  db.ref("admins/" + id).set(role);
}

function removeAdmin() {
  if (myAdminRole !== "owner") return alert("เฉพาะ Owner");
  const id = el("adminTargetId")?.value.trim();
  if (!id) return alert("ใส่รหัสผู้เล่น");

  db.ref("admins/" + id).remove();
}

function loadAdminData() {
  db.ref("admins").on("value", snap => {
    const box = el("adminList");
    if (!box) return;

    const data = snap.val() || {};
    box.innerHTML = Object.keys(data).map(id => `${id} : ${data[id]}`).join("<br>") || "ยังไม่มีแอดมิน";
  });

  db.ref("system/tongBalance").on("value", snap => {
    const box = el("reportBox");
    if (box) box.innerHTML = "ค่าต๋งสะสม: " + (Number(snap.val()) || 0);
  });
}

window.autoLogin = autoLogin;
window.showOldIdBox = showOldIdBox;
window.loginLine = loginLine;
window.logout = logout;
window.showPage = showPage;
window.openAdmin = openAdmin;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.joinOpenRoom = joinOpenRoom;
window.leaveRoom = leaveRoom;
window.copyInviteLink = copyInviteLink;
window.playerReady = playerReady;
window.dealCards = dealCards;
window.playerDraw = playerDraw;
window.playerStand = playerStand;
window.bankerDraw = bankerDraw;
window.bankerStand = bankerStand;
window.newRound = newRound;
window.updateMaxLose = updateMaxLose;
window.showMoneyBox = showMoneyBox;
window.submitMoneyRequest = submitMoneyRequest;
window.topUp = topUp;
window.withdraw = withdraw;
window.addAdmin = addAdmin;
window.removeAdmin = removeAdmin;

window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  const savedId = localStorage.getItem("playerId");

  if (roomId) {
    if (savedId) {
      loginWithId(savedId, roomId);
    } else {
      createNewPlayerId(roomId);
    }
    return;
  }

  if (savedId) {
    loginWithId(savedId, null);
  } else {
    showPage("loginPage");
  }
};
'''
path = "/mnt/data/pokdeng_script_fixed.js"
with open(path, "w", encoding="utf-8") as f:
    f.write(script)
print(path)
