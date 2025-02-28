const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Phục vụ file tĩnh (bao gồm index.html)
app.use(express.static(path.join(__dirname)));

// Khi truy cập "/", gửi file index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let waitingPlayers = []; // Danh sách người chơi chờ vào trận
let rooms = {}; // Lưu thông tin phòng chơi

io.on("connection", (socket) => {
  console.log(`🔗 Người chơi kết nối: ${socket.id}`);

  socket.on("find_match", (playerData) => {
    waitingPlayers.push({ id: socket.id, ...playerData, ready: false, readyTimestamp: null });
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      const roomId = `room_${player1.id}_${player2.id}`;
      
      rooms[roomId] = { players: [player1, player2] };

      const socket1 = io.sockets.sockets.get(player1.id);
      const socket2 = io.sockets.sockets.get(player2.id);
      if (socket1) socket1.join(roomId);
      if (socket2) socket2.join(roomId);

      io.to(player1.id).emit("match_found", { roomId, opponent: player2 });
      io.to(player2.id).emit("match_found", { roomId, opponent: player1 });

      console.log(`✅ Ghép cặp: ${player1.id} vs ${player2.id} vào ${roomId}`);
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
      // Thông báo cho đối thủ đã sẵn sàng
      room.players.forEach(p => {
        if (p.id !== playerId) {
          io.to(p.id).emit("opponent_ready");
        }
      });
      // Khi cả 2 đã sẵn sàng, thực hiện chuỗi xử lý sau:
      if (room.players.every(p => p.ready)) {
        // Sắp xếp theo thời gian sẵn sàng
        room.players.sort((a, b) => a.readyTimestamp - b.readyTimestamp);
        const spawn1 = { x: 50, y: 50 };      // Vị trí góc trên bên trái
        const spawn2 = { x: 750, y: 550 };     // Vị trí góc dưới bên phải
        const color1 = "blue";
        const color2 = "red";
        let p1 = room.players[0];
        let p2 = room.players[1];

        // Bước 1: Gửi thông báo "match_success" với đếm ngược 5 giây
        room.players.forEach(p => {
          io.to(p.id).emit("match_success", { roomId, countdown: 5 });
        });

        // Sau 5 giây, gửi thông báo "load_match" với thông tin spawn và đối thủ
        setTimeout(() => {
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
            io.to(p.id).emit("load_match", { roomId, spawn: assignedSpawn, color: assignedColor, opponent: opponentData });
          });
          // Sau 10 giây, gửi thông báo "start_game" cho cả 2
          setTimeout(() => {
            room.players.forEach(p => {
              io.to(p.id).emit("start_game");
            });
          }, 10000);
        }, 5000);
      }
    }
  });

  socket.on("player_move", ({ roomId, playerId, key }) => {
    io.to(roomId).emit("update_game", { playerId, key });
  });

  socket.on("disconnect", () => {
    console.log(`❌ Người chơi rời khỏi: ${socket.id}`);
    waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
    for (const roomId in rooms) {
      if (rooms[roomId].players.some(p => p.id === socket.id)) {
        socket.to(roomId).emit("opponent_left");
        delete rooms[roomId];
      }
    }
  });
});

server.listen(3000, () => {
  console.log("🚀 Server đang chạy trên cổng 3000");
});
