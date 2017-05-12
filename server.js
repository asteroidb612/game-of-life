var express = require('express');
var app = express();
var _ = require('underscore'); 
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuid = require('node-uuid');
var gameloop = require('node-gameloop');

var clients = {};
var game = {
  ready : false,
  generation : 0,
  running : false,
  columns : 0,
  rows : 0,
  players : []
};

var ready = {};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {

  //Create new player, let everyone know
  var id = uuid.v4();
  clients[id] = {connected: true, moved: false};
  console.log(id + ' has connected');

  socket.on('disconnect', function() {
    delete clients[id];
    console.log(id + 'has disconnected');
  });

  socket.on('input', function(data){
    clients[id].moved = true;
    if (data.changed) {
      io.emit('changes', {player:id, moves:data.moves});
    }
    if (_.all(_.pluck(clients, 'moved'))) { 
      _.each(clients, function(x) { x.moved = false; }); //Reset Players
      game.ready = true; // Trigger next tick
      io.emit('next', {}); // Advance clients 1 generation
    }
  });
});

app.use(express.static('assets'));
app.listen(3000);
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port')); 
});

var id = gameloop.setGameLoop(function(delta) {
  if (!game.running) {
    if (_.size(clients) === 2) {
      console.log("Game Started");
      io.emit("starting");
      game.running = true;
    }
  }
  else {
    if (game.ready){
      game.generation += 1;
      console.log("On tick " + game.generation);
      game.ready = false;
      io.emit('tick', {tick: game.generation});
    }
  }
});
