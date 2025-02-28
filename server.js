// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Tạo app Express và server HTTP
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Phục vụ file tĩnh từ thư mục "public"
app.use(express.static(__dirname + '/public'));

// Mảng chờ để ghép trận
let waitingPlayers = [];

// Object lưu thông tin các phòng: roomId -> { players: [socketId1, socketId2], ready: {} }
let rooms = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Khi nhận sự kiện "find_match" từ client
  socket.on('find_match', (data) => {
    console.log(`find_match from ${socket.id}:`, data);
    waitingPlayers.push({ socket, data });
    
    // Nếu có đủ 2 người, ghép trận
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      
      const roomId = `room-${player1.socket.id}-${player2.socket.id}`;
      player1.socket.join(roomId);
      player2.socket.join(roomId);
      
      rooms[roomId] = {
        players: [player1.socket.id, player2.socket.id],
        ready: {} // sẽ lưu các playerId đã gửi "player_ready"
      };
      
      // Phân màu: player1 nhận blue, player2 nhận red
      player1.socket.emit('match_found', {
        roomId,
        opponent: { name: player2.data.name, character: player2.data.character },
        color: 'blue'
      });
      player2.socket.emit('match_found', {
        roomId,
        opponent: { name: player1.data.name, character: player1.data.character },
        color: 'red'
      });
      
      console.log(`Matched room ${roomId}`);
    }
  });
  
  // Khi nhận sự kiện "player_ready" từ client
  socket.on('player_ready', (data) => {
    console.log(`player_ready from ${socket.id} in room ${data.roomId}`);
    if (rooms[data.roomId]) {
      // Lưu trạng thái ready của player
      rooms[data.roomId].ready[data.playerId] = true;
      // Phát sự kiện cho toàn bộ room về trạng thái ready của player này
      io.in(data.roomId).emit('player_ready_update', { playerId: data.playerId });
      
      // Nếu đủ 2 người đã sẵn sàng, phát thông báo bắt đầu trận đấu
      if (Object.keys(rooms[data.roomId].ready).length === 2) {
        io.in(data.roomId).emit('both_players_ready');
        console.log(`Room ${data.roomId}: Both players ready. Starting match.`);
      }
    }
  });
  
  // Sự kiện di chuyển (ví dụ "player_move" hoặc "player_moved")
  socket.on('player_move', (data) => {
    socket.to(data.roomId).emit('update_game', data);
  });
  socket.on('player_moved', (data) => {
    socket.to(data.roomId).emit('update_opponent_position', data);
  });
  
  // Khi một client ngắt kết nối, thông báo cho đối thủ và xóa phòng liên quan
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (let roomId in rooms) {
      if (rooms[roomId].players.includes(socket.id)) {
        socket.to(roomId).emit('opponent_left');
        delete rooms[roomId];
        break;
      }
    }
    waitingPlayers = waitingPlayers.filter(p => p.socket.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
