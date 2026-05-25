const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    players: [],
    dealerIndex: -1,
    maxBetLimit: 0,
    currentPlayerBettingIndex: -1,
    statusText: "รอผู้เล่นเข้าโต๊ะและตั้งเจ้ามือ..."
};

const avatars = ["👦", "👧", "👨", "👩", "🧔", "🕶️", "🦊", "🦁", "🐼", "🐨", "🤖"];
const cardSuits = ['♥️', '♦️', '♣️', '♠️'];
const cardValues = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

io.on('connection', (socket) => {
    socket.emit('updateGame', gameState);

    socket.on('joinTable', (data) => {
        
    // 1. เช็คจากชื่อ (Name)
    const nameExists = gameState.players.find(p => p.name === data.name);
    
    // 2. เช็คจาก Socket ID (ป้องกันคนเดิมเปิดหลายจอหรือกดซ้ำ)
    const socketExists = gameState.players.find(p => p.id === socket.id);

    if (nameExists || socketExists) {
        socket.emit('alert', 'คุณอยู่ในโต๊ะเรียบร้อยแล้ว');
        return;
    }


    if (gameState.players.length >= 8) {
      socket.emit('alert', 'โต๊ะเต็มแล้ว');
      return;
    }

    // เพิ่มข้อมูลผู้เล่นใหม่ลงไปให้ครบ
    gameState.players.push({
      id: socket.id,
      name: data.name,
      money: data.money || 0,
      bet: 0,
      cards: [],
      score: 0,
      scoreText: ""
    });

    io.emit('updateGame', gameState); // ส่งข้อมูลใหม่ให้ทุกคนในโต๊ะ


        if (gameState.players.length >= 8) { socket.emit('alert', 'โต๊ะเต็มแล้ว'); return; }
        gameState.players.push({ id: socket.id, name: data.name, money: data.money, bet: 0, score: 0, scoreText: "" });
        gameState.statusText = `คุณ ${data.name} เข้านั่งแล้ว`;
        io.emit('updateGame', gameState);
    });

    socket.on('claimDealer', (data) => {
        const pIdx = gameState.players.findIndex(p => p.id === socket.id);
        if (pIdx === -1) return;
        if (gameState.dealerIndex === -1) {
            gameState.dealerIndex = pIdx;
            gameState.maxBetLimit = data.limit || 50;
            gameState.statusText = `👑 เจ้ามือคือ ${gameState.players[pIdx].name}`;
        } else if (gameState.dealerIndex === pIdx) {
            gameState.dealerIndex = -1;
            gameState.statusText = "เจ้ามือลงจากตำแหน่ง";
        }
        io.emit('updateGame', gameState);
    });

    socket.on('startGame', () => {
        if (gameState.players.length < 2 || gameState.dealerIndex === -1) return;
        gameState.players.forEach(p => { p.scoreText = ""; p.bet = 0; });
        gameState.currentPlayerBettingIndex = 0;
        if (gameState.currentPlayerBettingIndex === gameState.dealerIndex) gameState.currentPlayerBettingIndex++;
        gameState.statusText = `รอบวางเดิมพัน: ตาของ ${gameState.players[gameState.currentPlayerBettingIndex].name}`;
        io.emit('updateGame', gameState);
    });

    socket.on('submitBet', (amount) => {
        let currIdx = gameState.currentPlayerBettingIndex;
        if (currIdx === -1 || gameState.players[currIdx].id !== socket.id) return;
        gameState.players[currIdx].bet = amount;
        gameState.currentPlayerBettingIndex++;
        if (gameState.currentPlayerBettingIndex === gameState.dealerIndex) gameState.currentPlayerBettingIndex++;
        if (gameState.currentPlayerBettingIndex >= gameState.players.length) dealCards();
        else gameState.statusText = `รอบวางเดิมพัน: ตาของ ${gameState.players[gameState.currentPlayerBettingIndex].name}`;
        io.emit('updateGame', gameState);
    });
});
function dealCards() {
    gameState.players.forEach((p) => {
        let c1 = cardValues[Math.floor(Math.random() * cardValues.length)] + cardSuits[Math.floor(Math.random() * 4)];
        let c2 = cardValues[Math.floor(Math.random() * cardValues.length)] + cardSuits[Math.floor(Math.random() * 4)];
        p.scoreText = `${c1} ${c2}`;
    });
    gameState.statusText = "แจกไพ่แล้ว!";
    gameState.currentPlayerBettingIndex = -1;
}

server.listen(process.env.PORT || 3000, () => console.log('Server is running'));
