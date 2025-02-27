const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Server is running!");
});

let waitingPlayers = [];
let rooms = {};

io.on("connection", (socket) => {
  console.log(`🔗 Người chơi kết nối: ${socket.id}`);

  socket.on("find_match", (playerData) => {
    waitingPlayers.push({ id: socket.id, ...playerData });

    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      const roomId = `room_${player1.id}_${player2.id}`;

      rooms[roomId] = { players: [player1, player2] };
      socket.join(roomId);
      io.to(player1.id).emit("match_found", { roomId, opponent: player2 });
      io.to(player2.id).emit("match_found", { roomId, opponent: player1 });

      console.log(`✅ Ghép cặp: ${player1.id} vs ${player2.id} vào ${roomId}`);
    }
  });

  // 💡 Chỉ xử lý sự kiện "player_move" bên trong "connection"
  socket.on("player_move", ({ roomId, moveData }) => {
    socket.to(roomId).emit("update_game", moveData);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});
