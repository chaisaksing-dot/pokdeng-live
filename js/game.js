/* =====================================================
   game.js
   กติกาไพ่ (getHandInfo / compareHands) + การแจกไพ่ / คิวเดิน / คิดผลแพ้ชนะ

   ลำดับใหญ่ไปเล็ก: ป๊อก > ตอง(x5) > 3ใบอักษร(x3, เสมอกันเสมอ)
   > เรียง(x3, เรียงใหญ่กว่าชนะ) > [3เด้ง/2เด้ง/ปกติ ตัดสินด้วยแต้ม
   โดย 3เด้ง(x3) และ 2เด้ง(x2) ยังได้ตัวคูณตอนชนะ]
   ===================================================== */

function createShuffledDeck() {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

function getCardRank(card) {
  const v = card.slice(0, -1);
  if (v === "A") return 1;
  if (v === "J") return 11;
  if (v === "Q") return 12;
  if (v === "K") return 13;
  return Number(v);
}

const STRAIGHT_SEQUENCES = [
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
  "1,12,13" // Q-K-A: เรียงสูงสุด (A นับสูงสุดในเรียงนี้เท่านั้น)
];

function isStraight(arr) {
  if (arr.length !== 3) return { match: false, seqIndex: -1 };

  const ranks = arr.map(getCardRank).sort((a, b) => a - b).join(",");
  const seqIndex = STRAIGHT_SEQUENCES.indexOf(ranks);

  return { match: seqIndex !== -1, seqIndex };
}

// rankTier > 0 หมายถึงมือที่ชนะได้ทันทีโดยไม่ต้องดูแต้ม (auto-win tier)
// rankTier = 0 หมายถึงต้องเทียบแต้ม (ปกติ, 3เด้ง, 2เด้ง)
function getHandInfo(cardList) {
  const arr = Object.values(cardList || []);
  const point = getPoint(arr);

  if (arr.length === 0) {
    return { type: "normal", label: "ปกติ", point, multiplier: 1, rankTier: 0, tieValue: 0 };
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

  const straightInfo = isStraight(arr);

  const isSameSuitThree =
    arr.length === 3 &&
    suits.every(s => s === suits[0]);

  const isPair =
    arr.length === 2 &&
    (values[0] === values[1] || suits[0] === suits[1]);

  // 1) ตอง — ใหญ่สุด เทียบด้วยเลขไพ่ (K ใหญ่สุด, A ต่ำสุด)
  if (isThreeSame) {
    return {
      type: "tong",
      label: "ตอง",
      point,
      multiplier: 5,
      rankTier: 3,
      tieValue: getCardRank(arr[0])
    };
  }

  // 2) 3 ใบอักษร (J/Q/K) — เจอกันเสมอเท่ากันหมด ไม่สนดอก
  if (isJQK) {
    return { type: "letters", label: "3 ใบอักษร", point, multiplier: 3, rankTier: 2, tieValue: 0 };
  }

  // 3) เรียง (3 ใบเรียงติดกัน ไม่ต้องดอกเดียวกัน) — เรียงใหญ่กว่าชนะ
  if (straightInfo.match) {
    return {
      type: "straight",
      label: "เรียง",
      point,
      multiplier: 3,
      rankTier: 1,
      tieValue: straightInfo.seqIndex
    };
  }

  // 4) 3 เด้ง (3 ใบดอกเดียวกัน ไม่เรียง) — ไม่ auto-win ต้องเทียบแต้ม ได้ตัวคูณตอนชนะ
  if (isSameSuitThree) {
    return { type: "threeFlush", label: "3 เด้ง", point, multiplier: 3, rankTier: 0, tieValue: 0 };
  }

  // 5) 2 เด้ง (ไพ่คู่ 2 ใบ เลขเดียวกันหรือดอกเดียวกัน) — ไม่ auto-win ต้องเทียบแต้ม ได้ตัวคูณตอนชนะ
  if (isPair) {
    return { type: "pair", label: "2 เด้ง", point, multiplier: 2, rankTier: 0, tieValue: 0 };
  }

  // 6) ไพ่ธรรมดา — ดูแต้มอย่างเดียว
  return { type: "normal", label: "ปกติ", point, multiplier: 1, rankTier: 0, tieValue: 0 };
}

function getMultiplier(cardList) {
  return getHandInfo(cardList).multiplier;
}

function compareHands(playerInfo, bankerInfo) {
  // ตอง / 3ใบอักษร / เรียง ชนะข้ามแต้มได้เสมอ (auto-win tier)
  if (playerInfo.rankTier > 0 || bankerInfo.rankTier > 0) {
    if (playerInfo.rankTier !== bankerInfo.rankTier) {
      return playerInfo.rankTier > bankerInfo.rankTier ? "win" : "lose";
    }

    // rankTier เท่ากัน แปลว่าเป็นมือประเภทเดียวกัน (ตอง-ตอง / 3ใบอักษร-3ใบอักษร / เรียง-เรียง)
    if (playerInfo.type === "letters") return "draw"; // 3 ใบอักษรเจอกันเสมอเสมอ

    if (playerInfo.tieValue > bankerInfo.tieValue) return "win";
    if (playerInfo.tieValue < bankerInfo.tieValue) return "lose";
    return "draw";
  }

  // เหลือแต่มือที่ต้องดูแต้ม (ปกติ / 3เด้ง / 2เด้ง ผสมกันได้)
  if (playerInfo.point > bankerInfo.point) return "win";
  if (playerInfo.point < bankerInfo.point) return "lose";
  return "draw";
}

function moneyText(n) {
  const num = Number(n || 0);
  return num > 0 ? "+" + num : String(num);
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
    playSound("soundDeal");
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
  const tongRate = (currentRoom?.tongPercent || 0) / 100;
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
        tong = Math.floor(gross * tongRate);
      }

      playerNet = gross - tong;
      bankerMoney -= gross;
      tongTotal += tong;
    }

    if (result === "lose") {
      gross = bet * bankerInfo.multiplier;

      let bankerTong = 0;
      if (bankerInfo.multiplier >= 2) {
        bankerTong = Math.floor(gross * tongRate);
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
    String(playerId) !== String(banker.id)
  ) {
    db.ref("rooms/" + currentRoom.id).update({
      turnOrder: [...currentRoom.turnOrder, banker.id],
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