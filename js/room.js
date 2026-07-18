/* =====================================================
   room.js
   สร้างห้อง / เข้าห้อง / ออกห้อง / ฟังข้อมูลห้องแบบเรียลไทม์
   ส่งต่อเจ้ามือ / เตะผู้เล่น / ปิดห้อง / เริ่มตาใหม่
   ===================================================== */

function createRoom() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return alert("ไม่พบรหัสผู้เล่น");

  const minBet = Number(el("minBet")?.value) || 10;
  const maxBet = Number(el("maxBet")?.value) || 50;
  const tongPercent = Number(el("tongPercent")?.value) || 0;

  if (minBet > maxBet) return alert("ขั้นต่ำต้องไม่เกินสูงสุด");

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;

    if (money < maxBet * 5) {
      alert("เครดิตเจ้ามือต้องมีอย่างน้อย " + (maxBet * 5));
      return;
    }

    db.ref("rooms").once("value").then(roomSnap => {
      const rooms = roomSnap.val() || {};

      const myRoom = Object.values(rooms).find(r =>
        r.players && r.players[playerId]
      );

      if (myRoom) {
        alert("คุณมีห้องเปิดอยู่แล้ว");
        listenRoom(myRoom.id);
        showPage("roomPage");
        return;
      }

      const roomId = String(Date.now());

      const roomData = {
        id: roomId,
        ownerId: OWNER_ID,
        adminId: playerId,
        banker: playerId,
        bankerMoney: money,
        minBet,
        maxBet,
        tongPercent,
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
    const existingPlayer = (room.players || {})[playerId];

    db.ref("wallet/" + playerId).once("value").then(walletSnap => {
      const walletMoney = Number(walletSnap.val() || 0);

      let playerData;

      if (existingPlayer) {
        // คนนี้อยู่ในห้องนี้อยู่แล้ว (เช่น รีเฟรชหน้า หรือกดลิงก์เชิญของตัวเอง)
        // แค่แตะสถานะออนไลน์ + อัปเดตชื่อ/รูป ห้ามแตะ role/cards/bet เดิม ไม่งั้นเจ้ามือจะถูกเปลี่ยนเป็นผู้เล่นโดยไม่ตั้งใจ
        playerData = {
          name: playerName,
          displayName: playerName,
          pictureUrl: pictureUrl,
          photo: pictureUrl,
          online: true
        };
      } else {
        playerData = {
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

          if (!existingPlayer && roomStatus !== "waiting") {
            alert("โต๊ะกำลังเล่นอยู่ คุณจะเข้ารอบถัดไป");
          }
        });
    });
  });
}

// ถ้าเจ้ามือหายไปจากห้อง (โดนเตะ/ออกโดยไม่ได้ส่งต่อ/ปิดแอปกะทันหัน)
// แทนที่จะเลื่อนใครขึ้นอัตโนมัติ ให้ตั้งธง bankerMissing แล้วให้ผู้เล่นกดรับเป็นเจ้ามือเอง
function autoAssignBankerIfMissing() {
  if (!currentRoom || !currentRoom.id) return;

  const hasBanker = players.some(p => p.role === "banker");

  if (hasBanker) {
    if (currentRoom.bankerMissing) {
      db.ref("rooms/" + currentRoom.id).update({ bankerMissing: false, bankerClaim: null });
    }
    return;
  }

  const hasEligiblePlayers = players.some(p => p.role === "player");
  if (hasEligiblePlayers && !currentRoom.bankerMissing) {
    db.ref("rooms/" + currentRoom.id + "/bankerMissing").set(true);
  }
}

// ผู้เล่นกดปุ่ม "รับเป็นเจ้ามือ" — ใช้ transaction กันไม่ให้มีคนได้พร้อมกัน 2 คน
function claimBanker() {
  if (!currentRoom || !currentRoom.id) return;

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
  if (!me || me.role !== "player") {
    alert("เฉพาะผู้เล่นในห้องเท่านั้นที่รับเป็นเจ้ามือได้");
    return;
  }

  db.ref("rooms/" + currentRoom.id + "/bankerClaim").transaction(current => {
    if (current) return; // มีคนกดไปก่อนแล้ว ยกเลิก
    return myPlayerId;
  }, (error, committed, snap) => {
    if (error) return;

    if (!committed || String(snap.val()) !== String(myPlayerId)) {
      alert("มีคนกดรับเป็นเจ้ามือไปก่อนแล้ว");
      return;
    }

    const updates = {};
    updates["rooms/" + currentRoom.id + "/banker"] = myPlayerId;
    updates["rooms/" + currentRoom.id + "/bankerMoney"] = Number(me.money || 0);
    updates["rooms/" + currentRoom.id + "/players/" + myPlayerId + "/role"] = "banker";
    updates["rooms/" + currentRoom.id + "/status"] = "waiting";
    updates["rooms/" + currentRoom.id + "/turnOrder"] = [];
    updates["rooms/" + currentRoom.id + "/turnIndex"] = 0;
    updates["rooms/" + currentRoom.id + "/turnDeadline"] = 0;
    updates["rooms/" + currentRoom.id + "/showAllCards"] = false;
    updates["rooms/" + currentRoom.id + "/bankerMissing"] = false;
    updates["rooms/" + currentRoom.id + "/bankerClaim"] = null;

    db.ref().update(updates);
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
    if (el("tongPercentText")) {
      el("tongPercentText").innerText = (room.tongPercent || 0) + "%";
    }

    renderPlayers();
    renderBetBox();
    checkAllReady();
    updateDeckRemain();
    updateActionButtons();
    autoAssignBankerIfMissing();

    const missingBox = el("bankerMissingBox");
    if (missingBox) {
      const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
      const iAmEligible = me && me.role === "player";
      missingBox.style.display = (currentRoom.bankerMissing && iAmEligible) ? "block" : "none";
    }

    if (
      currentRoom.status === "playing" &&
      currentRoom.turnDeadline > 0 &&
      !timerInterval
    ) {
      startTimer();
    }

    updateTurnTimer();
    showRoundResult();

    if (typeof listenChat === "function" && (!chatListenerRef)) {
      listenChat(roomId);
    }
    if (typeof watchIncomingOffers === "function" && !offerWatcherRef) {
      watchIncomingOffers(roomId);
    }
    if (typeof syncVideoPeers === "function") {
      syncVideoPeers();
    }

    const videoBtn = el("videoToggleBtn");
    const micBtn = el("micToggleBtn");
    const iAmBanker = getBanker() && String(getBanker().id || getBanker().name) === String(myPlayerId);
    if (videoBtn) videoBtn.style.display = iAmBanker ? "inline-block" : "none";
    if (micBtn && !iAmBanker) micBtn.style.display = "none";
  });
}

