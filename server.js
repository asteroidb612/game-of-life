var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var uuid = require('node-uuid');

var fs = require('fs');
var Log = require('log');
var log = new Log('debug', fs.createWriteStream('server.log'));
var screen = new Log();

var clear = require('clear');

var game = {
  gameSize : 2,
  clients : {},
  generation : 0,
  counts : {},
  columns : 180,
  rows : 86,
  running : true,
  initialState : '[{"46": [5,6,7], "45":[7], "44":[6]}]'
};

process.on('SIGINFO', function() {
  console.log(game);
  game = {
    gameSize : 2,
    clients : {},
    generation : 0,
    counts : {},
    columns : 180,
    rows : 86,
    running : true,
    initialState : '[{"46": [5,6,7], "45":[7], "44":[6]}]'
  };
});

function createBaseCoordinates() {
  var size = _.size(game.clients);
  log.debug('creatingBase for %s clients', size)
  if (size == 0) { //TODO Possibly a concurrency problem
    return  {x:22, y:368}; //CanvasCoordinates for left base
  }
  else {
    return {x:1255, y:368}; // Canvas Coordinates for right base
  }
};

io.on('connection', function(socket) { //Create new player, let everyone know
  var id = uuid.v4();
  log.debug("Player %s Connected", id);
  socket.emit('id', id);
  game.clients[id] = {moved: false, baseCoordinates: createBaseCoordinates(), id:id};

  socket.on('disconnect', function() {
    delete game.clients[id];
    log.debug("%s left");
    if (_.size(game.clients) < game.gameSize) {
//      game.running = false;
      game.generation = 0;
      log.debug("Ending Game");
      log.debug(game);
    }
  });

  socket.on('input', function(generation, data){
    if (game.running){
      if (data.gameOver) {
        log.debug("%s ended the game", id);
        game.running = false;
        return;
      }
      if (!game.counts[generation]){
        game.counts[generation] = data.count;
      }
      else {
        if (game.counts[generation] != data.count) {
          log.warning("Clients are out of sync!!");
          log.warning("Client %s has count %s in generation %s", id, data.count, generation);
          log.warning("Server has count %s in generation %s", game.counts[generation], generation);
          game.running = false;
        }
      }
      game.clients[id].moved = true;
      clear()
      screen.info("Generation: %s", game.generation);
      _.each(game.clients, function(each) {
        screen.info("Client %s moved: %s", each.id, each.moved);
      });
      if (data.changed) {
        log.debug("Data from client %s in generation %s", id, generation);
        log.debug(data);
        io.emit('changes', {player:id, moves:data.moves});
      }
      if (_.all(_.pluck(game.clients, 'moved'))) {
        _.each(game.clients, function(x) { x.moved = false; }); //Reset Players
        io.emit('generation', game.generation++); // Advance game.clients 1 generation
      }
    }
  });

  if (_.size(game.clients) == game.gameSize) {
    screen.info("Beginning Game with\n");
    for (c in game.clients) {
      console.log("Client ", c);
    }
    io.emit("go", game);
    io.emit("generation", game.generation)
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
