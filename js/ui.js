/* =====================================================
   ui.js
   แสดงผลหน้าจอ, การ์ด, ผู้เล่น, ตัวจับเวลา
   ===================================================== */

function el(id) {
  return document.getElementById(id);
}

function showPage(pageId) {
  ["loginPage", "gameSelectPage", "adminPage", "lobbyPage", "roomPage", "kangLobbyPage", "kangRoomPage"].forEach(id => {
    const box = el(id);
    if (box) box.style.display = "none";
  });

  const page = el(pageId);
  if (page) page.style.display = "block";

  if (pageId === "lobbyPage") {
    refreshUserInfo();
    listenOpenRooms();
  }

  if (pageId === "gameSelectPage") {
    const box = el("userInfoGameSelect");
    const playerId = localStorage.getItem("playerId") || myPlayerId;
    if (box && playerId) {
      db.ref("wallet/" + playerId).once("value").then(snap => {
        box.innerText = "เครดิต: " + (Number(snap.val()) || 0);
      });
    }
  }

  if (pageId === "kangLobbyPage" && typeof kangListenOpenRooms === "function") {
    kangListenOpenRooms();
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

let lastCardCounts = {};
let myRevealedCards = [];

function revealMyCard(index) {
  if (!myRevealedCards.includes(index)) myRevealedCards.push(index);
  renderPlayers();
}

function renderMyCards(cardList) {
  if (!cardList) return "";
  const arr = Object.values(cardList);

  return `
    <div class="banker-cards">
      ${arr.map((c, i) => {
        if (myRevealedCards.includes(i)) {
          return `<div class="mini-card open-card">${showCard(c)}</div>`;
        }
        return `<div class="mini-card back" onclick="revealMyCard(${i})" style="cursor:pointer;"></div>`;
      }).join("")}
    </div>
  `;
}

function flyCardTo(targetEl) {
  const table = document.querySelector(".casino-table");
  const deck = el("deckPile");
  if (!table || !deck || !targetEl) return;

  const tableRect = table.getBoundingClientRect();
  const deckRect = deck.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const startX = deckRect.left - tableRect.left + deckRect.width / 2;
  const startY = deckRect.top - tableRect.top + deckRect.height / 2;
  const endX = targetRect.left - tableRect.left + targetRect.width / 2;
  const endY = targetRect.top - tableRect.top + targetRect.height / 2;

  const dx = endX - startX;
  const dy = endY - startY;

  const card = document.createElement("div");
  card.className = "mini-card back flying-card";
  card.style.left = startX + "px";
  card.style.top = startY + "px";
  card.style.transform = "translate(-50%, -50%)";
  table.appendChild(card);


  requestAnimationFrame(() => {
    card.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(360deg)`;
    card.style.opacity = "0.15";
  });

  setTimeout(() => {
    card.remove();
    playSound("soundPlace");
  }, 950);
}

function queueCardFlyAnimations(seatEl, newCount, prevCount) {
  if (!seatEl || newCount <= prevCount) return;

  for (let n = prevCount; n < newCount; n++) {
    setTimeout(() => flyCardTo(seatEl), (n - prevCount) * 500);
  }
}

function renderPlayers() {
  for (let i = 1; i <= 8; i++) {
    const seat = el("player" + i);
    if (seat) seat.innerHTML = "";
  }

  const finished = currentRoom?.status === "finished";
  const showAll = currentRoom?.showAllCards === true;
  const normalPlayers = players.filter(p => p.role === "player" || p.role === "waiting");

  if (currentRoom && currentRoom.status === "waiting") {
    myRevealedCards = [];
  }

  normalPlayers.forEach((p, i) => {
    const seat = el("player" + (i + 1));
    if (!seat) return;

    const isMySeat = String(p.id) === String(myPlayerId);
    const forcedOpen =
      finished ||
      showAll ||
      p.openCards === true ||
      p.pokLocked === true;
    const open = forcedOpen || isMySeat;
    const point = getPoint(p.cards || []);
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

    const showPoint = forcedOpen || (isMySeat && p.cards && myRevealedCards.length === Object.values(p.cards).length && Object.values(p.cards).length > 0);

    seat.innerHTML = `
      <div class="player-box-ui">
        <img src="${photoUrl}" class="player-photo">
        <div class="player-info-text">
          <div class="player-name">${shortName(p.displayName || p.name)}</div>
          <div class="player-money">เงิน: ${p.money || 0}</div>
          <div class="player-money">เดิมพัน: ${p.bet || 0}</div>
          ${resultLine}
          <div class="player-money">แต้ม: ${showPoint ? point : "-"}</div>
        </div>
      </div>
      <div style="font-size: 10px; margin-top: 2px;">
        ${p.role === "waiting" ? "🪑 รอรอบหน้า" : (p.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม")}
      </div>
      ${canKick ? `<button onclick="kickPlayer('${p.id || p.name}')" style="font-size:9px; background:#e53935; color:white; border:none; border-radius:4px; margin-top:2px;">❌ เตะ</button> ` : ""}
      ${isMySeat && !forcedOpen ? renderMyCards(p.cards) : renderCards(p.cards, open)}
    `;

    const pid = p.id || p.name;
    const cardCount = Object.values(p.cards || {}).length;
    queueCardFlyAnimations(seat, cardCount, lastCardCounts[pid] || 0);
    lastCardCounts[pid] = cardCount;
  });

  const bankerBox = el("banker");
  const banker = getBanker();
  if (bankerBox && banker) {
    const isMe = String(banker.id || banker.name) === String(myPlayerId);
    const point = getPoint(banker.cards || []);
    const forcedOpenBanker = finished || showAll;
    const open = forcedOpenBanker || isMe;
    const photoUrl = banker.photo || "https://via.placeholder.com/50";

    const hasOwnStream = isMe && typeof myVideoStarted !== "undefined" && myVideoStarted && localStream;
    const hasRemoteStream = !isMe && typeof bankerStream !== "undefined" && bankerStream;
    const showVideo = hasOwnStream || hasRemoteStream;

    const photoOrVideo = showVideo
      ? `<video id="bankerPhotoVideo" class="player-photo" autoplay playsinline ${isMe ? "muted" : ""}></video>`
      : `<img src="${photoUrl}" class="player-photo">`;

    const bankerShowPoint = forcedOpenBanker || (isMe && banker.cards && myRevealedCards.length === Object.values(banker.cards).length && Object.values(banker.cards).length > 0);

    bankerBox.innerHTML = `
      <div class="player-box-ui">
        ${photoOrVideo}
        <div class="player-info-text">
          <div class="player-name">👑 ${shortName(banker.displayName || banker.name)}</div>
          <div class="player-money">เงิน: ${banker.money || 0}</div>
          <div class="player-money">แต้ม: ${bankerShowPoint ? point : "-"}</div>
        </div>
      </div>
      ${isMe && !forcedOpenBanker ? renderMyCards(banker.cards) : renderCards(banker.cards, open)}
    `;

    if (showVideo && typeof applyBankerVideoToSeat === "function") {
      applyBankerVideoToSeat();
    }

    const bankerId = "banker-" + (banker.id || banker.name);
    const bankerCardCount = Object.values(banker.cards || {}).length;
    queueCardFlyAnimations(bankerBox, bankerCardCount, lastCardCounts[bankerId] || 0);
    lastCardCounts[bankerId] = bankerCardCount;
  }
}

// เรียกหลังวาดที่นั่งเจ้ามือใหม่ทุกครั้ง เพื่อผูกสตรีมวิดีโอ (ของตัวเอง หรือที่รับมาจากเจ้ามือ) เข้ากับ <video> ที่เพิ่งสร้าง
function applyBankerVideoToSeat() {
  const videoEl = document.getElementById("bankerPhotoVideo");
  if (!videoEl) return;

  const banker = getBanker();
  const amIBanker = banker && String(banker.id || banker.name) === String(myPlayerId);
  const stream = amIBanker ? localStream : (typeof bankerStream !== "undefined" ? bankerStream : null);

  if (stream) {
    videoEl.srcObject = stream;
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

  if (!turnPlayer) return;

  const remain = Math.max(0, Math.ceil((Number(currentRoom.turnDeadline || 0) - Date.now()) / 1000));

  // เตือนด้วยเสียงเฉพาะ 10 วินาทีสุดท้ายเท่านั้น ไม่ใช่ทุกวินาทีตลอดทั้ง 60 วิ
  if (remain > 0 && remain <= 10) {
    playSound("soundTurn");
  }

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

/* =====================================================
   ระบบเสียง — ใช้ Web Audio API แทน <audio> tag ธรรมดา
   เหตุผล: iOS Safari ปลดล็อกได้ทีละไฟล์ต่อการแตะหนึ่งครั้งเท่านั้นถ้าใช้ <audio>,
   แต่ถ้าใช้ AudioContext ปลดล็อก "ระบบเสียง" ครั้งเดียวก็เล่นได้ทุกไฟล์ทุกเวลาเลย
   ===================================================== */

let audioCtx = null;
const soundBuffers = {};
const SOUND_FILES = {
  soundDeal: "sounds/deal.mp3?v=3",
  soundPlace: "sounds/place.mp3?v=3",
  soundTurn: "sounds/turn.mp3?v=3",
  soundWin: "sounds/win.mp3?v=3",
  soundLose: "sounds/lose.mp3?v=3"
};

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

function loadSoundBuffer(id) {
  const ctx = getAudioCtx();
  if (!ctx || soundBuffers[id]) return Promise.resolve();

  return fetch(SOUND_FILES[id])
    .then(res => res.arrayBuffer())
    .then(arr => ctx.decodeAudioData(arr))
    .then(buf => { soundBuffers[id] = buf; })
    .catch(err => console.error("โหลดเสียง " + id + " ไม่สำเร็จ", err));
}

function unlockAllSounds() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  Object.keys(SOUND_FILES).forEach(id => loadSoundBuffer(id));
}

function unlockOnce() {
  unlockAllSounds();
  startBackgroundMusic();
  document.removeEventListener("click", unlockOnce);
  document.removeEventListener("touchend", unlockOnce);
}

document.addEventListener("click", unlockOnce, { once: true });
document.addEventListener("touchend", unlockOnce, { once: true });

const MUSIC_TRACKS = {
  luktung: "sounds/bgmusic-luktung.mp3?v=2",
  beat: "sounds/bgmusic-beat.mp3?v=2",
  edm: "sounds/bgmusic-edm.mp3?v=2",
  isaan: "sounds/bgmusic-isaan.mp3?v=2",
  pop: "sounds/bgmusic-pop.mp3?v=2",
  hiphop: "sounds/bgmusic-hiphop.mp3?v=2",
  reggae: "sounds/bgmusic-reggae.mp3?v=2",
  disco: "sounds/bgmusic-disco.mp3?v=2",
  asian: "sounds/bgmusic-asian.mp3?v=2",
  rock: "sounds/bgmusic-rock.mp3?v=2"
};

let musicGain = null;
let currentMusicSource = null;
const musicBuffers = {};

function getMusicGain() {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(ctx.destination);
  }
  return musicGain;
}

function loadMusicBuffer(track) {
  const ctx = getAudioCtx();
  if (!ctx || musicBuffers[track]) return Promise.resolve();

  return fetch(MUSIC_TRACKS[track])
    .then(res => res.arrayBuffer())
    .then(arr => ctx.decodeAudioData(arr))
    .then(buf => { musicBuffers[track] = buf; })
    .catch(err => console.error("โหลดเพลง " + track + " ไม่สำเร็จ", err));
}

function playMusicTrack(track) {
  const ctx = getAudioCtx();
  const gain = getMusicGain();
  if (!ctx || !gain || !musicBuffers[track]) return;

  if (currentMusicSource) {
    try { currentMusicSource.stop(); } catch (e) {}
    currentMusicSource = null;
  }

  const source = ctx.createBufferSource();
  source.buffer = musicBuffers[track];
  source.loop = true; // ลูปแบบ gapless จริง เพราะวนซ้ำที่ buffer ดิบโดยตรง ไม่มีช่วงเงียบคั่น
  source.connect(gain);
  source.start(0);
  currentMusicSource = source;
}

function stopMusic() {
  if (currentMusicSource) {
    try { currentMusicSource.stop(); } catch (e) {}
    currentMusicSource = null;
  }
}

function startBackgroundMusic() {
  const muted = localStorage.getItem("musicMuted") === "1";
  const track = localStorage.getItem("musicTrack") || "luktung";

  const select = document.getElementById("musicSelect");
  if (select) select.value = track;

  loadMusicBuffer(track).then(() => {
    if (!muted) playMusicTrack(track);
  });

  const btn = el("musicToggleBtn");
  if (btn) btn.innerText = muted ? "🎵 เปิดเพลง" : "🎵 ปิดเพลง";
}

function changeMusicTrack(track) {
  if (!MUSIC_TRACKS[track]) return;
  localStorage.setItem("musicTrack", track);

  const muted = localStorage.getItem("musicMuted") === "1";
  loadMusicBuffer(track).then(() => {
    if (!muted) playMusicTrack(track);
  });
}

function toggleMusic() {
  const btn = el("musicToggleBtn");
  const muted = localStorage.getItem("musicMuted") === "1";

  if (muted) {
    localStorage.setItem("musicMuted", "0");
    const track = localStorage.getItem("musicTrack") || "luktung";
    loadMusicBuffer(track).then(() => playMusicTrack(track));
    if (btn) btn.innerText = "🎵 ปิดเพลง";
  } else {
    localStorage.setItem("musicMuted", "1");
    stopMusic();
    if (btn) btn.innerText = "🎵 เปิดเพลง";
  }
}

function playSound(id) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume();

  const buf = soundBuffers[id];
  if (!buf) {
    loadSoundBuffer(id); // ยังไม่พร้อม เผื่อไว้ใช้รอบหน้า
    return;
  }

  try {
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    if (window.__soundDebug) {
      alert("เล่นเสียง " + id + " ไม่สำเร็จ: " + err.message);
    }
  }
}

function testAllSounds() {
  window.__soundDebug = true;
  unlockAllSounds();

  const ids = ["soundDeal", "soundPlace", "soundTurn", "soundWin", "soundLose"];
  let i = 0;

  function playNext() {
    if (i >= ids.length) return;
    const id = ids[i];

    if (soundBuffers[id]) {
      playSound(id);
      alert("✅ " + id + " เล่นได้ (ถ้าไม่ได้ยิน ให้เช็คสวิตช์ปิดเสียง/ระดับเสียงเครื่อง)");
    } else {
      alert("❌ " + id + " ยังโหลด/ปลดล็อกไม่สำเร็จ");
    }

    i++;
    setTimeout(playNext, 1200);
  }

  // เผื่อเวลาให้ fetch + decode เสียงเสร็จก่อนเริ่มทดสอบ
  setTimeout(playNext, 1000);
}