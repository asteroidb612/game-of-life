var express = require('express');
var app = express();
var _ = require('underscore'); 
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuid = require('node-uuid');
var gameloop = require('node-gameloop');

var game = {
  gameSize : 2,
  clients : {};
  generation : 0,
  columns : 180, 
  rows : 86, 
  running : false,
};


//TODO Support Multiple Players
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
  socket.emit('id', id);
  game.clients[id] = {moved: false, base: createBase(), id:id};

  socket.on('disconnect', function() {
    delete game.clients[id];
  });

  socket.on('input', function(generation, data){ // TODO Check that generations match up
    game.clients[id].moved = true;
    if (data.changed) {
      io.emit('changes', {player:id, moves:data.moves});
    }
    if (_.all(_.pluck(game.clients, 'moved'))) { 
      _.each(game.clients, function(x) { x.moved = false; }); //Reset Players
      io.emit('generation', game.generation++); // Advance game.clients 1 generation
    }
  });

  if (_.size(game.clients) == gameSize) {
    io.emit("go", game);
    io.emit("generation", game.generation)
  }
});

app.set('port', (process.env.PORT || 5000));
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});
app.use(express.static(__dirname));
app.listen(3000);
app.listen(app.get('port'), function() {
});
//
//var id = gameloop.setGameLoop(function(delta) {
//  if (!game.running) {
//    if (_.size(clients) === 2) {
//      io.emit("starting");
//      game.running = true;
//    }
//  }
//  else {
//    if (game.ready){
//      game.generation += 1;
//      game.ready = false;
//      io.emit('tick', {tick: game.generation});
//    }
//  }
//});
