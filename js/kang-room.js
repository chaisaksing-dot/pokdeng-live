/* =====================================================
   kang-room.js
   ระบบห้องไพ่แคง ต่อกับ Firebase เดียวกับป๊อกเด้ง ใช้ตัวตน LINE login เดียวกัน
   ตั้งชื่อตัวแปร/ฟังก์ชันขึ้นต้นด้วย kang เพื่อไม่ชนกับ state.js/room.js ของป๊อกเด้ง
   ===================================================== */

let kangCurrentRoom = null;
let kangPlayers = [];
let kangRoomListenerRef = null;
let kangOpenRoomsListenerRef = null;
let kangSelectedCardIndices = [];
let kangChatListenerRef = null;

function selectGame(game) {
  if (game === "pokdeng") {
    showPage("lobbyPage");
  } else if (game === "kang") {
    showPage("kangLobbyPage");
    kangListenOpenRooms();
  } else {
    alert("เกมนี้ยังไม่เปิดให้เล่น เร็วๆ นี้ครับ");
  }
}

function kangMe() {
  return kangPlayers.find(p => p.id === myPlayerId);
}

function kangListenOpenRooms() {
  const box = el("kangOpenRoomsList");
  if (!box) return;

  const userInfoBox = el("userInfoKang");
  if (userInfoBox) {
    db.ref("wallet/" + myPlayerId).once("value").then(snap => {
      userInfoBox.innerText = "เครดิต: " + (Number(snap.val()) || 0);
    });
  }

  if (kangOpenRoomsListenerRef) kangOpenRoomsListenerRef.off();
  kangOpenRoomsListenerRef = db.ref("kangRooms");

  kangOpenRoomsListenerRef.on("value", snap => {
    const rooms = snap.val() || {};
    box.innerHTML = "";

    Object.entries(rooms).forEach(([roomId, room]) => {
      const roomPlayers = Object.values(room.players || {});

      if (roomPlayers.length === 0) {
        db.ref("kangRooms/" + roomId).remove();
        return;
      }

      if (room.status === "waiting" && roomPlayers.length < 6) {
        box.innerHTML += `
          <div class="room-item">
            <b>ห้อง ${roomId}</b><br>
            ผู้เล่น: ${roomPlayers.length}/6 | เดิมพัน: ${room.baseBet}<br>
            <button class="btn small" onclick="kangJoinRoom('${roomId}')">เข้าห้อง</button>
          </div>
        `;
      }
    });

    if (!box.innerHTML) box.innerHTML = "ยังไม่มีห้องว่าง";
  });
}

function kangCreateRoom() {
  const baseBet = Number(el("kangBaseBet").value);
  const playerName = localStorage.getItem("lineName") || myPlayerId;
  const photo = localStorage.getItem("linePicture") || "";

  db.ref("wallet/" + myPlayerId).once("value").then(walletSnap => {
    const money = Number(walletSnap.val()) || 0;
    const roomId = String(Date.now());

    const roomData = {
      id: roomId,
      creatorId: myPlayerId,
      baseBet,
      status: "waiting",
      roundNumber: 0,
      deck: null,
      discardPile: [],
      turnOrder: [],
      turnIndex: 0,
      lastDiscarderId: null,
      players: {
        [myPlayerId]: {
          id: myPlayerId, name: playerName, photo, money, ready: false, hand: null
        }
      }
    };

    db.ref("kangRooms/" + roomId).set(roomData).then(() => {
      kangListenRoom(roomId);
      showPage("kangRoomPage");
    });
  });
}

function kangJoinRoomById() {
  const roomId = el("kangJoinRoomId").value.trim();
  if (!roomId) return alert("ใส่เลขห้อง");
  kangJoinRoom(roomId);
}

