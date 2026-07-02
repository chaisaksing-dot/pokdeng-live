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

const OWNER_ID = "U375ecfc0b60af85d8e5ed97e512cc76d";
const MAX_PLAYERS = 8;
const TURN_SECONDS = 60;

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
  showPage("loginPage");
}

function loginLineOld() {

  const playerId = el("playerId")?.value.trim();
  const pin = el("playerPin")?.value.trim();

  if (!playerId) return alert("กรุณาใส่รหัสผู้เล่น");
  if (!pin) return alert("กรุณาใส่ PIN");

  db.ref("users/" + playerId).once("value").then(snap => {
    if (!snap.exists()) return alert("ไม่พบรหัสนี้");

    const user = snap.val();

    // ผู้เล่นเก่ายังไม่มี PIN ให้ตั้งครั้งแรก
    if (!user.pin) {
      db.ref("users/" + playerId + "/pin").set(pin).then(() => {
        alert("ตั้ง PIN สำเร็จแล้ว");
        loginWithId(playerId, null);
      });
      return;
    }

    // ถ้ามี PIN แล้ว ต้องตรงเท่านั้น
    if (String(user.pin) !== String(pin)) {
      return alert("PIN ไม่ถูกต้อง");
    }

    loginWithId(playerId, null);
  });
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
    if (!snap.exists()) walletRef.set(10000);

    db.ref("users/" + myPlayerId).once("value").then(userSnap => {
      if (!userSnap.exists()) {
        db.ref("users/" + myPlayerId).set({
          id: myPlayerId,
          name: "ผู้เล่น " + myPlayerId,
          pin: "1234",
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
    if (String(playerId) === OWNER_ID && !snap.exists()) {
      db.ref("admins/" + playerId).set("owner");
      myAdminRole = "owner";
    } else {
      myAdminRole = snap.val() || null;
    }

    const adminBtn = el("adminBtn");
    if (adminBtn) {
      adminBtn.style.display = myAdminRole ? "inline-block" : "none";
    }

    return myAdminRole;
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
  id: playerId,
  name: localStorage.getItem("lineName") || localStorage.getItem("playerName") || playerId,
  displayName: localStorage.getItem("lineName") || localStorage.getItem("playerName") || playerId,
  photo: localStorage.getItem("linePicture") || localStorage.getItem("playerPic") || "",
  pictureUrl: localStorage.getItem("linePicture") || localStorage.getItem("playerPic") || "",
  money,
  bet: 0,
  ready: false,
  role: "banker",
  cards: null,
  actionDone: false
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

  const playerId =
    localStorage.getItem("playerId") ||
    localStorage.getItem("lineId") ||
    myPlayerId;

  const playerName =
    localStorage.getItem("lineName") ||
    localStorage.getItem("playerName") ||
    playerId;

  const pictureUrl =
    localStorage.getItem("linePicture") ||
    localStorage.getItem("playerPic") ||
    "";

  if (!roomId) return alert("กรุณาใส่เลขห้อง");
  if (!playerId) return alert("กรุณาเข้าสู่ระบบ LINE ก่อน");

  db.ref("rooms/" + roomId).once("value").then(roomSnap => {
    if (!roomSnap.exists()) {
      alert("ไม่พบห้องนี้");
      return;
    }

    const room = roomSnap.val();
    const roomStatus = room.status || "waiting";

    db.ref("wallet/" + playerId).once("value").then(walletSnap => {
      const walletMoney = Number(walletSnap.val() || 0);

      const playerData = {
        id: playerId,
        name: playerName,
        displayName: playerName,
        pictureUrl: pictureUrl,
        photo: pictureUrl,
        role: "player",
        money: walletMoney,
        bet: 0,
        ready: false,
        online: true,
        joinedAt: Date.now()
      };

      if (roomStatus !== "waiting") {
        playerData.waitingNextRound = true;
        playerData.ready = false;
        playerData.bet = 0;
      }

      db.ref("rooms/" + roomId + "/players/" + playerId)
        .update(playerData)
        .then(() => {
          myPlayerId = playerId;
          currentRoom = room;
          currentRoom.id = roomId;

          localStorage.setItem("playerId", playerId);
          localStorage.setItem("currentRoomId", roomId);

          listenRoom(roomId);
          showPage("roomPage");

          if (roomStatus !== "waiting") {
            alert("โต๊ะกำลังเล่นอยู่ คุณจะเข้ารอบถัดไป");
          }
        });
    });
  });
}
function listenRoom(roomId) {
  if (roomListenerRef) roomListenerRef.off();
  roomListenerRef = db.ref("rooms/" + roomId);

  roomListenerRef.on("value", snap => {
    const room = snap.val();

    if (!room) {
      stopTimer();
      currentRoom = null;
      players = [];
      showPage("lobbyPage");
      return;
    }

    currentRoom = { ...room, id: roomId };
    players = Object.values(room.players || {});

    if (players.length === 0) {
      db.ref("rooms/" + roomId).remove();
      return;
    }

    const playerId = localStorage.getItem("playerId") || myPlayerId;
    const stillInRoom = players.some(p => String(p.id || p.name) === String(playerId));

    if (!stillInRoom) {
      stopTimer();
      currentRoom = null;
      players = [];
      alert("คุณถูกนำออกจากห้อง");
      showPage("lobbyPage");
      return;
    }

    if (el("roomIdText")) el("roomIdText").innerText = roomId;
    if (el("bankerMoneyText")) el("bankerMoneyText").innerText = getBanker()?.money || room.bankerMoney || 0;
    if (el("minBetText")) el("minBetText").innerText = room.minBet || 10;
    if (el("maxBetText")) el("maxBetText").innerText = room.maxBet || 0;

    renderPlayers();
    renderBetBox();
    checkAllReady();
    updateDeckRemain();
    updateActionButtons();

    if (
      currentRoom.status === "playing" &&
      currentRoom.turnDeadline > 0 &&
      !timerInterval
    ) {
      startTimer();
    }

    updateTurnTimer();
    showRoundResult();
  });
}

function leaveRoom() {
  if (!currentRoom || !currentRoom.id) {
    showPage("lobbyPage");
    return;
  }

  const roomId = currentRoom.id;
  const playerId = myPlayerId || localStorage.getItem("playerId");

  stopTimer();

  db.ref("rooms/" + roomId + "/players/" + playerId)
    .remove()
    .then(() => {
      db.ref("rooms/" + roomId + "/players")
        .once("value")
        .then(snap => {
          if (!snap.exists() || Object.keys(snap.val() || {}).length === 0) {
            db.ref("rooms/" + roomId).remove();
          }
        });
    });

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
  if (!normalPlayers.every(p => p.ready === true)) {
    return alert("ผู้เล่นต้องกดพร้อมทุกคนก่อน");
  }

  // ✅ เช็กเงินเจ้ามือก่อนแจกไพ่
  const totalBet = normalPlayers.reduce((sum, p) => {
    return sum + Number(p.bet || 0);
  }, 0);

  const requiredBankerMoney = totalBet * 5;

  if (Number(banker.money || 0) < requiredBankerMoney) {
    return alert(
      "เงินเจ้ามือไม่พอ\n" +
      "ยอดเดิมพันรวม: " + totalBet + "\n" +
      "เจ้ามือต้องมีอย่างน้อย: " + requiredBankerMoney
    );
  }

  isDealing = true;

  const deck = createShuffledDeck();
  const updates = {};

  updates["rooms/" + currentRoom.id + "/status"] = "dealing";
  updates["rooms/" + currentRoom.id + "/deck"] = deck;
  updates["rooms/" + currentRoom.id + "/turnOrder"] = [];
  updates["rooms/" + currentRoom.id + "/turnIndex"] = 0;
  updates["rooms/" + currentRoom.id + "/turnDeadline"] = 0;

  players.forEach(p => {
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/cards"] = [];
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/actionDone"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/result"] = null;
  });

  const startBtn = el("startGameBtn");
  if (startBtn) startBtn.style.display = "none";

  db.ref().update(updates).then(() => {
    const order = [];

    for (let r = 0; r < 2; r++) {
      normalPlayers.forEach(p => order.push(p.id));
      order.push(banker.id);
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

        db.ref("rooms/" + currentRoom.id + "/players/" + playerId + "/cards")
          .once("value")
          .then(cardSnap => {
            const nowCards = cardSnap.val() || [];
            nowCards.push(card);

            return db.ref("rooms/" + currentRoom.id + "/players/" + playerId + "/cards")
              .set(nowCards);
          })
          .then(() => {
            index++;
            setTimeout(dealNext, 400);
          })
          .catch(err => {
            console.error(err);
            isDealing = false;
            alert("บันทึกไพ่ผิดพลาด");
          });
      });
    }

    dealNext();
  }).catch(err => {
    console.error(err);
    isDealing = false;
    alert("เริ่มแจกไพ่ไม่สำเร็จ");
  });
}
function checkPokImmediately() {
  if (!currentRoom) return;

  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const banker = latestPlayers.find(p => p.role === "banker");

    if (!banker) {
      startTurnQueue();
      return;
    }

    const bankerInfo = getHandInfo(banker.cards || []);
    const bankerPok = bankerInfo.point === 8 || bankerInfo.point === 9;

    const pokPlayers = latestPlayers.filter(p => {
      if (p.role !== "player") return false;
      const info = getHandInfo(p.cards || []);
      return info.point === 8 || info.point === 9;
    });

    const updates = {};

    pokPlayers.forEach(p => {
      updates["rooms/" + currentRoom.id + "/players/" + p.id + "/openCards"] = true;
      updates["rooms/" + currentRoom.id + "/players/" + p.id + "/pokLocked"] = true;
      updates["rooms/" + currentRoom.id + "/players/" + p.id + "/actionDone"] = true;
    });

    if (bankerPok) {
      updates["rooms/" + currentRoom.id + "/players/" + banker.id + "/openCards"] = true;
      updates["rooms/" + currentRoom.id + "/players/" + banker.id + "/pokLocked"] = true;
      updates["rooms/" + currentRoom.id + "/players/" + banker.id + "/actionDone"] = true;
      updates["rooms/" + currentRoom.id + "/showAllCards"] = true;
    }

    db.ref().update(updates).then(() => {
      if (bankerPok) {
        setTimeout(finishGame, 800);
        return;
      }

      if (pokPlayers.length > 0) {
        settlePokPlayers(pokPlayers, banker).then(() => {
          startTurnQueue();
        });
        return;
      }

      startTurnQueue();
    });
  });
}
function settlePokPlayers(pokPlayers, banker) {
  const bankerInfo = getHandInfo(banker.cards || []);
  let bankerMoney = Number(banker.money || 0);
  let tongTotal = 0;

  const updates = {};

  pokPlayers.forEach(p => {
    const bet = Number(p.bet || 0);
    const playerInfo = getHandInfo(p.cards || []);
    const result = compareHands(playerInfo, bankerInfo);

    let gross = 0;
    let tong = 0;
    let playerNet = 0;

    if (result === "win") {
      gross = bet * playerInfo.multiplier;
      if (playerInfo.multiplier >= 2) {
        tong = Math.floor(gross * 0.05);
      }

      playerNet = gross - tong;
      bankerMoney -= gross;
      tongTotal += tong;
    }

    if (result === "lose") {
      gross = bet * bankerInfo.multiplier;

      let bankerTong = 0;
      if (bankerInfo.multiplier >= 2) {
        bankerTong = Math.floor(gross * 0.05);
      }

      playerNet = -gross;
      bankerMoney += gross - bankerTong;
      tongTotal += bankerTong;
    }

    const playerMoney = Number(p.money || 0) + playerNet;

    updates[`rooms/${currentRoom.id}/players/${p.id}/money`] = playerMoney;
    updates[`wallet/${p.id}`] = playerMoney;

    updates[`rooms/${currentRoom.id}/players/${p.id}/settled`] = true;
    updates[`rooms/${currentRoom.id}/players/${p.id}/pokLocked`] = true;
    updates[`rooms/${currentRoom.id}/players/${p.id}/openCards`] = true;
    updates[`rooms/${currentRoom.id}/players/${p.id}/actionDone`] = true;

    updates[`rooms/${currentRoom.id}/players/${p.id}/result`] = {
      result,
      bet,
      gross,
      tong,
      net: playerNet,
      bankerNet: -playerNet,
      moneyAfter: playerMoney,
      handLabel: playerInfo.label,
      handPoint: playerInfo.point,
      multiplier: playerInfo.multiplier,
      bankerHandLabel: bankerInfo.label,
      bankerPoint: bankerInfo.point,
      bankerMultiplier: bankerInfo.multiplier,
      earlyPok: true
    };
  });

  updates[`rooms/${currentRoom.id}/players/${banker.id}/money`] = bankerMoney;
  updates[`wallet/${banker.id}`] = bankerMoney;

  return db.ref().update(updates).then(() => {
    if (tongTotal > 0) {
      return db.ref("system/tongBalance")
        .transaction(v => (Number(v) || 0) + tongTotal);
    }
  });
}

