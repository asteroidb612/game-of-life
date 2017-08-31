var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var uuid = require('node-uuid');

var Log = require('log');
var log = new Log('debug');

global clients;
global games;

io.on('connection', function(socket) { //Create new player
  io.on('ready', function(player) {
    clients.append(player);
    if (clients.length === 2) {
      socket.
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
