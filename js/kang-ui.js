/* =====================================================
   kang-ui.js
   วาดหน้าจอห้องไพ่แคง — ใช้ style เดียวกับป๊อกเด้ง (.mini-card, .btn, ฯลฯ)
   ===================================================== */

let kangHandRevealed = false;
let kangLastSeenRoundNumber = null;

function kangRevealHand() {
  kangHandRevealed = true;
  kangRender();
}

function kangShowCardLabel(card) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const isRed = suit === "♥" || suit === "♦";
  return { text: rank + suit, isRed };
}

function kangRender() {
  if (!kangCurrentRoom) return;

  el("kangRoomIdText").innerText = kangCurrentRoom.id;
  el("kangBaseBetText").innerText = kangCurrentRoom.baseBet;

  let statusText =
    kangCurrentRoom.status === "waiting" ? "รอผู้เล่น" :
    kangCurrentRoom.status === "playing" ? "กำลังเล่น" : "จบรอบ";

  if (kangCurrentRoom.status === "waiting" && kangPlayers.length >= 2) {
    const worstCase = kangCurrentRoom.baseBet * (kangPlayers.length - 1);
    statusText += " | ต้องมีเงินสำรองอย่างน้อย " + worstCase + " ต่อคน";
  }
  el("kangStatusText").innerText = statusText;

  for (let i = 1; i <= 6; i++) {
    const seat = el("kangSeat" + i);
    if (seat) seat.innerHTML = "";
    const seatBox = seat ? seat.closest(".kang-seat") : null;
    if (seatBox) seatBox.classList.remove("turn");
  }

  kangPlayers.forEach((p, i) => {
    const seat = el("kangSeat" + (i + 1));
    if (!seat) return;

    const isTurn = kangCurrentRoom.status === "playing" && (kangCurrentRoom.turnOrder || [])[kangCurrentRoom.turnIndex] === p.id;
    const seatBox = seat.closest(".kang-seat");
    if (seatBox && isTurn) seatBox.classList.add("turn");

    const cardCount = kangCurrentRoom.status !== "waiting" ? (p.hand || []).length : 0;
    const photoUrl = p.photo || "https://via.placeholder.com/50";
    const statusLine = kangCurrentRoom.status === "waiting"
      ? (p.ready ? "✅ พร้อม" : "⏳ ยังไม่พร้อม")
      : "";

    let stackHtml = "";
    if (kangCurrentRoom.status !== "waiting" && cardCount > 0) {
      const offset = Math.min(10, Math.floor(60 / cardCount));
      let cards = "";
      for (let n = 0; n < cardCount; n++) {
        cards += `<div class="mini-card back" style="position:absolute; left:${n * offset}px; z-index:${n};"></div>`;
      }
      stackHtml = `<div class="kang-hand-stack">${cards}</div><div class="player-money" style="text-align:center;">${cardCount} ใบ</div>`;
    }

    seat.innerHTML = `
      <div class="player-box-ui">
        <img src="${photoUrl}" class="player-photo">
        <div class="player-info-text">
          <div class="player-name">${p.id === kangCurrentRoom.creatorId ? "👑 " : ""}${shortName(p.name)}${isTurn ? " ⬅️" : ""}</div>
          <div class="player-money">เงิน: ${p.money}</div>
          ${statusLine ? `<div class="player-money">${statusLine}</div>` : ""}
        </div>
      </div>
      ${stackHtml}
    `;
  });

  const meP = kangMe();
  const isCreator = kangCurrentRoom.creatorId === myPlayerId;

  const readyBtn = el("kangReadyBtn");
  if (readyBtn) readyBtn.style.display = kangCurrentRoom.status === "waiting" && !(meP && meP.ready) ? "inline-block" : "none";

  const startBtn = el("kangStartBtn");
  if (startBtn) startBtn.style.display = (isCreator && kangCurrentRoom.status === "waiting" && kangPlayers.length >= 2 && kangPlayers.every(p => p.ready)) ? "inline-block" : "none";

  const showTable = kangCurrentRoom.status === "playing" || kangCurrentRoom.status === "finished";
  el("kangTableCard").style.display = showTable ? "block" : "none";
  el("kangResultCard").style.display = kangCurrentRoom.status === "finished" ? "block" : "none";

  if (showTable) {
    el("kangDeckCountText").innerText = Array.isArray(kangCurrentRoom.deck) ? kangCurrentRoom.deck.length : "-";
    const centerText = el("kangStatusCenterText");
    if (centerText) {
      centerText.innerText = kangCurrentRoom.status === "finished" ? "จบรอบแล้ว" : "กำลังเล่น";
    }

    const pile = kangCurrentRoom.discardPile || [];
    const topCard = pile[pile.length - 1];
    const discardBox = el("kangDiscardTop");
    if (topCard) {
      const label = kangShowCardLabel(topCard);
      discardBox.className = "mini-card" + (label.isRed ? " red-card" : " black-card");
      discardBox.innerText = label.text;
    } else {
      discardBox.className = "mini-card back";
      discardBox.innerText = "";
    }

    // รีเซ็ตการ "เปิดดูไพ่" ทุกครั้งที่เริ่มรอบใหม่ (เห็นแต่หลังไพ่ก่อนเสมอ)
    if (kangCurrentRoom.roundNumber !== kangLastSeenRoundNumber) {
      kangLastSeenRoundNumber = kangCurrentRoom.roundNumber;
      kangHandRevealed = false;
    }

    const hand = (meP && meP.hand) || [];
    const hiddenBox = el("kangHandHiddenBox");
    const shownBox = el("kangHandShownBox");

    if (!kangHandRevealed && hand.length > 0) {
      hiddenBox.style.display = "block";
      shownBox.style.display = "none";

      const offset = Math.min(14, Math.floor(160 / hand.length));
      let cards = "";
      for (let n = 0; n < hand.length; n++) {
        cards += `<div class="mini-card back" style="position:absolute; left:${n * offset}px; z-index:${n};"></div>`;
      }
      el("kangHiddenStack").innerHTML = cards;
    } else {
      hiddenBox.style.display = "none";
      shownBox.style.display = "block";

      el("kangMyHand").innerHTML = hand.map((c, i) => {
        const label = kangShowCardLabel(c);
        const selected = kangSelectedCardIndices.includes(i);
        return `<button type="button" onclick="kangToggleCardSelect(${i})" class="${label.isRed ? "red-card" : "black-card"}" style="${selected ? "background:#c9a227;" : ""}">${label.text}</button>`;
      }).join("");

      el("kangHandTotalText").innerText = kangGetHandTotal(hand);

      const actionBox = el("kangActionButtons");
      if (actionBox) actionBox.style.display = kangIsMyTurn() ? "block" : "none";
    }
  }

  if (kangCurrentRoom.status === "finished") {
    el("kangResultBox").innerText = kangCurrentRoom.result || "";
    const newRoundBtn = el("kangNewRoundBtn");
    if (newRoundBtn) newRoundBtn.style.display = isCreator ? "inline-block" : "none";
  }

  kangRenderMoneyWarning();
}

function kangRenderMoneyWarning() {
  const box = el("kangMoneyWarningBox");
  if (!box) return;

  const w = kangCurrentRoom.moneyWarning;
  if (!w) {
    box.style.display = "none";
    return;
  }

  const remainMs = Math.max(0, w.deadline - Date.now());
  const remainSec = Math.ceil(remainMs / 1000);
  const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
  const ss = String(remainSec % 60).padStart(2, "0");

  box.style.display = "block";
  box.innerHTML = `
    ⚠️ ${w.reasonLabel} (ต้องมีอย่างน้อย ${w.requiredAmount})<br>
    เหลือเวลาเติมเครดิต: ${mm}:${ss}<br>
    <button class="btn gold" onclick="kangRetryAfterTopUp()">✅ เติมแล้ว ลองอีกครั้ง</button>
    <button class="btn danger" onclick="kangSkipDueToMoneyWarning()">⏭️ ข้ามตานี้เลย</button>
  `;
}