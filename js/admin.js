/* =====================================================
   admin.js
   หน้าแอดมิน: เพิ่ม/ลบแอดมิน, ดูรายงานค่าต๋งสะสม
   ===================================================== */

function openAdmin() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return alert("กรุณาเข้าสู่ระบบก่อน");

  checkAdminRole(playerId).then(() => {
    if (!myAdminRole) return alert("คุณไม่มีสิทธิ์เข้าแอดมิน");
    showPage("adminPage");
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