function kangJoinRoom(roomId) {
  const playerName = localStorage.getItem("lineName") || myPlayerId;
  const photo = localStorage.getItem("linePicture") || "";

  db.ref("kangRooms/" + roomId).once("value").then(snap => {
    if (!snap.exists()) return alert("ไม่พบห้องนี้");

    const room = snap.val();
    const existing = (room.players || {})[myPlayerId];

    db.ref("wallet/" + myPlayerId).once("value").then(walletSnap => {
      const money = Number(walletSnap.val()) || 0;

      const playerData = existing
        ? { name: playerName, photo }
        : { id: myPlayerId, name: playerName, photo, money, ready: false, hand: null };

      db.ref("kangRooms/" + roomId + "/players/" + myPlayerId).update(playerData).then(() => {
        kangListenRoom(roomId);
        showPage("kangRoomPage");
      });
    });
  });
}

function kangLeaveRoom() {
  if (!kangCurrentRoom) return showPage("kangLobbyPage");

  const me = kangMe();
  if (me && kangCurrentRoom.creatorId === myPlayerId && kangPlayers.length > 1) {
    return alert("คุณเป็นผู้สร้างห้อง ให้คนอื่นออกจนเหลือคนเดียว หรือปิดห้องก่อน (ปิดห้อง = ออกตอนเหลือคนเดียว)");
  }

  db.ref("kangRooms/" + kangCurrentRoom.id + "/players/" + myPlayerId).remove().then(() => {
    if (kangRoomListenerRef) kangRoomListenerRef.off();
    if (kangChatListenerRef) kangChatListenerRef.off();
    kangCurrentRoom = null;
    kangPlayers = [];
    showPage("kangLobbyPage");
  });
}

function kangListenRoom(roomId) {
  if (kangRoomListenerRef) kangRoomListenerRef.off();
  kangRoomListenerRef = db.ref("kangRooms/" + roomId);

  kangRoomListenerRef.on("value", snap => {
    const room = snap.val();
    if (!room) {
      kangCurrentRoom = null;
      kangPlayers = [];
      showPage("kangLobbyPage");
      return;
    }

    kangCurrentRoom = { ...room, id: roomId };
    kangPlayers = Object.values(room.players || {});

    kangRender();
  });

  if (!kangChatListenerRef) {
    kangChatListenerRef = db.ref("kangRooms/" + roomId + "/chat").limitToLast(50);
    const chatBox = el("kangChatMessages");
    if (chatBox) chatBox.innerHTML = "";

    kangChatListenerRef.on("child_added", chatSnap => {
      const msg = chatSnap.val();
      if (!chatBox || !msg) return;
      const isMe = String(msg.senderId) === String(myPlayerId);
      const line = document.createElement("div");
      line.className = "chat-line";
      line.innerHTML = `<span class="chat-name">${isMe ? "ฉัน" : shortName(msg.senderName || msg.senderId)}:</span>${escapeChatText(msg.text || "")}`;
      chatBox.appendChild(line);
      chatBox.scrollTop = chatBox.scrollHeight;
    });
  }
}

function kangSendChatMessage() {
  const input = el("kangChatInput");
  const text = input ? input.value.trim() : "";
  if (!text || !kangCurrentRoom) return;

  const me = kangMe();
  db.ref("kangRooms/" + kangCurrentRoom.id + "/chat").push({
    senderId: myPlayerId,
    senderName: me ? me.name : myPlayerId,
    text: text.slice(0, 200),
    ts: Date.now()
  });

  if (input) input.value = "";
}

function kangPlayerReady() {
  db.ref("kangRooms/" + kangCurrentRoom.id + "/players/" + myPlayerId + "/ready").set(true);
}

