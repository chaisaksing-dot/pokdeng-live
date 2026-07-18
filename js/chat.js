/* =====================================================
   chat.js
   แชทในห้อง — เก็บข้อความไว้ที่ rooms/{roomId}/chat
   ===================================================== */

function listenChat(roomId) {
  if (chatListenerRef) chatListenerRef.off();

  const box = el("chatMessages");
  if (box) box.innerHTML = "";

  chatListenerRef = db.ref("rooms/" + roomId + "/chat").limitToLast(50);
  chatListenerRef.on("child_added", snap => {
    appendChatMessage(snap.val());
  });
}

function stopChatListener() {
  if (chatListenerRef) chatListenerRef.off();
  chatListenerRef = null;

  const box = el("chatMessages");
  if (box) box.innerHTML = "";
}

function appendChatMessage(msg) {
  const box = el("chatMessages");
  if (!box || !msg) return;

  const isMe = String(msg.senderId) === String(myPlayerId);
  const line = document.createElement("div");
  line.className = "chat-line";
  line.innerHTML = `<span class="chat-name">${isMe ? "ฉัน" : shortName(msg.senderName || msg.senderId)}:</span>${escapeChatText(msg.text || "")}`;

  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function escapeChatText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sendChatMessage() {
  const input = el("chatInput");
  const text = input ? input.value.trim() : "";

  if (!text) return;
  if (!currentRoom || !currentRoom.id) return;

  const me = players.find(p => String(p.id || p.name) === String(myPlayerId));
  const senderName = me ? (me.displayName || me.name) : myPlayerId;

  db.ref("rooms/" + currentRoom.id + "/chat").push({
    senderId: myPlayerId,
    senderName,
    text: text.slice(0, 200),
    ts: Date.now()
  });

  if (input) input.value = "";
}