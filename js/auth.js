/* =====================================================
   auth.js
   เข้าสู่ระบบด้วย LINE, ออกจากระบบ, เช็คสิทธิ์แอดมิน
   (ระบบรหัสผู้เล่นเดิม + PIN ถูกยกเลิกแล้ว ใช้ LINE login เท่านั้น)
   ===================================================== */

function autoLogin() {
  showPage("loginPage");
}

function loginWithId(playerId, roomIdAfterLogin) {
  myPlayerId = String(playerId);
  localStorage.setItem("playerId", myPlayerId);

  const walletRef = db.ref("wallet/" + myPlayerId);
  walletRef.once("value").then(snap => {
    if (!snap.exists()) walletRef.set(1000);

    db.ref("users/" + myPlayerId).once("value").then(userSnap => {
      if (!userSnap.exists()) {
        db.ref("users/" + myPlayerId).set({
          id: myPlayerId,
          name: "ผู้เล่น " + myPlayerId,
          createdAt: Date.now()
        });
      }

      checkAdminRole(myPlayerId).then(() => {
        if (roomIdAfterLogin) {
          showPage("lobbyPage");
          setTimeout(() => {
            const joinInput = el("joinRoomId");
            if (joinInput) joinInput.value = roomIdAfterLogin;
            joinRoom();
          }, 500);
        } else {
          showPage("lobbyPage");
        }
      });
    });
  });
}

function checkAdminRole(playerId) {
  return db.ref("admins/" + playerId).once("value").then(snap => {
    if (String(playerId) === OWNER_ID && !snap.exists()) {
      db.ref("admins/" + playerId).set("owner");
      myAdminRole = "owner";
    } else {
      myAdminRole = snap.val() || null;
    }

    const adminBtn = el("adminBtn");
    if (adminBtn) {
      adminBtn.style.display = myAdminRole ? "inline-block" : "none";
    }

    return myAdminRole;
  });
}

function refreshUserInfo() {
  const playerId = localStorage.getItem("playerId") || myPlayerId;
  if (!playerId) return;

  db.ref("wallet/" + playerId).once("value").then(snap => {
    const money = Number(snap.val()) || 0;
    const box = el("userInfo");
    if (box) box.innerText = "รหัส: " + playerId + " | เครดิต: " + money;
  });
}

function logout() {
  localStorage.removeItem("playerId");
  myPlayerId = null;
  myAdminRole = null;
  stopTimer();
  if (roomListenerRef) roomListenerRef.off();
  if (openRoomsListenerRef) openRoomsListenerRef.off();
  showPage("loginPage");
}

async function loginLine() {
  try {
    await liff.init({
      liffId: LIFF_ID
    });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    let profile = null;

    try {
      profile = await liff.getProfile();
    } catch (err) {
      const token = liff.getDecodedIDToken();
      profile = {
        userId: token?.sub,
        displayName: token?.name || "LINE",
        pictureUrl: token?.picture || ""
      };
    }

    // เก็บชื่อสำรองให้ joinRoom ใช้ได้ทุกแบบ
    localStorage.setItem("lineName", profile.displayName);
    localStorage.setItem("linePicture", profile.pictureUrl || "");
    localStorage.setItem("playerId", profile.userId);

    const pendingRoomId = localStorage.getItem("pendingRoomId");
    if (pendingRoomId) {
      localStorage.removeItem("pendingRoomId");
      loginWithId(profile.userId, pendingRoomId);
      return;
    }

    loginWithId(profile.userId, null);
  } catch (err) {
    alert("ERROR: " + err.message);
  }
}