function kangStartGame() {
  if (kangCurrentRoom.creatorId !== myPlayerId) return;
  if (kangPlayers.length < 2) return alert("ต้องมีอย่างน้อย 2 คน");
  if (!kangPlayers.every(p => p.ready)) return alert("ต้องพร้อมทุกคนก่อน");

  const worstCaseLiability = kangCurrentRoom.baseBet * (kangPlayers.length - 1);
  const notEnough = kangPlayers.filter(p => Number(p.money || 0) < worstCaseLiability);

  if (notEnough.length > 0) {
    const names = notEnough.map(p => p.name).join(", ");
    return alert(
      "เริ่มเกมไม่ได้ — ผู้เล่นต่อไปนี้มีเงินไม่พอสำรองจ่ายกรณีแคงพลาด (ต้องมีอย่างน้อย " +
      worstCaseLiability + "): " + names
    );
  }

  const deck = kangCreateDeck();
  const updates = {};

  kangPlayers.forEach(p => {
    const hand = deck.splice(0, 5);
    updates["kangRooms/" + kangCurrentRoom.id + "/players/" + p.id + "/hand"] = hand;
    updates["kangRooms/" + kangCurrentRoom.id + "/players/" + p.id + "/ready"] = false;
  });

  const startIndex = kangCurrentRoom.roundNumber > 0 && kangCurrentRoom.lastWinnerId
    ? kangPlayers.findIndex(p => p.id === kangCurrentRoom.lastWinnerId)
    : Math.floor(Math.random() * kangPlayers.length);

  const turnOrder = kangPlayers.map(p => p.id);
  const safeIndex = Math.max(startIndex, 0);
  const rotated = turnOrder.slice(safeIndex).concat(turnOrder.slice(0, safeIndex));

  updates["kangRooms/" + kangCurrentRoom.id + "/deck"] = deck;
  updates["kangRooms/" + kangCurrentRoom.id + "/discardPile"] = [];
  updates["kangRooms/" + kangCurrentRoom.id + "/lastDiscarderId"] = null;
  updates["kangRooms/" + kangCurrentRoom.id + "/turnOrder"] = rotated;
  updates["kangRooms/" + kangCurrentRoom.id + "/turnIndex"] = 0;
  updates["kangRooms/" + kangCurrentRoom.id + "/status"] = "playing";
  updates["kangRooms/" + kangCurrentRoom.id + "/result"] = null;

  db.ref().update(updates).then(() => {
    kangCheckSpecialHandsAfterDeal();
  });
}

function kangCheckSpecialHandsAfterDeal() {
  db.ref("kangRooms/" + kangCurrentRoom.id + "/players").once("value").then(snap => {
    const latest = Object.values(snap.val() || {});
    let bestPlayer = null;
    let bestRank = -1;
    const rankOrder = ["threeOfKind", "straight", "flush", "fullHouse", "fourCard", "straightFlush"];

    latest.forEach(p => {
      const special = kangDetectSpecialHand(p.hand);
      if (special) {
        const rank = rankOrder.indexOf(special.type);
        if (rank > bestRank) {
          bestRank = rank;
          bestPlayer = p;
        }
      }
    });

    if (bestPlayer) {
      kangFinishRound(bestPlayer.id, null, "พิเศษ: " + kangDetectSpecialHand(bestPlayer.hand).label);
    }
  });
}

function kangIsMyTurn() {
  if (!kangCurrentRoom || kangCurrentRoom.status !== "playing") return false;
  const order = kangCurrentRoom.turnOrder || [];
  return order[kangCurrentRoom.turnIndex] === myPlayerId;
}

function kangDoDraw() {
  if (!kangIsMyTurn()) return;

  db.ref("kangRooms/" + kangCurrentRoom.id + "/deck").transaction(deck => {
    if (!deck || deck.length === 0) return deck;
    const newDeck = [...deck];
    window.__drawnKangCard = newDeck.shift();
    return newDeck;
  }, (error, committed) => {
    if (error || !committed) return;

    const card = window.__drawnKangCard;
    window.__drawnKangCard = null;
    if (!card) return;

    const myHand = [...((kangMe() && kangMe().hand) || []), card];
    db.ref("kangRooms/" + kangCurrentRoom.id + "/players/" + myPlayerId + "/hand").set(myHand);
  });
}

