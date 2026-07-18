/* =====================================================
   video.js
   วิดีโอ 8 กล้อง ผ่าน WebRTC (mesh) — ใช้ Firebase เป็น signaling server
   ข้อจำกัด: มี STUN server ฟรีเท่านั้น (ไม่มี TURN) อาจต่อไม่ติดบางเครือข่าย
   ===================================================== */

let offerWatcherRef = null;
const peerListenerRefs = {}; // { remoteId: { answerRef, iceRef } }

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

function pairKey(a, b) {
  return [String(a), String(b)].sort().join("__");
}

function getVideoGrid() {
  return el("videoGrid");
}

function addLocalVideoTile() {
  const grid = getVideoGrid();
  if (!grid) return;

  let tile = document.getElementById("vt-" + myPlayerId);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = "vt-" + myPlayerId;
    tile.innerHTML = `<video autoplay muted playsinline></video><div class="video-name">ฉัน</div>`;
    grid.appendChild(tile);
  }

  const video = tile.querySelector("video");
  if (video) video.srcObject = localStream;
}

function attachRemoteStream(remoteId, stream) {
  const grid = getVideoGrid();
  if (!grid) return;

  let tile = document.getElementById("vt-" + remoteId);
  if (!tile) {
    const p = players.find(x => String(x.id || x.name) === String(remoteId));
    const name = p ? (p.displayName || p.name) : remoteId;

    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = "vt-" + remoteId;
    tile.innerHTML = `<video autoplay playsinline></video><div class="video-name">${shortName(name)}</div>`;
    grid.appendChild(tile);
  }

  const video = tile.querySelector("video");
  if (video) video.srcObject = stream;
}

function removeVideoTile(id) {
  const tile = document.getElementById("vt-" + id);
  if (tile) tile.remove();
}

function createPeerConnection(remoteId, isOfferer) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = e => attachRemoteStream(remoteId, e.streams[0]);

  const key = pairKey(myPlayerId, remoteId);
  const myIceField = isOfferer ? "iceOfferer" : "iceAnswerer";

  pc.onicecandidate = e => {
    if (e.candidate && currentRoom?.id) {
      db.ref(`rooms/${currentRoom.id}/webrtc/${key}/${myIceField}`).push(e.candidate.toJSON());
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      removePeer(remoteId);
    }
  };

  peerConnections[remoteId] = pc;
  return pc;
}

async function initiateCall(remoteId) {
  if (!currentRoom?.id || peerConnections[remoteId]) return;

  const key = pairKey(myPlayerId, remoteId);
  const pc = createPeerConnection(remoteId, true);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await db.ref(`rooms/${currentRoom.id}/webrtc/${key}/offer`).set({
      type: offer.type,
      sdp: offer.sdp
    });

    const answerRef = db.ref(`rooms/${currentRoom.id}/webrtc/${key}/answer`);
    answerRef.on("value", snap => {
      if (snap.exists() && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
      }
    });

    const iceRef = db.ref(`rooms/${currentRoom.id}/webrtc/${key}/iceAnswerer`);
    iceRef.on("child_added", snap => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });

    peerListenerRefs[remoteId] = { answerRef, iceRef };
  } catch (err) {
    console.error("initiateCall error", err);
  }
}

async function answerCall(remoteId) {
  if (!currentRoom?.id || peerConnections[remoteId]) return;

  const key = pairKey(myPlayerId, remoteId);

  try {
    const offerSnap = await db.ref(`rooms/${currentRoom.id}/webrtc/${key}/offer`).once("value");
    if (!offerSnap.exists()) return;

    const pc = createPeerConnection(remoteId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offerSnap.val()));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await db.ref(`rooms/${currentRoom.id}/webrtc/${key}/answer`).set({
      type: answer.type,
      sdp: answer.sdp
    });

    const iceRef = db.ref(`rooms/${currentRoom.id}/webrtc/${key}/iceOfferer`);
    iceRef.on("child_added", snap => {
      pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
    });

    peerListenerRefs[remoteId] = { iceRef };
  } catch (err) {
    console.error("answerCall error", err);
  }
}

function removePeer(remoteId) {
  const pc = peerConnections[remoteId];
  if (pc) {
    try { pc.close(); } catch (e) {}
    delete peerConnections[remoteId];
  }

  const refs = peerListenerRefs[remoteId];
  if (refs) {
    if (refs.answerRef) refs.answerRef.off();
    if (refs.iceRef) refs.iceRef.off();
    delete peerListenerRefs[remoteId];
  }

  removeVideoTile(remoteId);
}

