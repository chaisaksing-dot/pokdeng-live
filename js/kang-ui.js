/* =====================================================
   kang-ui.js
   วาดหน้าจอห้องไพ่แคง — ใช้ style เดียวกับป๊อกเด้ง (.mini-card, .btn, ฯลฯ)
   ===================================================== */

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

  el("kangPlayersList").innerHTML = kangPlayers.map(p => {
    const isTurn = kangCurrentRoom.status === "playing" && (kangCurrentRoom.turnOrder || [])[kangCurrentRoom.turnIndex] === p.id;
    const cardCount = kangCurrentRoom.status !== "waiting" ? (p.hand || []).length : 0;
    return `<div class="player-row ${isTurn ? "turn" : ""}" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.1); font-size:0.85rem;">
      <span>${shortName(p.name)}${p.id === kangCurrentRoom.creatorId ? " 👑" : ""} ${isTurn ? "⬅️ ตานี้" : ""}</span>
      <span>เงิน ${p.money} ${kangCurrentRoom.status !== "waiting" ? "| ไพ่ " + cardCount + " ใบ" : (p.ready ? "✅" : "⏳")}</span>
    </div>`;
  }).join("");

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

    const hand = (meP && meP.hand) || [];
    el("kangMyHand").innerHTML = hand.map((c, i) => {
      const label = kangShowCardLabel(c);
      const selected = kangSelectedCardIndices.includes(i);
      return `<button type="button" onclick="kangToggleCardSelect(${i})" class="${label.isRed ? "red-card" : "black-card"}" style="${selected ? "background:#c9a227;" : ""}">${label.text}</button>`;
    }).join("");

    const actionBox = el("kangActionButtons");
    if (actionBox) actionBox.style.display = kangIsMyTurn() ? "block" : "none";
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