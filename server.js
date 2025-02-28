const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let waitingPlayers = [];
let rooms = {};

io.on("connection", (socket) => {
  console.log(`🔗 Người chơi kết nối: ${socket.id}`);

  socket.on("find_match", (playerData) => {
    waitingPlayers.push({ id: socket.id, ...playerData, ready: false, readyTimestamp: null });
    if (waitingPlayers.length >= 2) {
      const p1 = waitingPlayers.shift();
      const p2 = waitingPlayers.shift();
      const roomId = `room_${p1.id}_${p2.id}`;
      rooms[roomId] = { players: [p1, p2] };
      socket.join(roomId);
      io.to(p1.id).emit("match_found", { roomId, opponent: p2 });
      io.to(p2.id).emit("match_found", { roomId, opponent: p1 });
      console.log(`✅ Ghép cặp: ${p1.id} vs ${p2.id} vào ${roomId}`);
    }
  });

  socket.on("player_ready", ({ roomId, playerId }) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      room.players.forEach(p => {
        if (p.id === playerId) {
          p.ready = true;
          p.readyTimestamp = Date.now();
        }
      });
      room.players.forEach(p => {
        if (p.id !== playerId) {
          io.to(p.id).emit("opponent_ready");
        }
      });
      if (room.players.every(p => p.ready)) {
        let p1 = room.players[0];
        let p2 = room.players[1];
        let spawn1, spawn2, color1, color2;
        if (p1.readyTimestamp <= p2.readyTimestamp) {
          spawn1 = { x: 50, y: 50 };      // sẵn sàng trước: góc trên bên trái
          spawn2 = { x: 750, y: 550 };    // sẵn sàng sau: góc dưới bên phải
          color1 = "blue";
          color2 = "red";
        } else {
          spawn1 = { x: 750, y: 550 };
          spawn2 = { x: 50, y: 50 };
          color1 = "red";
          color2 = "blue";
        }
        room.players.forEach(p => {
          let assignedSpawn, assignedColor, opponentData;
          if (p.id === p1.id) {
            assignedSpawn = spawn1;
            assignedColor = color1;
            opponentData = p2;
          } else {
            assignedSpawn = spawn2;
            assignedColor = color2;
            opponentData = p1;
          }
          io.to(p.id).emit("both_players_ready", { roomId, spawn: assignedSpawn, color: assignedColor, opponent: opponentData });
        });
      }
    }
  });

  socket.on("player_move", ({ roomId, playerId, key }) => {
    io.to(roomId).emit("update_game", { playerId, key });
  });

  socket.on("disconnect", () => {
    console.log(`❌ Người chơi rời khỏi: ${socket.id}`);
    waitingPlayers = waitingPlayers.filter((p) => p.id !== socket.id);
    for (const roomId in rooms) {
      if (rooms[roomId].players.some((p) => p.id === socket.id)) {
        socket.to(roomId).emit("opponent_left");
        delete rooms[roomId];
      }
    }
  });
});

server.listen(3000, () => {
  console.log("🚀 Server đang chạy trên cổng 3000");
});