// เฝ้าดู offer ที่เพิ่งมาใหม่ — ทุกคนเฝ้าดูตลอด แต่จะ "รับสาย" เฉพาะที่มาจากเจ้ามือเท่านั้น
// (โหมดกล้องเจ้ามือคนเดียว: มีแต่เจ้ามือที่เปิดกล้อง/ส่งสายเรียก ผู้เล่นคนอื่นเป็นฝ่ายรับชมอย่างเดียว)
function watchIncomingOffers(roomId) {
  if (offerWatcherRef) offerWatcherRef.off();

  offerWatcherRef = db.ref("rooms/" + roomId + "/webrtc");

  const handle = (key, data) => {
    if (!data || !data.offer || data.answer) return;

    const ids = key.split("__");
    if (!ids.includes(String(myPlayerId))) return;

    const remoteId = ids.find(id => id !== String(myPlayerId));
    if (!remoteId || peerConnections[remoteId]) return;

    const banker = getBanker();
    const bankerId = banker ? String(banker.id || banker.name) : null;

    // รับสายเฉพาะที่มาจากเจ้ามือเท่านั้น
    if (bankerId && remoteId === bankerId) {
      answerCall(remoteId);
    }
  };

  offerWatcherRef.on("child_added", snap => handle(snap.key, snap.val()));
  offerWatcherRef.on("child_changed", snap => handle(snap.key, snap.val()));
}

// เรียกจาก room.js ทุกครั้งที่รายชื่อผู้เล่นในห้องเปลี่ยน
// เฉพาะเจ้ามือเท่านั้นที่จะเป็นฝ่ายเปิดสายหาผู้เล่นทุกคน
function syncVideoPeers() {
  if (!currentRoom?.id || !myVideoStarted) return;

  const banker = getBanker();
  const amIBanker = banker && String(banker.id || banker.name) === String(myPlayerId);
  if (!amIBanker) return;

  const others = players
    .filter(p => String(p.id || p.name) !== String(myPlayerId))
    .map(p => String(p.id || p.name));

  others.forEach(remoteId => {
    if (!peerConnections[remoteId]) {
      initiateCall(remoteId);
    }
  });

  Object.keys(peerConnections).forEach(remoteId => {
    if (!others.includes(remoteId)) {
      removePeer(remoteId);
    }
  });
}

async function toggleVideo() {
  const banker = getBanker();
  const amIBanker = banker && String(banker.id || banker.name) === String(myPlayerId);

  if (!amIBanker) {
    alert("เฉพาะเจ้ามือเท่านั้นที่เปิดกล้องได้");
    return;
  }

  if (!myVideoStarted) {
    if (!currentRoom || !currentRoom.id) return alert("ต้องอยู่ในห้องก่อน");

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      alert("เปิดกล้อง/ไมค์ไม่สำเร็จ: " + err.message);
      return;
    }

    myVideoStarted = true;
    addLocalVideoTile();

    const btn = el("videoToggleBtn");
    if (btn) btn.innerText = "🎥 ปิดกล้อง";

    const micBtn = el("micToggleBtn");
    if (micBtn) micBtn.style.display = "inline-block";

    watchIncomingOffers(currentRoom.id);
    syncVideoPeers();
  } else {
    stopVideo();
  }
}

function toggleMic() {
  if (!localStream) return;

  myMicMuted = !myMicMuted;
  localStream.getAudioTracks().forEach(t => { t.enabled = !myMicMuted; });

  const btn = el("micToggleBtn");
  if (btn) btn.innerText = myMicMuted ? "🔇 เปิดไมค์" : "🎤 ปิดไมค์";
}

function stopVideo() {
  Object.keys(peerConnections).forEach(id => removePeer(id));

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  myVideoStarted = false;
  myMicMuted = false;
  removeVideoTile(myPlayerId);

  if (offerWatcherRef) {
    offerWatcherRef.off();
    offerWatcherRef = null;
  }

  const btn = el("videoToggleBtn");
  if (btn) btn.innerText = "🎥 เปิดกล้อง";

  const micBtn = el("micToggleBtn");
  if (micBtn) micBtn.style.display = "none";
}