function leaveRoom() {
  if (!currentRoom || !currentRoom.id) {
    showPage("lobbyPage");
    return;
  }

  const roomId = currentRoom.id;
  const playerId = myPlayerId || localStorage.getItem("playerId");

  const me = players.find(p => String(p.id || p.name) === String(playerId));

  if (me && me.role === "banker") {
    alert("เจ้ามือต้องส่งต่อเจ้ามือหรือปิดห้องก่อน");
    return;
  }

  stopTimer();
  if (typeof stopVideo === "function") stopVideo();
  if (typeof stopChatListener === "function") stopChatListener();

  db.ref("rooms/" + roomId + "/players/" + playerId)
    .remove()
    .then(() => {
      if (roomListenerRef) roomListenerRef.off();

      currentRoom = null;
      players = [];
      localStorage.removeItem("currentRoomId");

      showPage("lobbyPage");
    });
}

function copyInviteLink() {
  if (!currentRoom || !currentRoom.id) return alert("ยังไม่มีห้อง");

  const link = "https://chaisaksing-dot.github.io/pokdeng-live/?room=" + currentRoom.id;

  navigator.clipboard.writeText(link)
    .then(() => alert("คัดลอกลิงก์เชิญแล้ว:\n" + link))
    .catch(() => prompt("คัดลอกลิงก์นี้ส่งให้เพื่อน", link));
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
    updates["rooms/" + currentRoom.id + "/players/" + p.id + "/openCards"] = false;
  });

  db.ref().update(updates).then(() => {
    if (el("turnTimer")) el("turnTimer").innerText = "เวลา: -";
    if (el("resultText")) el("resultText").innerText = "ยังไม่มีผล";
    if (el("deckRemainCount")) el("deckRemainCount").innerText = "52";
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

function requestTransferBanker() {
  if (!currentRoom || !myPlayerId) return;

  const banker = getBanker();
  if (!banker || String(banker.id) !== String(myPlayerId)) {
    alert("เฉพาะเจ้ามือเท่านั้น");
    return;
  }

  const candidates = players.filter(p =>
    p.role === "player" &&
    String(p.id) !== String(myPlayerId) &&
    Number(p.money || 0) >= Number(currentRoom.maxBet || 0) * 5
  );

  if (candidates.length === 0) {
    alert("ยังไม่มีผู้เล่นที่เครดิตพอรับเป็นเจ้ามือ");
    return;
  }

  let text = "เลือกหมายเลขผู้เล่นที่จะส่งต่อเจ้ามือ:\n\n";
  candidates.forEach((p, i) => {
    text += `${i + 1}. ${p.displayName || p.name || p.id} | เงิน ${p.money}\n`;
  });

  const choice = prompt(text);
  if (!choice) return;

  const newBanker = candidates[Number(choice) - 1];
  if (!newBanker) return alert("เลือกไม่ถูกต้อง");

  if (!confirm("ยืนยันส่งต่อเจ้ามือให้ " + (newBanker.displayName || newBanker.name || newBanker.id) + " ?")) {
    return;
  }

  const oldBankerId = banker.id;
  const newBankerId = newBanker.id;

  const updates = {};
  updates["rooms/" + currentRoom.id + "/banker"] = newBankerId;
  updates["rooms/" + currentRoom.id + "/bankerMoney"] = Number(newBanker.money || 0);
  updates["rooms/" + currentRoom.id + "/players/" + oldBankerId + "/role"] = "player";
  updates["rooms/" + currentRoom.id + "/players/" + newBankerId + "/role"] = "banker";
  updates["rooms/" + currentRoom.id + "/status"] = "waiting";

  db.ref().update(updates).then(() => {
    alert("ส่งต่อเจ้ามือเรียบร้อย");
  });
}

function closeRoom() {
  if (!currentRoom || !currentRoom.id) return alert("ไม่พบห้อง");

  const playerId = myPlayerId || localStorage.getItem("playerId");
  const banker = getBanker();

  const isAdmin = String(currentRoom.adminId) === String(playerId);
  const isBanker = banker && String(banker.id || banker.name) === String(playerId);

  if (!isAdmin && !isBanker) {
    return alert("เฉพาะแอดมินหรือเจ้ามือเท่านั้น");
  }

  if (!confirm("ต้องการปิดห้องนี้ใช่ไหม?")) return;

  if (typeof stopVideo === "function") stopVideo();
  if (typeof stopChatListener === "function") stopChatListener();

  db.ref("rooms/" + currentRoom.id).remove().then(() => {
    if (roomListenerRef) roomListenerRef.off();

    currentRoom = null;
    players = [];
    localStorage.removeItem("currentRoomId");

    showPage("lobbyPage");
  });
}