/* =====================================================
   ui.js
   แสดงผลหน้าจอ, การ์ด, ผู้เล่น, ตัวจับเวลา
   ===================================================== */

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

function showCard(c) {
  if (!c) return "";
  const suit = c.slice(-1);
  const value = c.slice(0, -1);
  const cls = suit === "♥" || suit === "♦" ? "red-card" : "black-card";
  return `<span class="${cls}">${value}${suit}</span>`;
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

function updateDeckRemain() {
  const remain = Array.isArray(currentRoom?.deck) ? currentRoom.deck.length : 52;
  const box = el("deckRemainCount");
  if (box) box.innerText = remain;
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

    const point = getPoint(p.cards || []);
    const open =
      finished ||
      showAll ||
      p.openCards === true ||
      p.pokLocked === true ||
      String(p.id) === String(myPlayerId);
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

    const moneyBox = el("myMoneyText");
    if (moneyBox) {
      moneyBox.innerHTML = "เงินของฉัน: " + Number(me.money || 0);
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
  playSound("soundTurn");

  if (!turnPlayer) return;

  const remain = Math.max(0, Math.ceil((Number(currentRoom.turnDeadline || 0) - Date.now()) / 1000));

  const timerBox = el("turnTimer");
  if (timerBox) timerBox.innerText = remain > 0 ? "เวลา: " + remain : "เวลา: 0";

  const resultBox = el("resultText");
  const turnInfo = players.find(p => String(p.id) === String(turnPlayer));
  const turnName = turnInfo ? (turnInfo.displayName || turnInfo.name) : turnPlayer;

  if (resultBox) resultBox.innerText = "คิว " + shortName(turnName) + " (" + remain + " วินาที)";

  if (remain <= 0) {
    const banker = getBanker();
    if (banker && String(myPlayerId) === String(banker.id)) {
      autoStand(turnPlayer);
    }
  }
}

function showRoundResult() {
  if (!currentRoom || currentRoom.status !== "finished") return;

  const resultBox = el("resultText");
  if (!resultBox) return;

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
  document.getElementById("betAmount").value = amount;
  updateMaxLose();

  document.querySelectorAll("#betButtons button")
    .forEach(btn => btn.classList.remove("active-bet"));

  if (typeof event !== "undefined" && event?.target) {
    event.target.classList.add("active-bet");
  }
}

function updateMaxLose() {
  const bet = Number(el("betAmount")?.value) || 0;
  if (el("maxLoseText")) el("maxLoseText").innerText = bet * 5;
}

function toggleRules() {
  const box = document.getElementById("ruleBox");

  if (box.style.display === "none") {
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}

function playSound(id) {
  const audio = document.getElementById(id);
  if (!audio) return;

  audio.currentTime = 0;
  audio.play().catch(() => {});
}