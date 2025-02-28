// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Tạo app Express và server HTTP
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Cấu hình để phục vụ file tĩnh (client HTML, JS, CSS)
app.use(express.static(__dirname + '/public'));

// Mảng chờ để ghép trận
let waitingPlayers = [];

// Object lưu thông tin phòng: roomId -> { players: [socketId1, socketId2], ready: {} }
let rooms = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Khi nhận sự kiện "find_match" từ client
  socket.on('find_match', (data) => {
    console.log(`find_match từ ${socket.id}:`, data);
    // Lưu thông tin của client đang tìm trận
    waitingPlayers.push({ socket, data });
    
    // Nếu có đủ 2 người, ghép trận
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      
      // Tạo roomId dựa trên socket id của 2 người
      const roomId = `room-${player1.socket.id}-${player2.socket.id}`;
      
      // Cho cả 2 socket vào cùng một room
      player1.socket.join(roomId);
      player2.socket.join(roomId);
      
      // Lưu thông tin phòng
      rooms[roomId] = {
        players: [player1.socket.id, player2.socket.id],
        ready: {}  // sẽ chứa các playerId đã sẵn sàng
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
      
      console.log(`Ghép trận thành công trong room ${roomId}`);
    }
  });
  
  // Khi nhận sự kiện "player_ready" từ client
  socket.on('player_ready', (data) => {
    console.log(`player_ready từ ${socket.id} trong room ${data.roomId}`);
    if (rooms[data.roomId]) {
      rooms[data.roomId].ready[data.playerId] = true;
      // Gửi thông báo đến phòng rằng một đối thủ đã sẵn sàng
      socket.to(data.roomId).emit('opponent_ready');
      
      // Nếu đủ 2 người sẵn sàng, gửi thông báo "both_players_ready" đến toàn bộ room
      if (Object.keys(rooms[data.roomId].ready).length === 2) {
        io.in(data.roomId).emit('both_players_ready');
        console.log(`Room ${data.roomId} đã đủ 2 người sẵn sàng, bắt đầu trận đấu.`);
      }
    }
  });
  
  // Sự kiện di chuyển: "player_move" (có thể dùng cho các hiệu ứng nhấn phím)
  socket.on('player_move', (data) => {
    // Phát đến tất cả các client trong room ngoại trừ người gửi
    socket.to(data.roomId).emit('update_game', data);
  });
  
  // Sự kiện cập nhật vị trí: "player_moved"
  socket.on('player_moved', (data) => {
    // Gửi thông tin vị trí đến đối thủ trong cùng room
    socket.to(data.roomId).emit('update_opponent_position', data);
  });
  
  // Xử lý khi một client ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Kiểm tra nếu socket nằm trong một room, thông báo cho đối thủ
    for (let roomId in rooms) {
      if (rooms[roomId].players.includes(socket.id)) {
        socket.to(roomId).emit('opponent_left');
        delete rooms[roomId];
        break;
      }
    }
    // Loại bỏ socket khỏi mảng chờ nếu chưa được ghép trận
    waitingPlayers = waitingPlayers.filter(p => p.socket.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
