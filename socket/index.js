var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuid = require('node-uuid');

var history = [];

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){

  var id = uuid.v4();
  console.log(id + ' has joined room');

  socket.on('disconnect', function() {
    console.log(id + ' has left room');
  });

  for (var i=0; i<history.length; i++) {
    io.emit('chat message', history[i]);
  }

  socket.on('chat message', function(message){
    io.emit('chat message', message);
    history.push(message);
  });

});

http.listen(3000, function(){
  console.log('listening on *.3000');
});
