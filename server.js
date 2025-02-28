// Sever.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

app.get("/", (req, res) => {
  res.send("🚀 Server is running! Use WebSocket to connect.");
});


const app = express();
app.use(cors());
app.use(express.static(__dirname + '/public')); // Phục vụ các file tĩnh từ thư mục public

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let waitingPlayers = []; // Danh sách người chơi chờ vào trận
// Cấu trúc room: roomId -> { players: [player1, player2], ready: {} }
let rooms = {};

io.on("connection", (socket) => {
  console.log(`🔗 Người chơi kết nối: ${socket.id}`);

  // Khi nhận "find_match" từ client
  socket.on("find_match", (playerData) => {
    waitingPlayers.push({ id: socket.id, ...playerData });
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      const roomId = `room_${player1.id}_${player2.id}`;
      
      // Tạo room và lưu trạng thái ready rỗng
      rooms[roomId] = { players: [player1, player2], ready: {} };
      
      // Cho cả 2 socket vào room
      io.sockets.sockets.get(player1.id).join(roomId);
      io.sockets.sockets.get(player2.id).join(roomId);
      
      // Gửi thông tin ghép trận
      io.to(player1.id).emit("match_found", { roomId, opponent: player2, color: "blue" });
      io.to(player2.id).emit("match_found", { roomId, opponent: player1, color: "red" });
      
      console.log(`✅ Ghép cặp: ${player1.id} vs ${player2.id} vào ${roomId}`);
    }
  });
  
  // Lắng nghe sự kiện "player_ready"
  socket.on("player_ready", ({ roomId, playerId }) => {
    console.log(`player_ready từ ${socket.id} trong room ${roomId}`);
    if (rooms[roomId]) {
      rooms[roomId].ready[playerId] = true;
      // Phát thông điệp cập nhật cho toàn room
      io.in(roomId).emit("player_ready_update", { playerId });
      
      // Nếu cả 2 đã sẵn sàng, phát "both_players_ready"
      if (Object.keys(rooms[roomId].ready).length === 2) {
        io.in(roomId).emit("both_players_ready");
        console.log(`Room ${roomId}: Cả 2 đã sẵn sàng, bắt đầu trận đấu`);
      }
    }
  });
  
  // Sự kiện di chuyển
  socket.on("player_move", ({ roomId, playerId, key }) => {
    io.to(roomId).emit("update_game", { playerId, key });
  });
  
  socket.on("player_moved", (data) => {
    socket.to(data.roomId).emit("update_opponent_position", data);
  });
  
  // Xử lý khi một client ngắt kết nối
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
