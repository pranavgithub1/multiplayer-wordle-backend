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



let masterIndex = 0;
let master; // type = Player

// these variables are specific to the current game
let gameOngoing = false;
let currentGame = {
  answer: '',
  players: [], // list of Player objs
  finishedCnt: 0,
  guessingCnt: 0,
}

let playerList = [];
let playerMap = {}; // socket_id -> Player object

io.on('connection', socket => {
  
  console.log(master);

  socket.on('join-room', (username) => {
    console.log('connection', username, socket.id);

    // Add new player to server side data
    let newPlayer = new Player(socket.id, username, 0, false, false);
    playerList.push(newPlayer);
    playerMap[socket.id] = newPlayer;

    // Give the new client the data it needs
    socket.emit('room-data', {
      playerList: playerList,
      playerMap: playerMap,
      master: master
    });

    // Tell all other sockets new player just joined
    socket.broadcast.emit('new-player', newPlayer);

    // if connected socket is the only one in the room, name it the master
    if(playerList.length === 1){
      console.log("first player");
      master = newPlayer;
      io.sockets.emit('new-master', master);
    }
  });

  socket.on('new-word', (new_word) => {
    // dont start a game with only one player
    if(playerList.length === 1) return;

    
    // initialize game variables
    gameOngoing = true;
    currentGame.answer = new_word;
    currentGame.finishedCnt = 0;
    currentGame.guessingCnt = playerList.length - 1;
    currentGame.players = [...playerList];
    playerList.forEach(player => player.inGame = true);
    console.log("NEW GAME", currentGame);
    console.log("guessint cnt: ", currentGame.guessingCnt)
    io.sockets.emit('game-start', currentGame.answer);
  });

  socket.on('wordle-solved', (point) => {
    // Increment player score and finished count
    currentGame.finishedCnt++;
    currentGame.guessingCnt--;
    playerMap[socket.id].score += point;
    console.log("wordle solved", playerMap[socket.id].username, playerMap[socket.id].score, point);
    playerMap[socket.id].inGame = false;

    // remove the player who just solved from the current game
    // currentGame.players = currentGame.players.filter(player => player.socketid !== socket.id);

    io.sockets.emit('scoreboard-update', {
      scorer: socket.id,
      point: point
    });

    // everyone solved, game over ; set a new master
    if(currentGame.guessingCnt === 0){
      io.sockets.emit('game-over');
      gameOngoing = false;
      setNewMaster();
      console.log('new master', master.username);
      io.sockets.emit('new-master', master);
    }
  });


  socket.on('disconnect', async () => {
    if(!playerMap.hasOwnProperty(socket.id)) return;
    console.log('disconnection', playerMap[socket.id].username);

    io.sockets.emit('player-left', playerMap[socket.id]);
    
    let disconnectedPlayer = playerMap[socket.id];

    // Remove disconnected player from playerList
    playerList = playerList.filter(player => player.socketid !== socket.id);
    delete playerMap[socket.id];

    // last person in room leaves -> reset all server state
    let connectedSocketCount = (await io.fetchSockets()).length;
    if(connectedSocketCount === 0){
      console.log("last in room left");
      master = null;
      playerList = [];
      playerMap = {};
      masterIndex = 0;
      gameOngoing = false;
      currentGame.answer = '';
      currentGame.finishedCnt = 0;
      currentGame.players = [];
      currentGame.guessingCnt = 0;
      return;
    }

    // 2nd to last person in room leaves -> waiting state
    // if(connectedSocketCount === 1) {
    //   io.sockets.emit('game-over');
    //   gameOngoing = false;
    //   setNewMaster();
    //   console.log('new master', master.username);
    //   io.sockets.emit('new-master', master);
    //   return;
    // }


    // master left -> reset game
    if(socket.id === master.socketid){
      io.sockets.emit('game-over');
      gameOngoing = false;
      setNewMaster();
      console.log('new master', master.username);
      io.sockets.emit('new-master', master);
    }

    // player in current game leaves -> remove them from currentGame variables
    if(disconnectedPlayer.inGame){
      console.log("gaming player left");
      console.log(currentGame.guessingCnt);
      currentGame.players = currentGame.players.filter(player => player.socketid !== socket.id);
      currentGame.guessingCnt--;

      // Everyone in current game left but the master -> reset Game
      if(currentGame.guessingCnt === 0){
        io.sockets.emit('game-over');
        gameOngoing = false;
        setNewMaster();
        console.log('new master', master.username);
        io.sockets.emit('new-master', master);
      }
    }
    
  });
})

const setNewMaster = () => {
  masterIndex++;
  if(masterIndex >= playerList.length) masterIndex = 0;
  master = playerList[masterIndex];
}

server.listen(3001, () => {
  console.log('listening on *:3001')
});


class Player {
  constructor(socketid, username, score, inGame, isMaster){
    this.socketid = socketid;
    this.username = username;
    this.score = score;
    this.inGame = inGame;
    this.isMaster = isMaster;
  }
}