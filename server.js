const express = require('express')
const path = require('path')
const app = express()
const http = require('http')
const server = http.createServer(app)
const socketio = require("socket.io")
const io = socketio(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ["GET","POST"],
    credentials: true
  }
})

// app.use(express.static(path.join(__dirname,'../build')))

let payload = {
  users: {},
  scoreBoard: {},
  master: ''
}
// users { socket-id -> username }
// scoreboard { socket-id -> score }
// status {socket-id -> status}
// currentMaster - socket-id
let masterIndex = 0;
let answer = '';
// these variables are specific to the current game
let finishedCnt = 0;
let curPlayers = 0;

let connectedSocketIds = [];
io.on('connection', async socket => {
  let connectedSockets = await io.fetchSockets();
  console.log(payload.master);
  connectedSocketIds.push(socket.id);
  socket.on('join-room', async (username) => {
    console.log('connection', username, socket.id);
    payload.users[socket.id] = username;
    payload.scoreBoard[socket.id] = 0;
    io.sockets.emit('scoreboard-update', payload);

    // if connected socket is the only one in the room, name it the master
    if(connectedSockets.length === 1){
      console.log("first player");
      payload.master = socket.id;
      io.sockets.emit('scoreboard-update', payload);
    }
  });

  socket.on('new-word', async (new_word) => {
    // dont start a game with only one player
    let playerCnt = (await io.fetchSockets()).length;
    if(playerCnt === 1) return;

    // game start
    answer = new_word;
    finishedCnt = 0;
    // get all sockets at the time of game start
    curPlayers = await io.fetchSockets();
    console.log('new game', curPlayers.length, answer)
    io.sockets.emit('game-start', answer);
  });

  socket.on('wordle-solved', (point) => {
    payload.scoreBoard[socket.id] += point;
    finishedCnt++;
    io.sockets.emit('scoreboard-update', payload);
    // everyone solved, game over
    if(finishedCnt === curPlayers.length - 1){
      io.sockets.emit('game-over');
      setNewMaster();
      console.log('new master', payload.master, payload.users[payload.master]);
      io.sockets.emit('scoreboard-update', payload);
    }
  });


  socket.on('disconnect', async () => {
    console.log('disconnection',payload.users[socket.id], socket.id);
    delete payload.users[socket.id];
    delete payload.scoreBoard[socket.id];
    connectedSocketIds = connectedSocketIds.filter(id => id !== socket.id);

    // master left ; reset master and game
    if(socket.id === payload.master){
      io.sockets.emit('game-over');
      setNewMaster();
      console.log('new master', payload.master, payload.users[payload.master]);
      io.sockets.emit('scoreboard-update', payload);
    }
    // 2nd to last player leaves ; 1 player left
    let playerCnt = (await io.fetchSockets()).length;
    if(playerCnt === 1){
      console.log("second to last left");
      io.sockets.emit('game-over');
    }
    io.sockets.emit('scoreboard-update', payload);
  });
})

const setNewMaster = () => {
  masterIndex++;
  if(masterIndex >= connectedSocketIds.length) masterIndex = 0;
  payload.master = connectedSocketIds[masterIndex];
}

server.listen(3001, () => {
  console.log('listening on *:3001')
});