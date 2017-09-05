var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var uuid = require('uuid/v4');

var Log = require('log');
var log = new Log('debug');

global clients;
global games;
global map = {
  bases: [{x:52, y:368}, {x:1220, y:368}],
  columns: 180,
  rows: 86
};

io.on('connection', function(socket) { //Create new player
  io.on('ready', function(player) {
    clients[player.peerID] = player;
    clients[player.peerID].base = map.bases[clients.length-1];
    if (clients.length === 2) {
      io.emit('game', {//This could be more selective with a channel
        caller: player.peerID,
        clients: clients,
        map:map,
        generation:0
      });
    }
  });

  socket.on('disconnect', function() {
    console.log(socket + "Disconnected");
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