function startTurnQueue() {
  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const turnOrder = [];

    latestPlayers
      .filter(p => p.role === "player" && p.settled !== true)
      .forEach(p => {
        if (getPoint(p.cards || []) < 8) {
          turnOrder.push(p.id);
        }
      });

    const banker = latestPlayers.find(p => p.role === "banker");

    if (banker && getPoint(banker.cards || []) < 8) {
      turnOrder.push(banker.id);
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
  const turnInfo = players.find(p => String(p.id || p.id) === String(turnPlayer));
  const turnName = turnInfo ? (turnInfo.displayName || turnInfo.name) : turnPlayer;

  if (resultBox) resultBox.innerText = "คิว " + shortName(turnName) + " (" + remain + " วินาที)";

  if (remain <= 0) {
    const banker = getBanker();
    if (banker && String(myPlayerId) === String(banker.id)) {
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

function shortName(name) {
  if (!name) return "";
  return String(name).length > 12 ? String(name).substring(0, 12) + "..." : String(name);
}

function renderPlayers() {
  for (let i = 1; i <= 8; i++) {
    const seat = el("player" + i);
    if (seat) seat.innerHTML = "";
  }

  const finished = currentRoom?.status === "finished";
  const showAll = currentRoom?.showAllCards === true;
  const normalPlayers = players.filter(p => p.role === "player" || p.role === "waiting");

  normalPlayers.forEach((p, i) => {
    const seat = el("player" + (i + 1));
    if (!seat) return;

    const isMe = String(p.id || p.name) === String(myPlayerId);
    const point = getPoint(p.cards || []);
    const open = isMe || finished || showAll || p.openCards === true || p.pokLocked === true;
    const canKick =
      String(getBanker()?.id || getBanker()?.name) === String(myPlayerId) &&
      currentRoom?.status === "waiting";

    const photoUrl = p.photo || "https://via.placeholder.com/50";

    const resultLine = p.result
      ? `<div class="player-money">${
          p.result.result === "win" ? "🏆" :
          p.result.result === "lose" ? "❌" :
          "🤝"
        } ${moneyText(p.result.net)}</div>`
      : "";

    seat.innerHTML = `
      <div class="player-box-ui">
        <img src="${photoUrl}" class="player-photo">
        <div class="player-info-text">
          <div class="player-name">${shortName(p.displayName || p.name)}</div>
          <div class="player-money">เงิน: ${p.money || 0}</div>
          <div class="player-money">เดิมพัน: ${p.bet || 0}</div>
          ${resultLine}
          <div class="player-money">แต้ม: ${open ? point : "-"}</div>
        </div>
      </div>
      <div style="font-size: 10px; margin-top: 2px;">
        ${p.role === "waiting" ? "🪑 รอรอบหน้า" : (p.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม")}
      </div>
      ${canKick ? `<button onclick="kickPlayer('${p.id || p.name}')" style="font-size:9px; background:#e53935; color:white; border:none; border-radius:4px; margin-top:2px;">❌ เตะ</button> ` : ""}
      ${renderCards(p.cards, open)}
    `;
  });

  const bankerBox = el("banker");
  const banker = getBanker();
if (bankerBox && banker) {
  const isMe = String(banker.id || banker.name) === String(myPlayerId);
  const point = getPoint(banker.cards || []);
  const open = isMe || finished || showAll;
  const photoUrl = banker.photo || "https://via.placeholder.com/50";

  bankerBox.innerHTML = `
    <div class="player-box-ui">
      <img src="${photoUrl}" class="player-photo">
      <div class="player-info-text">
        <div class="player-name">👑 ${shortName(banker.displayName || banker.name)}</div>
        <div class="player-money">เงิน: ${banker.money || 0}</div>
        <div class="player-money">แต้ม: ${open ? point : "-"}</div>
      </div>
    </div>
    ${renderCards(banker.cards, open)}
  `;
}
}

function renderBetBox() {
  const box = el("betCard");
  if (!box || !currentRoom) return;

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));

  if (
    me &&
    me.role === "player" &&
    currentRoom.status === "waiting" &&
    me.ready !== true &&
    me.waitingNextRound !== true
  ) {
    box.style.display = "block";

    const moneyText = el("myMoneyText");
    if (moneyText) {
      moneyText.innerHTML = "เงินของฉัน: " + Number(me.money || 0);
    }
  } else {
    box.style.display = "none";
  }
}
 
function checkAllReady() {
  const btn = el("startGameBtn");
  if (!btn || !currentRoom) return;

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
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

  const me = players.find(p => String(p.id) === String(myPlayerId));

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

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
  if (!me) return;

  if (bet <= 0) return alert("กรุณาเลือกเงินแทง");
  if (bet > Number(currentRoom.maxBet)) return alert("แทงเกินสูงสุด");

  const myMoney = Number(me.money || 0);
  const maxLose = bet * 5;

  if (myMoney < maxLose) {
    return alert("เครดิตไม่พอ ต้องมีอย่างน้อย " + maxLose + " บาท");
  }

  const banker = getBanker();
  if (!banker) return alert("ไม่พบเจ้ามือ");

  const currentTotalBet = players
    .filter(p =>
      p.role === "player" &&
      String(p.id || p.name) !== String(myPlayerId)
    )
    .reduce((sum, p) => sum + Number(p.bet || 0), 0);

  const newTotalBet = currentTotalBet + bet;
  const bankerNeed = newTotalBet * 5;
  const bankerMoney = Number(banker.money || 0);

  if (bankerMoney < bankerNeed) {
    return alert(
      "เงินเจ้ามือไม่พอ รับเดิมพันรวมได้ไม่เกิน " +
      Math.floor(bankerMoney / 5) +
      " บาท"
    );
  }

  db.ref("rooms/" + currentRoom.id + "/players/" + (me.id || me.name)).update({
    bet,
    ready: true,
    actionDone: false
  });
}
function finishTurn(playerId) {
  if (!currentRoom || !currentRoom.turnOrder) return;

  const nextIndex = Number(currentRoom.turnIndex || 0) + 1;

  if (nextIndex < currentRoom.turnOrder.length) {
    db.ref("rooms/" + currentRoom.id).update({
      turnIndex: nextIndex,
      turnDeadline: Date.now() + TURN_SECONDS * 1000
    });
    return;
  }

  const banker = getBanker();

  if (
    banker &&
    banker.cards &&
    getPoint(banker.cards) < 8 &&
    Object.values(banker.cards).length < 3 &&
    String(playerId) !== String(banker.name)
  ) {
    db.ref("rooms/" + currentRoom.id).update({
      turnOrder: [...currentRoom.turnOrder, banker.name],
      turnIndex: nextIndex,
      turnDeadline: Date.now() + TURN_SECONDS * 1000
    });
    return;
  }

  finishGame();
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
  if (banker) drawForPlayer(banker.id);
}

function drawForPlayer(playerId) {
  if (isDrawing) return;
  if (!currentRoom || currentRoom.status !== "playing") return;

  const turnPlayer = (currentRoom.turnOrder || [])[currentRoom.turnIndex];
  if (String(turnPlayer) !== String(playerId)) return;

  isDrawing = true;

  const p = players.find(x => String(x.id || x.name) === String(playerId));
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
  if (!currentRoom) return;

  const banker = getBanker();
  if (!banker) return;

  db.ref("rooms/" + currentRoom.id).update({
    showAllCards: true,
    status: "finished",
    turnDeadline: 0
  }).then(() => {
    finishGame();
  });
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

function getCardRank(card) {
  const v = card.slice(0, -1);
  if (v === "A") return 1;
  if (v === "J") return 11;
  if (v === "Q") return 12;
  if (v === "K") return 13;
  return Number(v);
}

function isStraightFlush(arr) {
  if (arr.length !== 3) return false;

  const suits = arr.map(c => c.slice(-1));
  const sameSuit = suits.every(s => s === suits[0]);
  if (!sameSuit) return false;

  const ranks = arr.map(getCardRank).sort((a, b) => a - b).join(",");

  return [
    "1,2,3",
    "2,3,4",
    "3,4,5",
    "4,5,6",
    "5,6,7",
    "6,7,8",
    "7,8,9",
    "8,9,10",
    "9,10,11",
    "10,11,12",
    "11,12,13",
    "1,12,13"
  ].includes(ranks);
}

function getHandInfo(cardList) {
  const arr = Object.values(cardList || []);
  const point = getPoint(arr);

  if (arr.length === 0) {
    return {
      type: "normal",
      label: "ปกติ",
      point,
      multiplier: 1,
      autoRank: 0
    };
  }

  const values = arr.map(c => c.slice(0, -1));
  const suits = arr.map(c => c.slice(-1));

  const isThreeSame =
    arr.length === 3 &&
    values[0] === values[1] &&
    values[1] === values[2];

  const pictureCards = ["J", "Q", "K"];

const isJQK =
  arr.length === 3 &&
  values.every(v => pictureCards.includes(v));

  const straightFlush = isStraightFlush(arr);

  const isFlush =
    arr.length === 3 &&
    suits.every(s => s === suits[0]) &&
    !straightFlush;

  const isPair =
  arr.length === 2 &&
  (
    values[0] === values[1] ||
    suits[0] === suits[1]
  );

  if (isThreeSame) {
    return { type: "tong", label: "ตอง", point, multiplier: 5, autoRank: 3 };
  }

  if (straightFlush) {
    return { type: "straightFlush", label: "เรียงฟลัด", point, multiplier: 4, autoRank: 2 };
  }

  if (isJQK) {
    return { type: "letters", label: "3 ใบอักษร", point, multiplier: 3, autoRank: 1 };
  }

  if (isFlush) {
    return { type: "flush", label: "ฟลัด", point, multiplier: 3, autoRank: 0 };
  }

  if (isPair) {
    return { type: "pair", label: "2 เด้ง", point, multiplier: 2, autoRank: 0 };
  }

  return { type: "normal", label: "ปกติ", point, multiplier: 1, autoRank: 0 };
}

function getMultiplier(cardList) {
  return getHandInfo(cardList).multiplier;
}

function compareHands(playerInfo, bankerInfo) {
  if (playerInfo.autoRank > 0 || bankerInfo.autoRank > 0) {
    if (playerInfo.autoRank > 0 && bankerInfo.autoRank > 0) {
      if (playerInfo.type === bankerInfo.type) return "draw";
      return playerInfo.autoRank > bankerInfo.autoRank ? "win" : "lose";
    }

    return playerInfo.autoRank > bankerInfo.autoRank ? "win" : "lose";
  }

  if (playerInfo.point > bankerInfo.point) return "win";
  if (playerInfo.point < bankerInfo.point) return "lose";
  return "draw";
}

function moneyText(n) {
  const num = Number(n || 0);
  return num > 0 ? "+" + num : String(num);
}

function finishGame() {
  if (!currentRoom || currentRoom.status === "finished") return;

  stopTimer();

  db.ref("rooms/" + currentRoom.id + "/players").once("value").then(snap => {
    const latestPlayers = Object.values(snap.val() || {});
    const banker = latestPlayers.find(p => p.role === "banker");
    if (!banker) return;

    const bankerInfo = getHandInfo(banker.cards || []);
    const updates = {};

    let bankerMoney = Number(banker.money || 0);
    let bankerNet = 0;
    let tongTotal = 0;

    latestPlayers
  .filter(p => p.role === "player")
  .forEach(p => {
    if (p.settled === true) {
  const oldResult = p.result || {};
  bankerNet += Number(oldResult.bankerNet || 0);
  tongTotal += Number(oldResult.tong || 0);
  return;
}
      const bet = Number(p.bet || 0);
      const playerInfo = getHandInfo(p.cards || []);
      const result = compareHands(playerInfo, bankerInfo);

      let gross = 0;
      let tong = 0;
      let playerNet = 0;

      if (result === "win") {
        gross = bet * playerInfo.multiplier;

        if (playerInfo.multiplier >= 2) {
          tong = Math.floor(gross * 0.05);
        }

        playerNet = gross - tong;
        bankerMoney -= gross;
        bankerNet -= gross;
        tongTotal += tong;
      }

      if (result === "lose") {
        gross = bet * bankerInfo.multiplier;

        let bankerTong = 0;
        if (bankerInfo.multiplier >= 2) {
          bankerTong = Math.floor(gross * 0.05);
        }

        playerNet = -gross;
        bankerMoney += gross - bankerTong;
        bankerNet += gross - bankerTong;
        tongTotal += bankerTong;
        tong = 0;
      }

      if (result === "draw") {
        gross = 0;
        tong = 0;
        playerNet = 0;
      }

      const playerMoney = Number(p.money || 0) + playerNet;

      updates["rooms/" + currentRoom.id + "/players/" + p.id + "/money"] = playerMoney;
      updates["wallet/" + p.id] = playerMoney;

      updates["rooms/" + currentRoom.id + "/players/" + p.id + "/result"] = {
        result,
        bet,
        gross,
        tong,
        net: playerNet,
        moneyAfter: playerMoney,
        handLabel: playerInfo.label,
        handPoint: playerInfo.point,
        multiplier: playerInfo.multiplier,
        bankerHandLabel: bankerInfo.label,
        bankerPoint: bankerInfo.point,
        bankerMultiplier: bankerInfo.multiplier
      };
    });

    updates["rooms/" + currentRoom.id + "/players/" + banker.id + "/money"] = bankerMoney;
    updates["wallet/" + banker.id] = bankerMoney;
    updates["rooms/" + currentRoom.id + "/players/" + banker.id + "/result"] = {
      result: bankerNet > 0 ? "win" : bankerNet < 0 ? "lose" : "draw",
      net: bankerNet,
      tongTotal,
      moneyAfter: bankerMoney,
      handLabel: bankerInfo.label,
      handPoint: bankerInfo.point,
      multiplier: bankerInfo.multiplier
    };

    updates["rooms/" + currentRoom.id + "/roundSummary"] = {
      banker: banker.id,
      bankerNet,
      tongTotal,
      finishedAt: Date.now()
    };

    updates["rooms/" + currentRoom.id + "/status"] = "finished";
    updates["rooms/" + currentRoom.id + "/showAllCards"] = true;
    updates["rooms/" + currentRoom.id + "/finishedAt"] = Date.now();

    db.ref().update(updates).then(() => {
      if (tongTotal > 0) {
        db.ref("system/tongBalance").transaction(v => (Number(v) || 0) + tongTotal);
      }

      showRoundResult();
    });
  });
}
function showRoundResult() {
  if (!currentRoom || currentRoom.status !== "finished") return;

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
  const resultBox = el("resultText");
  if (!resultBox || !me || !me.result) return;

  const totalBet = players
    .filter(p => p.role === "player")
    .reduce((sum, p) => sum + (Number(p.result?.bet || p.bet || 0)), 0);

 const banker = getBanker();
 const bankerResult = banker?.result || {};
 const summary = currentRoom.roundSummary || {};
 const bankerNet = Number(summary.bankerNet ?? bankerResult.net ?? 0);
   resultBox.innerHTML = `
    📊 สรุปรอบนี้<br><br>
    💰 ยอดเดิมพันรวม: ${totalBet}<br>
    เจ้ามือสุทธิ: ${moneyText(bankerNet)}
    🧾 ค่าต๋งรวม: ${bankerResult.tongTotal || currentRoom.roundSummary?.tongTotal || 0}
  `;
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
    if (p.role === "waiting") {
  updates["rooms/" + currentRoom.id + "/players/" + p.id + "/role"] = "player";
}
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/ready"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/bet"] = 0;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/cards"] = null;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/actionDone"] = false;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/result"] = null;
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/settled"] = false;
updates["rooms/" + currentRoom.id + "/players/" + p.id + "/pokLocked"] = false;
  });

  db.ref().update(updates).then(() => {
    if (el("turnTimer")) el("turnTimer").innerText = "เวลา: -";
    if (el("resultText")) el("resultText").innerText = "ยังไม่มีผล";
    if (el("deckRemainCount")) el("deckRemainCount").innerText = "52";
  });
}