function kangToggleCardSelect(index) {
  const pos = kangSelectedCardIndices.indexOf(index);
  if (pos === -1) kangSelectedCardIndices.push(index);
  else kangSelectedCardIndices.splice(pos, 1);
  kangRender();
}

function kangDoDiscardSelected() {
  if (!kangIsMyTurn()) return;
  if (kangSelectedCardIndices.length === 0) return alert("เลือกไพ่ที่จะทิ้งก่อน");

  const hand = (kangMe() && kangMe().hand) || [];
  if (kangSelectedCardIndices.length === 2) {
    const [i1, i2] = kangSelectedCardIndices;
    if (!kangCanDiscardPair(hand[i1], hand[i2])) {
      return alert("ทิ้ง 2 ใบพร้อมกันได้เฉพาะแต้มเดียวกันเท่านั้น");
    }
  } else if (kangSelectedCardIndices.length !== 1) {
    return alert("เลือกทิ้งได้แค่ 1 ใบ หรือ 2 ใบถ้าแต้มเดียวกัน");
  }

  const discarded = kangSelectedCardIndices.map(i => hand[i]);
  const remainingHand = hand.filter((_, i) => !kangSelectedCardIndices.includes(i));

  const updates = {};
  updates["kangRooms/" + kangCurrentRoom.id + "/players/" + myPlayerId + "/hand"] = remainingHand;
  updates["kangRooms/" + kangCurrentRoom.id + "/discardPile"] = [...(kangCurrentRoom.discardPile || []), ...discarded];
  updates["kangRooms/" + kangCurrentRoom.id + "/lastDiscarderId"] = myPlayerId;

  kangSelectedCardIndices = [];

  db.ref().update(updates).then(() => {
    if (remainingHand.length === 0) {
      kangFinishRound(myPlayerId, null, "ทิ้งไพ่หมดมือ (แคงอัตโนมัติ)");
    } else {
      kangAdvanceTurn();
    }
  });
}

function kangDoFlowSelected() {
  if (!kangIsMyTurn()) return;
  if (kangSelectedCardIndices.length !== 1) return alert("เลือกไพ่ 1 ใบที่จะไหล");

  const hand = (kangMe() && kangMe().hand) || [];
  const cardIndex = kangSelectedCardIndices[0];
  const card = hand[cardIndex];
  const pile = kangCurrentRoom.discardPile || [];
  const lastCard = pile[pile.length - 1];

  if (!kangCanFlow(card, lastCard)) {
    return alert("ไหลไม่ได้ — ต้องแต้มเดียวกับไพ่ใบล่าสุดที่ถูกทิ้ง");
  }

  const feederId = kangCurrentRoom.lastDiscarderId;
  const remainingHand = hand.filter((_, i) => i !== cardIndex);
  const isKnockout = remainingHand.length === 0;

  const updates = {};
  updates["kangRooms/" + kangCurrentRoom.id + "/players/" + myPlayerId + "/hand"] = remainingHand;
  updates["kangRooms/" + kangCurrentRoom.id + "/discardPile"] = [...pile, card];
  updates["kangRooms/" + kangCurrentRoom.id + "/lastDiscarderId"] = myPlayerId;

  kangSelectedCardIndices = [];

  db.ref().update(updates).then(() => {
    const allIds = kangPlayers.map(p => p.id);
    const flowResult = kangFlowPenalty(feederId, allIds, kangCurrentRoom.baseBet);
    kangApplyPayments(flowResult.payments);

    if (isKnockout) {
      const knockoutResult = kangFlowKnockoutPenalty(feederId, allIds, kangCurrentRoom.baseBet);
      kangApplyPayments(knockoutResult.payments);
      kangFinishRound(myPlayerId, null, "ไหลน็อค! (" + feederId + " ป้อนไพ่ให้)", true);
    } else {
      kangAdvanceTurn();
    }
  });
}

