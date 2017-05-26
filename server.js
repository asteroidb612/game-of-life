var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var _ = require('underscore'); 
var uuid = require('node-uuid');
var gameloop = require('node-gameloop');

var game = {
  gameSize : 2,
  clients : {},
  generation : 0,
  columns : 180, 
  rows : 86, 
  running : true,
};

process.on('SIGINFO', function() {
  console.log(game);
});

function createBase() {
  if (_.size(game.clients) == 0) {
    return  [[41, 1], [41, 2], [42, 1], [42, 2]];
  }
  else {
    return [[41, 177], [41, 178], [42, 177], [42, 178]]
  }
}


io.on('connection', function(socket) { //Create new player, let everyone know
  var id = uuid.v4();
  console.log("Player ", id, " Connected");
  socket.emit('id', id);
  game.clients[id] = {moved: false, base: createBase(), id:id};

  socket.on('disconnect', function() {
    delete game.clients[id];
    console.log(id, " left");
    if (_.size(game.clients) < game.gameSize) {
      game.running = false;
      game.generation = 0;
      console.log("Ending Game");
    }
  });

  socket.on('input', function(generation, data){ // TODO Check that generations match up
    if (game.running){
      if (data.gameOver) {
        console.log("Game Over");
        game.running = false;
        return;
      }
      game.clients[id].moved = true;
      console.log(id  + " moved");
      if (data.changed) {
        //console.log(data);
        io.emit('changes', {player:id, moves:data.moves});
      }
      if (_.all(_.pluck(game.clients, 'moved'))) { 
        _.each(game.clients, function(x) { x.moved = false; }); //Reset Players
        io.emit('generation', game.generation++); // Advance game.clients 1 generation
      }
    }
  });

  if (_.size(game.clients) == game.gameSize) {
    console.log("Beginning Game with\n");
    for (c in game.clients) {
      console.log("Client ", c);
    }
    io.emit("go", game);
    io.emit("generation", game.generation)
    console.log("Generation ", game.generation);
  }
});

app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io-client/dist'));
app.use(express.static(__dirname));
app.set('port', (process.env.PORT || 5000));
app.get('/', function(req, res){
  console.log("Got Root");
  res.sendFile(__dirname + '/index.html');
});

http.listen(3000);
