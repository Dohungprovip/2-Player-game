const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // Phục vụ file tĩnh từ thư mục "public"

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Route kiểm tra server có hoạt động không
app.get("/", (req, res) => {
  res.send("🚀 Server is running! Use WebSocket to connect.");
});

// Mảng chờ để ghép trận
let waitingPlayers = [];

// Object lưu thông tin các phòng: roomId -> { players: [player1, player2], ready: {} }
let rooms = {};

io.on("connection", (socket) => {
  console.log(`🔗 Người chơi kết nối: ${socket.id}`);

  // Khi client gửi "find_match"
  socket.on("find_match", (playerData) => {
    console.log(`find_match from ${socket.id}:`, playerData);
    waitingPlayers.push({ id: socket.id, ...playerData });

    // Nếu có đủ 2 người, ghép trận
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      const roomId = `room_${player1.id}_${player2.id}`;

      // Kiểm tra xem cả hai socket có còn kết nối không
      if (!io.sockets.sockets.get(player1.id) || !io.sockets.sockets.get(player2.id)) {
        console.log("❌ Một người chơi bị mất kết nối, hủy ghép cặp.");
        return;
      }

      // Tạo room với trạng thái ready ban đầu
      rooms[roomId] = { players: [player1, player2], ready: {} };

      // Cho cả hai socket vào room
      io.sockets.sockets.get(player1.id).join(roomId);
      io.sockets.sockets.get(player2.id).join(roomId);

      // Gửi thông tin ghép trận cho từng client
      io.to(player1.id).emit("match_found", {
        roomId,
        opponent: { name: player2.name, character: player2.character },
        color: "blue",
      });
      io.to(player2.id).emit("match_found", {
        roomId,
        opponent: { name: player1.name, character: player1.character },
        color: "red",
      });

      console.log(`✅ Ghép cặp: ${player1.id} vs ${player2.id} vào ${roomId}`);
    }
  });

  // Khi client gửi "player_ready"
  socket.on("player_ready", (data) => {
    console.log(`player_ready từ ${socket.id} trong room ${data.roomId}`);
    if (rooms[data.roomId]) {
      rooms[data.roomId].ready[data.playerId] = true;

      // Thông báo cho cả phòng biết player đã sẵn sàng
      io.in(data.roomId).emit("player_ready_update", { playerId: data.playerId });

      // Nếu cả hai đều sẵn sàng, bắt đầu trận đấu
      if (Object.keys(rooms[data.roomId].ready).length === 2) {
        io.in(data.roomId).emit("both_players_ready");
        console.log(`Room ${data.roomId}: Both players ready. Starting match.`);
      }
    }
  });

  // Sự kiện di chuyển
  socket.on("player_move", (data) => {
    socket.to(data.roomId).emit("update_game", data);
  });

  socket.on("player_moved", (data) => {
    socket.to(data.roomId).emit("update_opponent_position", data);
  });

  // Xử lý khi client ngắt kết nối
  socket.on("disconnect", () => {
    console.log(`❌ Người chơi rời khỏi: ${socket.id}`);
    waitingPlayers = waitingPlayers.filter((p) => p.id !== socket.id);

    for (const roomId in rooms) {
      if (rooms[roomId].players.some((p) => p.id === socket.id)) {
        socket.to(roomId).emit("opponent_left");
        delete rooms[roomId];
        break;
      }
    }
  });
});

// Sử dụng PORT của Render hoặc mặc định là 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});
