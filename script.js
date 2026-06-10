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
let roomListenerRef = null;
let openRoomsListenerRef = null;
let timerInterval = null;
let isDealing = false;
let isDrawing = false;
let myAdminRole = null;
let moneyRequestType = null;

const OWNER_ID = "0001";
const TURN_SECONDS = 15;
const MAX_PLAYERS = 8;

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

  const page = document.getElementById(pageId);
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
  const box = document.getElementById("oldIdBox");
  if (box) box.style.display = "block";
}

function autoLogin() {
  const savedId = localStorage.getItem("playerId");

  if (savedId) {
    loginWithId(savedId);
    return;
  }

  createNewPlayerId();
}

function createNewPlayerId() {
  db.ref("system/lastPlayerNo").transaction(current => {
    return (Number(current) || 0) + 1;
  }, (error, committed, snap) => {
    if (error || !committed) {
      alert("สร้างรหัสผู้เล่นไม่สำเร็จ");
      return;
    }

    const newId = String(snap.val()).padStart(4, "0");
    loginWithId(newId);
  });
}

function loginLine() {
  const input = document.getElementById("playerId");
  const playerId = input ? input.value.trim() : "";

  if (!playerId) {
    alert("กรุณาใส่รหัสผู้เล่น");
    return;
  }

  loginWithId(playerId);
}

function loginWithId(playerId) {
  myPlayerId = playerId;

  db.ref("wallet/" + playerId).once("value").then(walletSnap => {
    if (!walletSnap.exists()) {
      db.ref("wallet/" + playerId).set(0);
    }

    localStorage.setItem("playerId", playerId);

    db.ref("users/" + playerId).once("value").then(userSnap => {
      if (!userSnap.exists()) {
        db.ref("users/" + playerId).set({
          id: playerId,
          name: "ผู้เล่น " + playerId,
          createdAt: Date.now()
        });
      }

      checkAdminRole(playerId).then(() => {
        showPage("lobbyPage");
      });
    });
  });
}

function checkAdminRole(playerId) {
  return db.ref("admins/" + playerId).once("value").then(snap => {
    if (playerId === OWNER_ID && !snap.exists()) {
      db.ref("admins/" + playerId).set("owner");
      myAdminRole = "owner";
      return;
    }

    myAdminRole = snap.val() || null;
  });
}

function refreshUserInfo() {
  const playerId = localStorage.getItem("playerId") || myPlayerId || "";
  if (!playerId) return;

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;
    const userInfo = document.getElementById("userInfo");

    if (userInfo) {
      userInfo.innerText = "รหัส: " + playerId + " | เครดิต: " + money;
    }
  });
}

function logout() {
  localStorage.removeItem("playerId");
  myPlayerId = null;
  myAdminRole = null;

  if (roomListenerRef) roomListenerRef.off();
  if (openRoomsListenerRef) openRoomsListenerRef.off();

  showPage("loginPage");
}

function openAdmin() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;

  if (!playerId) {
    alert("กรุณาเข้าสู่ระบบก่อน");
    return;
  }

  checkAdminRole(playerId).then(() => {
    if (!myAdminRole) {
      alert("คุณไม่มีสิทธิ์เข้าแอดมิน");
      return;
    }

    showPage("adminPage");
  });
}

