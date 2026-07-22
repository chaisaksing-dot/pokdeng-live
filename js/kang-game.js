/* =====================================================
   kang-game.js
   ตรรกะเกมไพ่แคง (ไม่มีเจ้ามือ, 2-6 คน, แจกคนละ 5 ใบ, แต้มน้อยสุดชนะ)
   ตั้งชื่อฟังก์ชัน/ตัวแปรขึ้นต้นด้วย kang เพื่อไม่ชนกับ game.js ของป๊อกเด้ง
   ===================================================== */

const KANG_SUITS = ["♠", "♥", "♦", "♣"];
const KANG_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function kangCreateDeck() {
  const deck = [];
  KANG_SUITS.forEach(s => KANG_RANKS.forEach(r => deck.push(r + s)));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function kangCardRank(card) {
  // ตัด suit ตัวสุดท้ายออก รองรับ "10" ที่มี 2 ตัวอักษร
  return card.slice(0, -1);
}

function kangCardSuit(card) {
  return card.slice(-1);
}

function kangCardValue(card) {
  const r = kangCardRank(card);
  if (r === "A") return 1;
  if (r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

function kangCardOrder(card) {
  // ลำดับไพ่ A=1 ... K=13 สำหรับเช็คเรียง/ตรวจชุด (ไม่รองรับ A สูงแบบ Q-K-A)
  return KANG_RANKS.indexOf(kangCardRank(card)) + 1;
}

function kangGetHandTotal(cards) {
  return (cards || []).reduce((sum, c) => sum + kangCardValue(c), 0);
}

/* ตรวจไพ่พิเศษตอนแจก 5 ใบแรก — คืนค่า { type, label } หรือ null ถ้าไม่มี
   ลำดับใหญ่ไปเล็ก: สเตรทฟลัช > โฟร์การ์ด > ฟูลเฮาส์ > สี > เรียง > ตอง */
function kangDetectSpecialHand(cards) {
  if (!cards || cards.length !== 5) return null;

  const ranks = cards.map(kangCardRank);
  const suits = cards.map(kangCardSuit);
  const orders = cards.map(kangCardOrder).sort((a, b) => a - b);

  const isFlush = suits.every(s => s === suits[0]);
  const isSequential = orders.every((o, i) => i === 0 || o === orders[i - 1] + 1);

  const rankCounts = {};
  ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  if (isFlush && isSequential) {
    return { type: "straightFlush", label: "สเตรทฟลัช" };
  }
  if (counts[0] === 4) {
    return { type: "fourCard", label: "โฟร์การ์ด" };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { type: "fullHouse", label: "ฟูลเฮาส์" };
  }
  if (isFlush) {
    return { type: "flush", label: "สี" };
  }
  if (isSequential) {
    return { type: "straight", label: "เรียง" };
  }
  if (counts[0] === 3) {
    return { type: "threeOfKind", label: "ตอง" };
  }
  return null;
}

/* หาผู้ชนะรอบจากแต้มรวมต่ำสุด — คืน { winnerId, lowestTotal, totals: {playerId: total} } */
function kangFindRoundWinner(playerHands) {
  // playerHands: [{ id, cards }]
  const totals = {};
  let winnerId = null;
  let lowestTotal = Infinity;

  playerHands.forEach(p => {
    const total = kangGetHandTotal(p.cards);
    totals[p.id] = total;
    if (total < lowestTotal) {
      lowestTotal = total;
      winnerId = p.id;
    }
  });

  return { winnerId, lowestTotal, totals };
}

/* คิดผลตอนจบรอบ (มีคนแคง)
   declarerId: คนที่กดแคง, playerHands: [{id, cards}], baseBet: เดิมพันหลัก
   คืน { winnerId, declarerWon, totals, payments: {playerId: netAmount} } */
function kangSettleRound(playerHands, declarerId, baseBet) {
  const { winnerId, totals } = kangFindRoundWinner(playerHands);
  const declarerWon = winnerId === declarerId;
  const payments = {};
  playerHands.forEach(p => { payments[p.id] = 0; });

  if (declarerWon) {
    // คนแคงชนะจริง — คนแพ้ทุกคนจ่ายเท่ากันให้ผู้ชนะตามเดิมพันหลัก
    playerHands.forEach(p => {
      if (p.id === winnerId) return;
      payments[p.id] -= baseBet;
      payments[winnerId] += baseBet;
    });
  } else {
    // คนแคงพลาด — ต้องจ่ายทุกคนในวงคนละเดิมพันหลัก (บทลงโทษ)
    playerHands.forEach(p => {
      if (p.id === declarerId) return;
      payments[declarerId] -= baseBet;
      payments[p.id] += baseBet;
    });
  }

  return { winnerId, declarerWon, totals, payments };
}

/* คิดค่าปรับ "ไหล" — feederId คือคนที่ทิ้งไพ่ใบที่โดนไหล, allPlayerIds คือทุกคนในวง (รวม feeder)
   คืน { payments: {playerId: netAmount} } — feeder จ่าย 5% ของ baseBet ให้ทุกคนที่เหลือ */
function kangFlowPenalty(feederId, allPlayerIds, baseBet) {
  const perPerson = Math.floor(baseBet * 0.05);
  const payments = {};
  allPlayerIds.forEach(id => { payments[id] = 0; });

  allPlayerIds.forEach(id => {
    if (id === feederId) return;
    payments[feederId] -= perPerson;
    payments[id] += perPerson;
  });

  return { payments, perPerson };
}

/* กรณีพิเศษ: ไหลแล้วไพ่หมดมือพอดี = "ชนะน็อค" — นอกจากผลรอบปกติ (ผู้เล่นที่ไหลชนะ)
   คนที่ถูกไหล (ต้นทาง) ต้องจ่ายเพิ่มอีก 10% ของ baseBet ให้ทุกคนในวง (คนละก้อน แยกจากค่าปรับไหลปกติ 5%)
   คืน { payments: {playerId: netAmount} } */
function kangFlowKnockoutPenalty(feederId, allPlayerIds, baseBet) {
  const perPerson = Math.floor(baseBet * 0.10);
  const payments = {};
  allPlayerIds.forEach(id => { payments[id] = 0; });

  allPlayerIds.forEach(id => {
    if (id === feederId) return;
    payments[feederId] -= perPerson;
    payments[id] += perPerson;
  });

  return { payments, perPerson };
}

/* เช็คว่าไพ่ที่จะทิ้งพร้อมกัน (ตอนจั่วแล้วทิ้ง 2 ใบ) แต้มเดียวกันจริงไหม */
function kangCanDiscardPair(card1, card2) {
  return kangCardRank(card1) === kangCardRank(card2);
}

/* เช็คว่าไพ่ที่จะ "ไหล" ได้ไหม — ต้องแต้มเดียวกับใบล่าสุดที่คนก่อนทิ้ง */
function kangCanFlow(cardToDiscard, lastDiscardedCard) {
  if (!lastDiscardedCard) return false;
  return kangCardRank(cardToDiscard) === kangCardRank(lastDiscardedCard);
}