var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var uuid = require('uuid/v4');

var Log = require('log');
var log = new Log('debug');

clients = {};
games = {};
map = {
  bases: [{x:52, y:368}, {x:1220, y:368}],
  columns: 180,
  rows: 86
};

process.on('SIGINFO', function() {clients = {};});

io.on('connection', function(socket) { //Create new player
  console.log('Hello');
  socket.on('ready', function(player) {
    console.log('Ready with ', clients);
    clients[player.peerID] = player;
    clients[player.peerID].base = map.bases[clients.length-1];
    if (_.size(clients)=== 2) {
      console.log("Starting Game with ", clients);
      io.emit('game', {
        caller: player.peerID, //Most recent connection initiates with least
        clients: clients,
        map:map,
        generation:0
      });
    }
  });

  socket.on('disconnect', function() {
    console.log("Client Disconnected");
  });
  socket.on('restart', function() {
    clients = {};
  });
});

app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io-client/dist'));
app.use(express.static(__dirname));
app.set('port', (process.env.PORT || 5000));
app.get('/', function(req, res){
//  console.log("Got Root");
  res.sendFile(__dirname + '/index.html');
});

http.listen(process.env.PORT || 3000);