function createRoom() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;

  if (!playerId) {
    alert("ไม่พบรหัสผู้เล่น");
    return;
  }

  const roomId = String(Date.now());
  const minBet = Number(document.getElementById("minBet").value) || 10;
  const maxBet = Number(document.getElementById("maxBet").value) || 100;

  if (minBet > maxBet) {
    alert("ขั้นต่ำต้องไม่เกินสูงสุด");
    return;
  }

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;

    if (money < maxBet * 5) {
      alert("เครดิตเจ้ามือต้องพอรองรับอย่างน้อย " + (maxBet * 5));
      return;
    }

    const roomData = {
      id: roomId,
      banker: playerId,
      bankerMoney: money,
      minBet,
      maxBet,
      status: "waiting",
      deck: null,
      turnOrder: null,
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

function joinOpenRoom(roomId) {
  const input = document.getElementById("joinRoomId");
  if (input) input.value = roomId;
  joinRoom();
}

function joinRoom() {
  const input = document.getElementById("joinRoomId");
  const roomId = input ? input.value.trim() : "";
  const playerId = localStorage.getItem("playerId") || myPlayerId;

  if (!roomId) {
    alert("กรุณาใส่เลขห้อง");
    return;
  }

  if (!playerId) {
    alert("กรุณาเข้าสู่ระบบก่อน");
    showPage("loginPage");
    return;
  }

  db.ref("rooms/" + roomId).once("value").then(roomSnap => {
    if (!roomSnap.exists()) {
      alert("ไม่พบห้องนี้");
      return;
    }

    const room = roomSnap.val();

    if (room.status !== "waiting") {
      alert("ห้องนี้เริ่มเล่นแล้ว");
      return;
    }

    const roomPlayers = Object.values(room.players || {});
    const normalPlayers = roomPlayers.filter(p => p.role === "player");

    if (normalPlayers.length >= MAX_PLAYERS) {
      alert("ห้องเต็มแล้ว");
      return;
    }

    loadBetOptions(room);

    db.ref("wallet/" + playerId).once("value").then(moneySnap => {
      const money = Number(moneySnap.val()) || 0;

      db.ref("rooms/" + roomId + "/players/" + playerId).once("value").then(playerSnap => {
        if (!playerSnap.exists()) {
          db.ref("rooms/" + roomId + "/players/" + playerId).set({
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
          db.ref("rooms/" + roomId + "/players/" + playerId).update({
            money
          });
        }

        listenRoom(roomId);
        showPage("roomPage");
      });
    });
  });
}

function listenOpenRooms() {
  const box = document.getElementById("openRoomsList");
  if (!box) return;

  if (openRoomsListenerRef) {
    openRoomsListenerRef.off();
  }

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
            <button class="btn small" onclick="joinOpenRoom('${room.id}')">
              เข้าห้อง
            </button>
          </div>
        `;
      }
    });

    if (!box.innerHTML) {
      box.innerHTML = "ยังไม่มีห้องว่าง";
    }
  });
}

function listenRoom(roomId) {
  if (roomListenerRef) {
    roomListenerRef.off();
  }

  roomListenerRef = db.ref("rooms/" + roomId);

  roomListenerRef.on("value", snap => {
    const room = snap.val();
    if (!room) return;

    currentRoom = {
      ...room,
      id: roomId
    };

    players = Object.values(room.players || {});

    document.getElementById("roomIdText").innerText = roomId;
    document.getElementById("bankerMoneyText").innerText = room.bankerMoney || 0;
    document.getElementById("minBetText").innerText = room.minBet || 10;
    document.getElementById("maxBetText").innerText = room.maxBet || 0;

    renderPlayers();
    renderBetBox();
    checkAllReady();
    updateDeckRemain();
    updateActionButtons();
    updateTurnTimer();
  });
}

function leaveRoom() {
  if (roomListenerRef) roomListenerRef.off();
  currentRoom = null;
  players = [];
  showPage("lobbyPage");
}

function copyInviteLink() {
  if (!currentRoom || !currentRoom.id) {
    alert("ยังไม่มีห้อง");
    return;
  }

  const link = location.origin + location.pathname + "?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
}
// ===========================
// ระบบไพ่ / สำรับกลาง Firebase
// ===========================

function createShuffledDeck() {
  const deck = [...cards];

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function getRoomDeck() {
  return currentRoom?.deck || [];
}

function saveRoomDeck(deck) {
  return db.ref("rooms/" + currentRoom.id + "/deck").set(deck);
}

function drawFromDeck() {
  const deck = [...getRoomDeck()];

  if (deck.length === 0) return null;

  const card = deck.shift();

  saveRoomDeck(deck);

  return card;
}

function updateDeckRemain() {
  const remain = currentRoom?.deck?.length || 0;

  const el = document.getElementById("deckRemainCount");

  if (el) {
    el.innerText = remain;
  }
}

// ===========================
// แจกไพ่
// ===========================

function dealCards() {

  if (isDealing) return;

  if (!currentRoom) return;

  if (currentRoom.status !== "waiting") return;

  isDealing = true;

  const deck = createShuffledDeck();

  const updates = {};

  updates["rooms/" + currentRoom.id + "/status"] = "dealing";
  updates["rooms/" + currentRoom.id + "/deck"] = deck;

  players.forEach(player => {

    updates[
      "rooms/" +
      currentRoom.id +
      "/players/" +
      player.name +
      "/cards"
    ] = [];

    updates[
      "rooms/" +
      currentRoom.id +
      "/players/" +
      player.name +
      "/actionDone"
    ] = false;
  });

  db.ref().update(updates).then(() => {

    const banker =
      players.find(p => p.role === "banker");

    const normalPlayers =
      players.filter(p => p.role === "player");

    const order = [];

    for (let round = 0; round < 2; round++) {

      normalPlayers.forEach(p => {
        order.push(p.name);
      });

      if (banker) {
        order.push(banker.name);
      }
    }

    let index = 0;

    function dealNext() {

      if (index >= order.length) {

        db.ref(
          "rooms/" + currentRoom.id + "/status"
        ).set("playing");

        setTimeout(() => {

          checkPokImmediately();

          isDealing = false;

        }, 500);

        return;
      }

      const playerId = order[index];

      db.ref(
        "rooms/" + currentRoom.id + "/deck"
      ).once("value").then(deckSnap => {

        let deck = deckSnap.val() || [];

        const card = deck.shift();

        const playerRef =
          db.ref(
            "rooms/" +
            currentRoom.id +
            "/players/" +
            playerId +
            "/cards"
          );

        playerRef.once("value").then(cardSnap => {

          const cardsNow =
            cardSnap.val() || [];

          cardsNow.push(card);

          const updates = {};

          updates[
            "rooms/" +
            currentRoom.id +
            "/deck"
          ] = deck;

          updates[
            "rooms/" +
            currentRoom.id +
            "/players/" +
            playerId +
            "/cards"
          ] = cardsNow;

          db.ref().update(updates).then(() => {

            index++;

            setTimeout(
              dealNext,
              400
            );

          });

        });

      });

    }

    dealNext();

  });

}

// ===========================
// ป๊อกอัตโนมัติ
// ===========================

function checkPokImmediately() {

  const banker =
    players.find(
      p => p.role === "banker"
    );

  const bankerCards =
    banker?.cards || [];

  const bankerPoint =
    getPoint(bankerCards);

  if (bankerPoint >= 8) {

    document.getElementById(
      "resultText"
    ).innerText =
      "เจ้ามือป๊อก";

    finishGame();

    return;
  }

  let foundPok = false;

  players.forEach(player => {

    if (player.role !== "player")
      return;

    const point =
      getPoint(player.cards || []);

    if (point >= 8) {

      foundPok = true;

      db.ref(
        "rooms/" +
        currentRoom.id +
        "/players/" +
        player.name
      ).update({
        actionDone: true
      });

    }

  });

  if (foundPok) {

    document.getElementById(
      "resultText"
    ).innerText =
      "มีผู้เล่นป๊อก";

  }

  startTurnQueue();

}

// ===========================
// คิวจั่วทีละคน
// ===========================

function startTurnQueue() {

  const turnOrder = [];

  players.forEach(player => {

    if (
      player.role === "player"
    ) {

      const point =
        getPoint(
          player.cards || []
        );

      if (point < 8) {
        turnOrder.push(
          player.name
        );
      }
    }

  });

  const banker =
    players.find(
      p => p.role === "banker"
    );

  if (banker) {

    const point =
      getPoint(
        banker.cards || []
      );

    if (point < 8) {
      turnOrder.push(
        banker.name
      );
    }
  }

  db.ref(
    "rooms/" +
    currentRoom.id
  ).update({
    turnOrder,
    turnIndex: 0,
    turnDeadline:
      Date.now() +
      TURN_SECONDS * 1000
  });

}

// ===========================
// ตัวจับเวลา
// ===========================

function updateTurnTimer() {

  if (
    !currentRoom ||
    !currentRoom.turnOrder
  ) return;

  const remain =
    Math.max(
      0,
      Math.floor(
        (
          currentRoom.turnDeadline -
          Date.now()
        ) / 1000
      )
    );

  const resultText =
    document.getElementById(
      "resultText"
    );

  const turnPlayer =
    currentRoom.turnOrder[
      currentRoom.turnIndex
    ];

  if (
    resultText &&
    turnPlayer
  ) {

    resultText.innerText =
      "คิว " +
      turnPlayer +
      " (" +
      remain +
      " วินาที)";
  }

  if (
    remain <= 0 &&
    turnPlayer
  ) {

    autoStand(
      turnPlayer
    );

  }

}
// ===========================
// แสดงไพ่ / ผู้เล่น
// ===========================

function showCard(c) {
  const suit = c.slice(-1);
  const value = c.slice(0, -1);
  const cls = suit === "♥" || suit === "♦" ? "red-card" : "black-card";
  return `<span class="${cls}">${value}${suit}</span>`;
}

function cardValue(card) {
  const v = card.slice(0, -1);
  if (["J", "Q", "K"].includes(v)) return 0;
  if (v === "A") return 1;
  return Number(v) % 10;
}

function getPoint(cardList) {
  if (!cardList) return 0;
  let total = 0;
  Object.values(cardList).forEach(c => total += cardValue(c));
  return total % 10;
}

function renderCards(cardList, open) {
  if (!cardList) return "";
  return `
    <div class="banker-cards">
      ${Object.values(cardList).map(c =>
        open
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

  const finished = currentRoom && currentRoom.status === "finished";
  const normalPlayers = players.filter(p => p.role === "player");

  normalPlayers.forEach((p, i) => {
    const seat = document.getElementById("player" + (i + 1));
    if (!seat) return;

    const isMe = String(p.name) === String(myPlayerId);
    const point = getPoint(p.cards || []);

    seat.innerHTML = `
      <b>🙂 ผู้เล่น ${p.name}</b><br>
      เงิน: ${p.money || 0}<br>
      แทง: ${p.bet || 0}<br>
      แต้ม: ${p.cards ? point : "-"}<br>
      ${p.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม"}
      ${renderCards(p.cards, isMe || point >= 8 || finished)}
    `;
  });

  const bankerBox = document.getElementById("banker");
  const banker = players.find(p => p.role === "banker");

  if (bankerBox && banker) {
    const isMe = String(banker.name) === String(myPlayerId);
    const point = getPoint(banker.cards || []);

    bankerBox.innerHTML = `
      <b>👑 เจ้ามือ ${banker.name}</b><br>
      เงิน: ${banker.money || 0}<br>
      แต้ม: ${banker.cards ? point : "-"}
      ${renderCards(banker.cards, isMe || point >= 8 || finished)}
    `;
  }
}

// ===========================
// ปุ่ม / เดิมพัน / คิว
// ===========================

function renderBetBox() {
  const box = document.getElementById("betCard");
  if (!box) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (
    me &&
    me.role === "player" &&
    currentRoom.status === "waiting" &&
    me.ready !== true
  ) {
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}

function checkAllReady() {
  const btn = document.getElementById("startGameBtn");
  if (!btn || !currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  const ps = players.filter(p => p.role === "player");

  if (
    currentRoom.status === "waiting" &&
    me &&
    me.role === "banker" &&
    ps.length > 0 &&
    ps.every(p => p.ready === true)
  ) {
    btn.style.display = "block";
    btn.disabled = false;
  } else {
    btn.style.display = "none";
  }
}

function updateActionButtons() {
  ["playerDrawBtn","playerStandBtn","bankerDrawBtn","bankerStandBtn","newRoundBtn"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

  if (!currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (currentRoom.status === "finished") {
    if (me && me.role === "banker") {
      document.getElementById("newRoundBtn").style.display = "block";
    }
    return;
  }

  if (currentRoom.status !== "playing") return;
  if (!currentRoom.turnOrder) return;

  const turnPlayer = currentRoom.turnOrder[currentRoom.turnIndex];

  if (String(turnPlayer) !== String(myPlayerId)) return;

  if (!me || !me.cards) return;

  const point = getPoint(me.cards);

  if (point >= 8 || Object.values(me.cards).length >= 3) {
    finishTurn(myPlayerId);
    return;
  }

  if (me.role === "player") {
    document.getElementById("playerDrawBtn").style.display = "block";
    document.getElementById("playerStandBtn").style.display = "block";
  }

  if (me.role === "banker") {
    document.getElementById("bankerDrawBtn").style.display = "block";
    document.getElementById("bankerStandBtn").style.display = "block";
  }
}

function playerReady() {
  const bet = Number(document.getElementById("betAmount").value) || 0;
  if (!currentRoom) return;

  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me) return;

  if (bet <= 0) return alert("กรุณาเลือกเงินแทง");
  if (bet > currentRoom.maxBet) return alert("แทงเกินสูงสุด");
  if ((me.money || 0) < bet * 5) return alert("เครดิตไม่พอ");

  db.ref(`rooms/${currentRoom.id}/players/${myPlayerId}`).update({
    bet,
    ready: true,
    actionDone: false
  });
}

function finishTurn(playerId) {
  const nextIndex = (currentRoom.turnIndex || 0) + 1;

  if (!currentRoom.turnOrder || nextIndex >= currentRoom.turnOrder.length) {
    finishGame();
    return;
  }

  db.ref("rooms/" + currentRoom.id).update({
    turnIndex: nextIndex,
    turnDeadline: Date.now() + TURN_SECONDS * 1000
  });
}

function autoStand(playerId) {
  const me = players.find(p => String(p.name) === String(myPlayerId));
  if (!me || me.role !== "banker") return;

  db.ref(`rooms/${currentRoom.id}/players/${playerId}`).update({
    actionDone: true
  }).then(() => finishTurn(playerId));
}

function playerDraw() {
  drawForPlayer(myPlayerId);
}

function bankerDraw() {
  const banker = players.find(p => p.role === "banker");
  if (banker) drawForPlayer(banker.name);
}

function drawForPlayer(playerId) {
  if (isDrawing) return;
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

    db.ref(`rooms/${currentRoom.id}/players/${playerId}`).update({
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
  const banker = players.find(p => p.role === "banker");
  if (banker) standForPlayer(banker.name);
}

function standForPlayer(playerId) {
  db.ref(`rooms/${currentRoom.id}/players/${playerId}`).update({
    actionDone: true
  }).then(() => finishTurn(playerId));
}

// ===========================
// คิดผล / ค่าต๋ง
// ===========================

function getMultiplier(cards) {
  const arr = Object.values(cards || []);
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

  const banker = players.find(p => p.role === "banker");
  if (!banker) return;

  const bankerPoint = getPoint(banker.cards);
  const updates = {};
  let tongTotal = 0;

  players.filter(p => p.role === "player").forEach(p => {
    const bet = Number(p.bet || 0);
    const point = getPoint(p.cards);
    const multi = getMultiplier(p.cards);

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

    updates[`rooms/${currentRoom.id}/players/${p.name}/result`] = {
      point,
      bankerPoint,
      multiplier: multi,
      win,
      tong,
      result
    };

    updates[`wallet/${p.name}`] = (Number(p.money) || 0) + win;
    updates[`wallet/${banker.name}`] =
      (updates[`wallet/${banker.name}`] || Number(banker.money) || 0) - win;
  });

  updates[`rooms/${currentRoom.id}/status`] = "finished";
  updates[`rooms/${currentRoom.id}/finishedAt`] = Date.now();

  if (tongTotal > 0) {
    db.ref("system/tongBalance").transaction(v => (Number(v) || 0) + tongTotal);
  }

  db.ref().update(updates).then(() => {
    document.getElementById("resultText").innerText = "จบตาแล้ว";
  });
}

// ===========================
// เริ่มตาใหม่
// ===========================

function newRound() {
  if (!currentRoom) return;

  isDealing = false;
  isDrawing = false;

  const updates = {};
  updates[`rooms/${currentRoom.id}/status`] = "waiting";
  updates[`rooms/${currentRoom.id}/deck`] = null;
  updates[`rooms/${currentRoom.id}/turnOrder`] = null;
  updates[`rooms/${currentRoom.id}/turnIndex`] = 0;
  updates[`rooms/${currentRoom.id}/turnDeadline`] = 0;

  players.forEach(p => {
    updates[`rooms/${currentRoom.id}/players/${p.name}/ready`] = false;
    updates[`rooms/${currentRoom.id}/players/${p.name}/bet`] = 0;
    updates[`rooms/${currentRoom.id}/players/${p.name}/cards`] = null;
    updates[`rooms/${currentRoom.id}/players/${p.name}/actionDone`] = false;
    updates[`rooms/${currentRoom.id}/players/${p.name}/result`] = null;
  });

  db.ref().update(updates);
}

// ===========================
// ฝากถอน / แอดมิน / รายงาน
// ===========================

function showMoneyBox(type) {
  moneyRequestType = type;
  document.getElementById("moneyRequestBox").style.display = "block";
}

function submitMoneyRequest() {
  const amount = Number(document.getElementById("requestAmount").value) || 0;
  const bankInfo = document.getElementById("bankInfo").value || "";
  const playerId = localStorage.getItem("playerId");

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
    document.getElementById("moneyRequestBox").style.display = "none";
  });
}

function topUp() {
  const id = document.getElementById("playerName").value.trim();
  const amount = Number(document.getElementById("amount").value) || 0;
  if (!id || !amount) return;

  db.ref("wallet/" + id).transaction(v => (Number(v) || 0) + amount);
}

function withdraw() {
  const id = document.getElementById("playerName").value.trim();
  const amount = Number(document.getElementById("amount").value) || 0;
  if (!id || !amount) return;

  db.ref("wallet/" + id).transaction(v => Math.max(0, (Number(v) || 0) - amount));
}

function addAdmin() {
  if (myAdminRole !== "owner") return alert("เฉพาะ Owner");
  const id = document.getElementById("adminTargetId").value.trim();
  const role = document.getElementById("adminRole").value;
  if (!id) return;

  db.ref("admins/" + id).set(role);
}

function removeAdmin() {
  if (myAdminRole !== "owner") return alert("เฉพาะ Owner");
  const id = document.getElementById("adminTargetId").value.trim();
  if (!id) return;

  db.ref("admins/" + id).remove();
}

function loadAdminData() {
  db.ref("admins").on("value", snap => {
    const box = document.getElementById("adminList");
    if (!box) return;

    const data = snap.val() || {};
    box.innerHTML = Object.keys(data).map(id => `${id} : ${data[id]}`).join("<br>");
  });

  db.ref("system/tongBalance").on("value", snap => {
    const box = document.getElementById("reportBox");
    if (box) box.innerHTML = "ค่าต๋งสะสม: " + (Number(snap.val()) || 0);
  });
}

function loadBetOptions(room) {
  const select = document.getElementById("betAmount");
  if (!select) return;

  select.innerHTML = "";
  const options = [10,20,30,50,100,200,300,500,1000,2000,5000];

  options.forEach(v => {
    if (v >= room.minBet && v <= room.maxBet) {
      select.innerHTML += `<option value="${v}">${v}</option>`;
    }
  });

  updateMaxLose();
}

function updateMaxLose() {
  const bet = Number(document.getElementById("betAmount").value) || 0;
  document.getElementById("maxLoseText").innerText = bet * 5;
}

// ===========================
// เปิดใช้งาน
// ===========================

window.autoLogin = autoLogin;
window.showOldIdBox = showOldIdBox;
window.loginLine = loginLine;
window.logout = logout;
window.showPage = showPage;
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
window.showMoneyBox = showMoneyBox;
window.submitMoneyRequest = submitMoneyRequest;
window.openAdmin = openAdmin;
window.topUp = topUp;
window.withdraw = withdraw;
window.addAdmin = addAdmin;
window.removeAdmin = removeAdmin;
window.updateMaxLose = updateMaxLose;

window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");

  const savedId = localStorage.getItem("playerId");

  if (roomId && savedId) {
    myPlayerId = savedId;
    loginWithId(savedId);
    setTimeout(() => {
      document.getElementById("joinRoomId").value = roomId;
      joinRoom();
    }, 500);
    return;
  }

  if (savedId) {
    loginWithId(savedId);
  } else {
    showPage("loginPage");
  }
};
