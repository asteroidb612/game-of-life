var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var uuid = require('node-uuid');

var clear = require('clear');
var Log = require('log');
var log = new Log('debug');

var game = {
  gameSize : 2,
  clients : {},
  generation : 0,
  counts : {},
  columns : 180,
  rows : 86,
  running : true,
  initialState : '[{"46": [5,6,7], "45":[7], "44":[6]}]',
  moves : {},
  allMoves: function() {
    //Cheat until I pull automata out
    var first;
    if (_.isEmpty(this.moves)) first = [];
    else first = this.moves[Object.keys(this.moves)[0]];
    this.moves = {};
    return first;
  }
};

process.on('SIGINFO', function() {
  console.log(game);
});

function createBaseCoordinates() {
  var size = _.size(game.clients);
  if (size == 0) { //TODO Possibly a concurrency problem
    return  {x:22, y:368}; //CanvasCoordinates for left base
  }
  else {
    return {x:1250, y:368}; // Canvas Coordinates for right base
  }
};

io.on('connection', function(socket) { //Create new player
  var id = uuid.v4();
  socket.emit('id', id);
  game.clients[id] = {moved: false, baseCoordinates: createBaseCoordinates(), id:id};

  socket.on('disconnect', function() {
    delete game.clients[id];
    if (_.size(game.clients) < game.gameSize) {
      game.generation = 0;
    }
  });

  socket.on('preTickResponse', function(generation, data){
    if (game.running && (generation == game.generation)){
      //Game over
      if (data.gameOver) {
        game.running = false;
        return;
      }

      //Latch to determine whether out of sync
      if (!game.counts[generation]){
        game.counts[generation] = data.count;
      }
      else {
        if (game.counts[generation] != data.count) {
          log.warning("Client out of sync with server!!");
          log.warning("Client %s has count %s in generation %s", id.slice(0,4), data.count, generation);
          log.warning("Server has count %s in generation %s", game.counts[generation], generation);
          game.running = false;
        }
      }

      // Update for new data
      if (data.changed) {
        game.moves[id] = data.moves;
      }

      //Gate before advancing to tick for generation
      game.clients[id].preTickResponded = true;
      if (_.all(_.pluck(game.clients, 'preTickResponded'))) {
        io.emit('tickSync', game.allMoves());
      }
    }
  });

  socket.on('postTickCheck', function(cellCount, generation) {
    if (game.running && (generation == game.generation+1)) {
      game.clients[id].postTickChecked = true;
      if (_.all(_.pluck(game.clients, 'postTickChecked'))) {
        _.each(game.clients, function(x) {x.postTickChecked  = false;})
        _.each(game.clients, function(x) {x.preTickResponded = false;})
        io.emit('preTickSync', ++game.generation);
      }
    }
  });

  if (_.size(game.clients) == game.gameSize) {
    //screen.info("Beginning Game with\n");
    //for (c in game.clients) {
      //console.log("Client ", c);
    //}
    io.emit("go", game);// May not arrive before "generation"!
  }
});

app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io-client/dist'));
app.use(express.static(__dirname));
app.set('port', (process.env.PORT || 5000));
app.get('/', function(req, res){
//  console.log("Got Root");
  res.sendFile(__dirname + '/index.html');
});

http.listen(3000);
