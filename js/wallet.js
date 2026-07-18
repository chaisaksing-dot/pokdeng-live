/* =====================================================
   wallet.js
   แจ้งโอนเงิน / แจ้งถอนเงิน / เติม-ถอนเครดิต (แอดมิน)
   ===================================================== */

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