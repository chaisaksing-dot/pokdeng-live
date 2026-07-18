/* =====================================================
   main.js
   ผูกฟังก์ชันเข้ากับ window (ให้ onclick="..." ใน HTML เรียกได้)
   + จัดการตอนเปิดหน้าเว็บครั้งแรก (window.onload)
   ต้องโหลดเป็นไฟล์สุดท้าย หลังจากไฟล์อื่นๆ ทั้งหมด
   ===================================================== */

window.autoLogin = autoLogin;
window.loginLine = loginLine;
window.logout = logout;
window.showPage = showPage;

window.openAdmin = openAdmin;
window.addAdmin = addAdmin;
window.removeAdmin = removeAdmin;

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.joinOpenRoom = joinOpenRoom;
window.leaveRoom = leaveRoom;
window.copyInviteLink = copyInviteLink;
window.kickPlayer = kickPlayer;
window.requestTransferBanker = requestTransferBanker;
window.closeRoom = closeRoom;
window.newRound = newRound;
window.playerReady = playerReady;
window.claimBanker = claimBanker;

window.dealCards = dealCards;
window.playerDraw = playerDraw;
window.playerStand = playerStand;
window.bankerDraw = bankerDraw;
window.bankerStand = bankerStand;

window.setBet = setBet;
window.updateMaxLose = updateMaxLose;
window.toggleRules = toggleRules;

window.showMoneyBox = showMoneyBox;
window.submitMoneyRequest = submitMoneyRequest;
window.topUp = topUp;
window.withdraw = withdraw;

window.sendChatMessage = sendChatMessage;
window.toggleVideo = toggleVideo;
window.toggleMic = toggleMic;

window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  const savedId = localStorage.getItem("playerId");
  const hasLineProfile = !!localStorage.getItem("lineName");

  if (roomId) {
    localStorage.setItem("pendingRoomId", roomId);

    // ข้ามหน้า login อัตโนมัติได้เฉพาะตอนที่เคย login LINE จริงจากเครื่องนี้มาก่อน
    // (มีชื่อ/รูปเก็บไว้แล้ว) ไม่งั้นจะเข้าห้องแบบไม่มีรูปเหมือนที่เจอ
    if (savedId && hasLineProfile) {
      loginWithId(savedId, roomId);
    } else {
      showPage("loginPage");
    }
    return;
  }

  showPage("loginPage");
};