function loadBetOptions(room) {
  const min = Number(room.minBet || 10);
  const max = Number(room.maxBet || 50);
  const buttons = document.querySelectorAll("#betButtons button");

  buttons.forEach(btn => {
    const value = Number(btn.innerText);
    if (value >= min && value <= max) {
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }

    btn.classList.remove("active-bet");
  });

  const betInput = el("betAmount");
  if (betInput) betInput.value = 0;

  updateMaxLose();
}

function setBet(amount) {
  const betInput = el("betAmount");
  if (betInput) betInput.value = amount;

  document.querySelectorAll("#betButtons button").forEach(btn => {
    btn.classList.remove("active-bet");
    if (Number(btn.innerText) === Number(amount)) {
      btn.classList.add("active-bet");
    }
  });

  updateMaxLose();
}

window.setBet = setBet;

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
function kickPlayer(playerId) {
  const me = players.find(p => String(p.name) === String(myPlayerId));

  if (!me || me.role !== "banker") {
    alert("เฉพาะเจ้ามือเท่านั้น");
    return;
  }

  if (String(playerId) === String(myPlayerId)) {
    alert("เตะตัวเองไม่ได้");
    return;
  }

  db.ref(
    "rooms/" +
    currentRoom.id +
    "/players/" +
    playerId
  ).remove();
}