function kangDoDeclare() {
  if (!kangIsMyTurn()) return;
  kangFinishRound(myPlayerId, myPlayerId, null);
}

function kangAdvanceTurn() {
  const order = kangCurrentRoom.turnOrder || [];
  const nextIndex = (kangCurrentRoom.turnIndex + 1) % order.length;
  db.ref("kangRooms/" + kangCurrentRoom.id + "/turnIndex").set(nextIndex);
}

function kangApplyPayments(payments) {
  const updates = {};
  Object.entries(payments).forEach(([id, amount]) => {
    const p = kangPlayers.find(x => x.id === id);
    if (!p) return;
    const newMoney = Number(p.money || 0) + amount;
    updates["kangRooms/" + kangCurrentRoom.id + "/players/" + id + "/money"] = newMoney;
    updates["wallet/" + id] = newMoney;
  });
  db.ref().update(updates);
}

function kangFinishRound(winnerId, declarerId, specialLabel, alreadySettled) {
  db.ref("kangRooms/" + kangCurrentRoom.id + "/players").once("value").then(snap => {
    const latest = Object.values(snap.val() || {});
    const playerHands = latest.map(p => ({ id: p.id, cards: p.hand || [] }));

    let resultText = "";
    const updates = {};

    if (specialLabel && !declarerId) {
      if (!alreadySettled) {
        const settled = kangSettleRound(playerHands, winnerId, kangCurrentRoom.baseBet);
        kangApplyPaymentsDirect(latest, settled.payments, updates);
        resultText = kangBuildResultText(settled, playerHands, specialLabel);
      } else {
        resultText = "🎉 " + specialLabel + "\n(คิดเงินไปแล้วตอนไหลน็อค)";
      }
    } else {
      const settled = kangSettleRound(playerHands, declarerId, kangCurrentRoom.baseBet);
      kangApplyPaymentsDirect(latest, settled.payments, updates);
      resultText = kangBuildResultText(settled, playerHands, null);
    }

    updates["kangRooms/" + kangCurrentRoom.id + "/status"] = "finished";
    updates["kangRooms/" + kangCurrentRoom.id + "/result"] = resultText;
    updates["kangRooms/" + kangCurrentRoom.id + "/lastWinnerId"] = winnerId;
    updates["kangRooms/" + kangCurrentRoom.id + "/roundNumber"] = Number(kangCurrentRoom.roundNumber || 0) + 1;

    db.ref().update(updates);
  });
}

function kangApplyPaymentsDirect(latestPlayers, payments, updates) {
  Object.entries(payments).forEach(([id, amount]) => {
    const p = latestPlayers.find(x => x.id === id);
    if (!p) return;
    const newMoney = Number(p.money || 0) + amount;
    updates["kangRooms/" + kangCurrentRoom.id + "/players/" + id + "/money"] = newMoney;
    updates["wallet/" + id] = newMoney;
  });
}

function kangBuildResultText(settled, playerHands, specialLabel) {
  let text = specialLabel ? "🎉 " + specialLabel + "\n\n" : "";
  playerHands.forEach(p => {
    const name = (kangPlayers.find(x => x.id === p.id) || {}).name || p.id;
    const total = settled.totals[p.id];
    const net = settled.payments[p.id];
    const tag = p.id === settled.winnerId ? "🏆 ชนะ" : "";
    text += `${name}: แต้ม ${total} ${tag} (${net >= 0 ? "+" : ""}${net})\n`;
  });
  if (!settled.declarerWon && settled.winnerId) {
    text += "\n⚠️ คนแคงทายผิด ต้องจ่ายทั้งวง";
  }
  return text;
}

function kangNewRound() {
  if (kangCurrentRoom.creatorId !== myPlayerId) return alert("เฉพาะคนสร้างห้องเท่านั้นที่เริ่มรอบใหม่ได้");
  db.ref("kangRooms/" + kangCurrentRoom.id).update({ status: "waiting", result: null });
}