window.kickPlayer = kickPlayer;


// =====================
// เริ่มต้นระบบ
// =====================


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
  localStorage.setItem("pendingRoomId", roomId);

  if (savedId) {
    loginWithId(savedId, roomId);
  } else {
    showPage("loginPage");
  }
  return;
}

    showPage("loginPage");
  
};

function toggleRules(){
  const box = document.getElementById("ruleBox");

  if(box.style.display === "none"){
    box.style.display = "block";
  }else{
    box.style.display = "none";
  }
}
function setBet(amount){
  document.getElementById("betAmount").value = amount;
  updateMaxLose();

  document.querySelectorAll("#betButtons button")
    .forEach(btn => btn.classList.remove("active-bet"));

  event.target.classList.add("active-bet");
}

async function loginLine() {
  try {
   

    await liff.init({
      liffId: LIFF_ID
    });

   
    if (!liff.isLoggedIn()) {
      
      liff.login();
      return;
    }

    
    
    let profile = null;


try {
  profile = await liff.getProfile();
  
} catch (err) {
 

  const token = liff.getDecodedIDToken();
 
  profile = {
    userId: token?.sub,
    displayName: token?.name || "LINE",
    pictureUrl: token?.picture || ""
  };
}

   


// เก็บชื่อสำรองให้ joinRoom ใช้ได้ทุกแบบ
localStorage.setItem("lineName", profile.displayName);
localStorage.setItem("linePicture", profile.pictureUrl || "");
localStorage.setItem("playerId", profile.userId);
const pendingRoomId = localStorage.getItem("pendingRoomId");
if (pendingRoomId) {
  localStorage.removeItem("pendingRoomId");
  loginWithId(profile.userId, pendingRoomId);
  return;
}

loginWithId(profile.userId, null);
   
  } catch (err) {
    alert("ERROR: " + err.message);
  }
}

function loginWithOldId() {
  const playerId = el("playerId")?.value.trim();
  const pin = el("playerPin")?.value.trim();

  if (!playerId) return alert("กรุณาใส่รหัสผู้เล่น");
  if (!pin) return alert("กรุณาใส่ PIN");

  db.ref("users/" + playerId).once("value").then(snap => {
    if (!snap.exists()) return alert("ไม่พบรหัสนี้");

    const user = snap.val();

    if (!user.pin) {
      db.ref("users/" + playerId + "/pin").set(pin).then(() => {
        alert("ตั้ง PIN สำเร็จแล้ว");
        loginWithId(playerId, null);
      });
      return;
    }

    if (String(user.pin) !== String(pin)) {
      return alert("PIN ไม่ถูกต้อง");
    }

    loginWithId(playerId, null);
  });
}

window.loginWithOldId = loginWithOldId;
