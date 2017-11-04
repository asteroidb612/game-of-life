/*jslint onevar: true, undef: false, nomen: true, eqeqeq: true, plusplus: false, bitwise: true, regexp: true, newcap: true, immed: true  */

/**
* Game of Life - JS & CSS
* http://pmav.eu
* 04/Sep/2010
*/

const Stats = require('stats.js');
const _ = require('underscore');

GOL = (function () {
  var canvasStats = new Stats();
  canvasStats.setMode( 0 ); // 0 FPS, 1 MS

  // align top-left
  canvasStats.domElement.style.position = 'fixed';
  canvasStats.domElement.style.left = '';
  canvasStats.domElement.style.right = '80px';
  canvasStats.domElement.style.width = '80px';
  canvasStats.domElement.style.top= '0px';
  canvasStats.domElement.style.zIndex = '999999';
  document.addEventListener("DOMContentLoaded", function() {
    document.body.appendChild( canvasStats.domElement );
  });

  //Canvas Stats
  var automataStats = new Stats();
  automataStats.setMode( 0 ); // 0 FPS, 1 MS

  // align top-left
  automataStats.domElement.style.position = 'fixed';
  automataStats.domElement.style.right = '0px';
  automataStats.domElement.style.left = '';
  automataStats.domElement.style.width = '80px';
  automataStats.domElement.style.top= '0px';
  automataStats.domElement.style.zIndex = '999999';

  document.addEventListener("DOMContentLoaded", function() {
    document.body.appendChild( automataStats.domElement );
  });
  var GOL = {

    opponent_generation : 0,
    //Game State
    generation : 0,
    columns : 0,
    rows : 0,
    territorySize : 25,

    running : false,
    autoplay : false,//true,

    gameOver : false,
    gameResult : "",

    messageLoc : [90, 41],

    // Clear state
    clear : {
      schedule : false
    },


    // Average execution times
    times : {
      algorithm : 0,
      gui : 0
    },


    // Metrics fed to DOM elements
    element : {
      generation : null,
      steptime : null,
      livecells : null,
      hint : null,
      messages : {
        layout : null
      }
    },

    // Trail state
    trail : {
      current: false,
      schedule : false
    },

    // Grid style
    grid : {
      current : 0,

      schemes : [
        {
          color : '#F3F3F3'
        },

        {
          color : '#FFFFFF'
        },

        {
          color : '#666666'
        },

        {
          color : '' // Special case: 0px grid
        }
      ]
    },


    // Zoom level
    zoom : {
      current : 0,
      schedule : false,

      schemes : [
        // { columns : 100, rows : 48, cellSize : 8 },
        {
          columns : 180,
          rows : 86,
          cellSize :6
        },

        {
          columns : 300,
          rows : 144,
          cellSize : 2
        },

        {
          columns : 450,
          rows : 216,
          cellSize : 1
        }
      ]
    },


    // Cell colors
    colors : {
      current : 0,
      schedule : false,

      schemes : [
        {
          dead : '#FFFFFF',
          trail : ['#B5ECA2'],
          alive : ['#000000'],//['#9898FF', '#8585FF', '#7272FF', '#5F5FFF', '#4C4CFF', '#3939FF', '#2626FF', '#1313FF', '#0000FF', '#1313FF', '#2626FF', '#3939FF', '#4C4CFF', '#5F5FFF', '#7272FF', '#8585FF'],
          home : ['#9898FF'],
          enemy : ['#ff9898'],
          queued : ['#4c4cff']
        },
      ]
    },

    /**
    * Clean up actual state and prepare a new run
    */
    cleanUp : function() {
      this.automata.init(); // Reset/init algorithm
    },

    /**
    * On Load Event
    */
    init : function() {
      this.automata.init();   // Reset/init algorithm
      this.registerEvents();  // Register event handlers
      this.initSocket();      // Connect to server
    },

    /* registerEvents
    *  Register event handlers for this session (one time execution)
    */
    registerEvents : function() {

      // Keyboard Events
      this.helpers.registerEvent(document.body, 'keyup', this.handlers.keyboard, false);

      // Controls
      this.helpers.registerEvent(document.getElementById('buttonRun'), 'click', this.handlers.buttons.run, false);
      this.helpers.registerEvent(document.getElementById('buttonCommit'), 'click', this.handlers.buttons.commit, false);
      this.helpers.registerEvent(document.getElementById('buttonRestart'), 'click', this.handlers.buttons.restart, false);

    },

    initSocket : function() {
      this.server = io();
      this.peer = new Peer({key: '1ws0ap98qnz5mi'});

      this.peer.on("error", function(err) {alert(err);});

      //Optimize by not waiting on peer.open, see docs
      this.peer.on('open', function(peerID) {
        GOL.id = peerID;
        GOL.server.emit('ready', {peerID: peerID}) ;
      });

      this.server.on('game', function(game) {
        GOL.automata.init();
        GOL.intervalHash = {};
        GOL.columns = game.map.columns;
        GOL.rows = game.map.rows;
        GOL.generation = game.generation || 0;
        GOL.player = game.clients[GOL.id];
        GOL.handlers.setName(GOL.id);
        GOL.players = game.clients;
        for (c in GOL.players) {
          var coord = game.map.bases.pop();
          GOL.players[c].baseCoordinates = coord;
          GOL.players[c].base = GOL.helpers.baseFromCoordinates(coord);
          for (var i=0; i<4; i++){
            var basePosition = GOL.players[c].base[i];
            GOL.automata.addCell(basePosition.x, basePosition.y, GOL.automata.actualState);
          }
        };
        GOL.tickScheduled = true;
        GOL.running = true;
        GOL.canvas.init();     // Init canvas GUI
        GOL.canvas.drawWorld();

        //Establish the DataConnection and attach listeners
        if (game.caller === GOL.id) {
          var opponents = _.omit(_.keys(GOL.players), GOL.id);
          GOL.conn = GOL.peer.connect(opponents[0]);
          GOL.conn.on('open', function() {
            //Game was caller and connection succeeded
            GOL.nextStep();
            GOL.opponent_ready = true;
            GOL.advance_if_ready({gen: GOL.generation});
          });
          GOL.conn.on('data', function(turn) {
            GOL.opponent_ready = true;
            GOL.advance_if_ready(turn);
          });
        } else {
          GOL.peer.on('connection', function(conn) {
            GOL.conn = conn;
            GOL.conn.on('open', function() {
              //Game was recipient and connection succeeded
              GOL.nextStep();
              GOL.opponent_ready = true;
              GOL.advance_if_ready({gen: GOL.generation});
            });
            GOL.conn.on('data', function(turn) {
              GOL.opponent_ready = true;
              GOL.advance_if_ready(turn);
            });
          });
        }
      });
    },

    advance_if_ready : function(turn){
      if (turn.gen > GOL.opponent_generation){
        GOL.opponent_generation = turn.gen; //So we can throw out old messages
      }
      if (turn.gen === GOL.generation){
        if (GOL.self_ready && GOL.opponent_ready) {
          GOL.self_ready == false;
          GOL.opponent_ready == false;
          if (turn.moves) {
            GOL.automata.serverState = turn.moves;
            GOL.automata.serverCommitScheduled = true;
          }
          GOL.tickScheduled = true;
        }
      }
    },

    //Run Next Step
    nextStep : function() {
      var i, x, y, r, liveCellNumber;

      // Algorithm run

      if (GOL.tickScheduled) {
        automataStats.begin()
        //Does the real work of advancing state of game
        //Rest of this function does the graphics
        GOL.element.livecells = GOL.automata.nextGeneration();
        GOL.generation++;
        var turn = {gen: GOL.generation};
        if (GOL.automata.queueCommitScheduled) {
          turn.moves = GOL.automata.queuedState;
          GOL.automata.queuedState = [];
          GOL.automata.queueCommitScheduled = false;
        }

        //Every 50 milleseconds, if gen changed then unregister event
        //Else, send the turn
        GOL.intervalHash[turn.gen] = setInterval(function() {
            if (turn.gen < GOL.opponent_generation) {
              clearInterval(GOL.intervalHash[turn.gen]);
            }
            GOL.conn.send(turn);
            console.log(turn)
          }, 50);
          GOL.tickScheduled = false;
          GOL.self_ready = true;
          GOL.canvas.drawWorld();
          automataStats.end()
        }
      // Canvas run

      for (i = 0; i < GOL.automata.redrawList.length; i++) {
        x = GOL.automata.redrawList[i][0];
        y = GOL.automata.redrawList[i][1];

        if (GOL.automata.redrawList[i][2] === 1) {
          GOL.canvas.changeCelltoAlive(x, y);
        } else if (GOL.automata.redrawList[i][2] === 2) {
          GOL.canvas.keepCellAlive(x, y);
        } else {
          GOL.canvas.changeCelltoDead(x, y);
        }
      }

      // Pos-run updates

      // Clear Trail
      if (GOL.trail.schedule) {
        GOL.trail.schedule = false;
        GOL.canvas.drawWorld();
      }

      // Change Grid
      if (GOL.grid.schedule) {
        GOL.grid.schedule = false;
        GOL.canvas.drawWorld();
      }

      // Change Colors
      if (GOL.colors.schedule) {
        GOL.colors.schedule = false;
        GOL.canvas.drawWorld();
      }

      // Flow Control
      if (GOL.running) {
        canvasStats.begin();
        window.requestAnimationFrame(GOL.nextStep);
        canvasStats.end();
      } else {
        if (GOL.clear.schedule) {
          GOL.cleanUp();
        }
      }
    },

    //Event Handlers
    handlers : {

      mouseDown : false,
      lastX : 0,
      lastY : 0,

      setName : function(name) {
        document.getElementById('playerName').innerHTML = "Playing As " + name;
      },

      /**
      *
      */
      canvasMouseDown : function(event) {
        var coordinates = GOL.helpers.mouseCoordinates(event);
        var position = GOL.helpers.coordinatePosition(coordinates);
        var r = (GOL.zoom.schemes[GOL.zoom.current].cellSize + 1) * GOL.territorySize;
        var click = [coordinates.x, coordinates.y];
        var base = [GOL.player.baseCoordinates.x, GOL.player.baseCoordinates.y]
        if (GOL.helpers.distance(click, base) < r) {
          GOL.canvas.queueCell(position.x, position.y);
        }
        GOL.handlers.lastX = position.x;
        GOL.handlers.lastY = position.y;
        GOL.handlers.mouseDown = true;
      },

      /**
      *
      */
      canvasMouseUp : function() {
        GOL.handlers.mouseDown = false;
      },

      /**
      *
      */
      canvasMouseMove : function(event) {
        if (GOL.handlers.mouseDown) {
          var coordinates = GOL.helpers.mouseCoordinates(event);
          var position = GOL.helpers.coordinatePosition(coordinates);
          if ((position.x !== GOL.handlers.lastX) || (position.y !== GOL.handlers.lastY)) {
            var r = (GOL.zoom.schemes[GOL.zoom.current].cellSize + 1) * GOL.territorySize;
            var click = [coordinates.x, coordinates.y];
            var base = [GOL.player.baseCoordinates.x, GOL.player.baseCoordinates.y]
            if (GOL.helpers.distance(click, base) < r) {
              GOL.canvas.queueCell(position.x, position.y);
            }
            GOL.handlers.lastX = position.x;
            GOL.handlers.lastY = position.y;
          }
        }
      },

      /**
      *
      */
      keyboard : function(e) {
        var event = e;
        if (!event) {
          event = window.event;
        }
        if (event.keyCode === 67) { // Key: C
          GOL.handlers.buttons.commit();
        } else if (event.keyCode === 80 ) { // Key: P
          GOL.handlers.buttons.run();
        }
      },

      buttons : {

        /**
        * Button Handler - Run
        */
        run : function() {
          GOL.running = !GOL.running;
          if (GOL.running) {
            GOL.nextStep();
            document.getElementById('buttonRun').value = 'Pause (Shortcut P)';
          } else {
            document.getElementById('buttonRun').value = 'Run (Shortcut P)';
          }
        },

        /**
        * Button Handler - Add queue of cells to game
        */
        commit : function (){
          if (!_.isEmpty(GOL.automata.queuedState)) {
            GOL.automata.queueCommitScheduled = true;
          }
        },
        restart : function () {
          if (GOL.server) {
            GOL.server.emit("restart");
          }
        }

      }

    }, // handlers

    //Canvas
    canvas: {

      context : null,
      width : null,
      height : null,
      age : null,
      cellSize : null,
      cellSpace : null,


      /**
      * init
      */
      init : function() {

        this.canvas = document.getElementById('canvas');
        this.context = this.canvas.getContext('2d');

        this.cellSize = GOL.zoom.schemes[GOL.zoom.current].cellSize;
        this.cellSpace = 1;

        GOL.helpers.registerEvent(this.canvas, 'mousedown', GOL.handlers.canvasMouseDown, false);
        GOL.helpers.registerEvent(document, 'mouseup', GOL.handlers.canvasMouseUp, false);
        GOL.helpers.registerEvent(this.canvas, 'mousemove', GOL.handlers.canvasMouseMove, false);

        this.clearWorld();
      },


      /**
      * clearWorld
      */
      clearWorld : function () {
        var i, j;

        // Init ages (Canvas reference)
        this.age = [];
        for (i = 0; i < GOL.columns; i++) {
          this.age[i] = [];
          for (j = 0; j < GOL.rows; j++) {
            this.age[i][j] = 0; // Dead
          }
        }
      },


      /**
      * drawWorld
      */
      drawWorld : function() {
        var i, j;

        // Special no grid case
        if (GOL.grid.schemes[GOL.grid.current].color === '') {
          this.setNoGridOn();
          this.width = this.height = 0;
        } else {
          this.setNoGridOff();
          this.width = this.height = 1;
        }

        // Dynamic canvas size
        this.width = this.width + (this.cellSpace * GOL.columns) + (this.cellSize * GOL.columns);
        this.canvas.setAttribute('width', this.width);

        this.height = this.height + (this.cellSpace * GOL.rows) + (this.cellSize * GOL.rows);
        this.canvas.getAttribute('height', this.height);

        // Fill background
        this.context.fillStyle = GOL.grid.schemes[GOL.grid.current].color;
        this.context.fillRect(0, 0, this.width, this.height);

        for (i = 0 ; i < GOL.columns; i++) {
          for (j = 0 ; j < GOL.rows; j++) {
            if (GOL.automata.isAlive(i, j)) {
              this.drawCell(i, j, "alive");
            } else if (GOL.automata.isQueued(i, j)) {
              this.drawCell(i,j, "queued");
            } else {
              this.drawCell(i, j, "false");
            }
          }
        }

        if (GOL.gameOver) {
          this.context.font = "48px sans";
          this.context.textAlign = "center";
          this.context.fillStyle = "#ff9898";
          this.context.fillText("Game Over",  (this.cellSize + this.cellSpace) * GOL.messageLoc[0], (this.cellSize + this.cellSpace) * GOL.messageLoc[1]);

          this.context.font = "36px sans";
          this.context.fillText(GOL.gameResult,  (this.cellSize + this.cellSpace) * GOL.messageLoc[0], (this.cellSize + this.cellSpace) * GOL.messageLoc[1] + 30);
        }
        // Draw Territory
        this.context.beginPath();
        this.context.arc(GOL.player.baseCoordinates.x, GOL.player.baseCoordinates.y,
          (GOL.zoom.schemes[GOL.zoom.current].cellSize + 1) * GOL.territorySize,
          0, 2*Math.PI);
          this.context.stroke();
        },


        /**
        * setNoGridOn
        */
        setNoGridOn : function() {
          this.cellSize = GOL.zoom.schemes[GOL.zoom.current].cellSize + 1;
          this.cellSpace = 0;
        },


        /**
        * setNoGridOff
        */
        setNoGridOff : function() {
          this.cellSize = GOL.zoom.schemes[GOL.zoom.current].cellSize;
          this.cellSpace = 1;
        },


        /**
        * drawCell
        */
        //TODO: This should be a switch statement on state, right?
        drawCell : function (i, j, state) {

          if (state === "queued") {
            this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].queued;
          } else if (state === "alive") {
            if (this.age[i][j] > -1)
            this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].alive[this.age[i][j] % GOL.colors.schemes[GOL.colors.current].alive.length];
          } else { //State === "dead'"
          if (GOL.trail.current && this.age[i][j] < 0) {
            this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].trail[(this.age[i][j] * -1) % GOL.colors.schemes[GOL.colors.current].trail.length];
          } else {
            this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].dead;
          }
        }

        this.context.fillRect(this.cellSpace + (this.cellSpace * i) + (this.cellSize * i),
        this.cellSpace + (this.cellSpace * j) + (this.cellSize * j),
        this.cellSize, this.cellSize);

      },


      //Added by Drew to queue/group cell insertions
      queueCell : function(i, j) {
        if (GOL.automata.isQueued(i, j)) {
          this.unqueue(i, j);
          GOL.automata.removeCell(i, j, GOL.automata.queuedState);
        }else {
          this.queue(i, j);
          GOL.automata.addCell(i, j, GOL.automata.queuedState);
        }
      },


      /**
      * keepCellAlive
      */
      keepCellAlive : function(i, j) {
        if (i >= 0 && i < GOL.columns && j >=0 && j < GOL.rows) {
          this.age[i][j]++;
          this.drawCell(i, j, "alive");
        }
      },


      /**
      * changeCelltoAlive
      */
      changeCelltoAlive : function(i, j) {
        if (i >= 0 && i < GOL.columns && j >=0 && j < GOL.rows) {
          this.age[i][j] = 1;
          this.drawCell(i, j, "alive");
        }
      },


      /**
      * changeCelltoDead
      */
      changeCelltoDead : function(i, j) {
        if (i >= 0 && i < GOL.columns && j >=0 && j < GOL.rows) {
          this.age[i][j] = -this.age[i][j]; // Keep trail
          this.drawCell(i, j, "dead");
        }
      },

      queue: function(i, j) {
        if (i >= 0 && i < GOL.columns && j >=0 && j < GOL.rows) {
          this.drawCell(i, j, "queued");
        }
      },

      unqueue: function(i, j) {
        if (i >= 0 && i < GOL.columns && j >=0 && j < GOL.rows) {
          if (GOL.automata.isAlive(i, j)) {
            this.drawCell(i, j, "alive");
          } else{
            this.drawCell(i, j, "dead");
          }
        }
      }

    },

    //automata
    automata : {

      actualState : [],
      queuedState : [],
      serverState : [],
      queueCommitScheduled : false,
      serverCommitScheduled : false,
      redrawList : [],

      init : function () {
        this.actualState = [];
        this.queuedState = [];
        this.queueCommitScheduled = false;
        this.serverCommitScheduled = false;
      },

      nextGeneration : function() {
        var x, y, i, j, m, n, key, t1, t2, alive = 0, neighbours, deadNeighbours, allDeadNeighbours = {}, newState = [];
        this.redrawList = [];

        for (i = 0; i < this.actualState.length; i++) {
          this.topPointer = 1;
          this.bottomPointer = 1;

          for (j = 1; j < this.actualState[i].length; j++) {
            x = this.actualState[i][j];
            y = this.actualState[i][0];

            // Possible dead neighbours
            deadNeighbours = [[x-1, y-1, 1], [x, y-1, 1], [x+1, y-1, 1], [x-1, y, 1], [x+1, y, 1], [x-1, y+1, 1], [x, y+1, 1], [x+1, y+1, 1]];

            // Get number of live neighbours and remove alive neighbours from deadNeighbours
            neighbours = this.getNeighboursFromAlive(x, y, i, deadNeighbours);

            // Enumerate dead neighbors of live cells
            for (m = 0; m < 8; m++) {
              if (deadNeighbours[m] !== undefined) {
                key = deadNeighbours[m][0] + ',' + deadNeighbours[m][1]; // Create hashtable key

                if (allDeadNeighbours[key] === undefined) {
                  allDeadNeighbours[key] = 1;
                } else {
                  allDeadNeighbours[key]++;
                }
              }
            }

            if (!(neighbours === 0 || neighbours === 1 || neighbours > 3)) {
              this.addCell(x, y, newState);
              alive++;
              this.redrawList.push([x, y, 2]); // Keep alive
            } else {
              this.redrawList.push([x, y, 0]); // Kill cell
            }
          }
        }

        // Process dead neighbours
        // If dead cell has three neighbors, it's now alive
        for (key in allDeadNeighbours) {
          if (allDeadNeighbours[key] === 3) { // Add new Cell
            key = key.split(',');
            t1 = parseInt(key[0], 10);
            t2 = parseInt(key[1], 10);

            this.addCell(t1, t2, newState);
            alive++;
            this.redrawList.push([t1, t2, 1]);
          }
        }

        if (this.queueCommitScheduled) {
          for (i = 0; i < this.queuedState.length; i++) {
            for (j = 1; j < this.queuedState[i].length; j++) {
              x = this.queuedState[i][j];
              y = this.queuedState[i][0];

              this.addCell(x, y, newState);
            }
          }
        }


        // Add  cells from server queue
        if (this.serverCommitScheduled) {
          this.serverCommitScheduled = false;
          for (i = 0; i < this.serverState.length; i++) {
            for (j = 1; j < this.serverState[i].length; j++) {
              x = this.serverState[i][j];
              y = this.serverState[i][0];

              this.addCell(x, y, newState);
            }
          }
          this.serverState = [];
        }

        this.actualState = newState;

        // Have either base been destroyed?

        //Convert actualState for easier compare
        var reference = _.flatten(this.actualState.map(function (x) {
          var coordinateList = [];
          for (var i=1; i<x.length; i++) {
            coordinateList.push({y: x[0], x:x[i]});
          }
          return coordinateList;
        }), true); //true to only flatten one level

        for (p in GOL.players) {
          if (GOL.helpers.objectIntersection(reference, GOL.players[p].base).length < 4) {
            GOL.gameOver = true;
            GOL.gameResult = p + " Lost!";
            GOL.running = false;
            console.log("Game Over");
            console.log(GOL.gameResult);
            GOL.canvas.drawWorld();
          }
        }
        return alive;
      },


      topPointer : 1,
      middlePointer : 1,
      bottomPointer : 1,

      /**
      *
      */
      getNeighboursFromAlive : function (x, y, i, possibleNeighboursList) {
        var neighbours = 0, k;

        // Top
        if (this.actualState[i-1] !== undefined) {     //Line isn't lowest line
        if (this.actualState[i-1][0] === (y - 1)) {     //Line above exists
          for (k = this.topPointer; k < this.actualState[i-1].length; k++) {

            if (this.actualState[i-1][k] >= (x-1) ) { // If line ahas

              if (this.actualState[i-1][k] === (x - 1)) {
                possibleNeighboursList[0] = undefined;
                this.topPointer = k + 1;
                neighbours++;
              }

              if (this.actualState[i-1][k] === x) {
                possibleNeighboursList[1] = undefined;
                this.topPointer = k;
                neighbours++;
              }

              if (this.actualState[i-1][k] === (x + 1)) {
                possibleNeighboursList[2] = undefined;

                if (k == 1) {
                  this.topPointer = 1;
                } else {
                  this.topPointer = k - 1;
                }

                neighbours++;
              }

              if (this.actualState[i-1][k] > (x + 1)) {
                break;
              }
            }
          }
        }
      }

      // Middle
      for (k = 1; k < this.actualState[i].length; k++) {
        if (this.actualState[i][k] >= (x - 1)) {

          if (this.actualState[i][k] === (x - 1)) {
            possibleNeighboursList[3] = undefined;
            neighbours++;
          }

          if (this.actualState[i][k] === (x + 1)) {
            possibleNeighboursList[4] = undefined;
            neighbours++;
          }

          if (this.actualState[i][k] > (x + 1)) {
            break;
          }
        }
      }

      // Bottom
      if (this.actualState[i+1] !== undefined) {
        if (this.actualState[i+1][0] === (y + 1)) {
          for (k = this.bottomPointer; k < this.actualState[i+1].length; k++) {
            if (this.actualState[i+1][k] >= (x - 1)) {

              if (this.actualState[i+1][k] === (x - 1)) {
                possibleNeighboursList[5] = undefined;
                this.bottomPointer = k + 1;
                neighbours++;
              }

              if (this.actualState[i+1][k] === x) {
                possibleNeighboursList[6] = undefined;
                this.bottomPointer = k;
                neighbours++;
              }

              if (this.actualState[i+1][k] === (x + 1)) {
                possibleNeighboursList[7] = undefined;

                if (k == 1) {
                  this.bottomPointer = 1;
                } else {
                  this.bottomPointer = k - 1;
                }

                neighbours++;
              }

              if (this.actualState[i+1][k] > (x + 1)) {
                break;
              }
            }
          }
        }
      }

      return neighbours;
    },


    /**
    *
    */
    isAlive : function(x, y) {
      var i, j;

      for (i = 0; i < this.actualState.length; i++) {
        if (this.actualState[i][0] === y) {
          for (j = 1; j < this.actualState[i].length; j++) {
            if (this.actualState[i][j] === x) {
              return true;
            }
          }
        }
      }
      return false;
    },

    //TODO: Merge this with isAlive? This is the same code with names switched.
    // May be simplest to leave it like this
    isQueued : function(x, y) {
      var i, j;

      for (i = 0; i < this.queuedState.length; i++) {
        if (this.queuedState[i][0] === y) {
          for (j = 1; j < this.queuedState[i].length; j++) {
            if (this.queuedState[i][j] === x) {
              return true;
            }
          }
        }
      }
      return false;
    },

    /**
    *
    */
    removeCell : function(x, y, state) {
      var i, j;

      for (i = 0; i < state.length; i++) {
        if (state[i][0] === y) {

          if (state[i].length === 2) { // Remove all Row
            state.splice(i, 1);
          } else { // Remove Element
            for (j = 1; j < state[i].length; j++) {
              if (state[i][j] === x) {
                state[i].splice(j, 1);
              }
            }
          }
        }
      }
    },


    /**
    * Moderately Complicated to efficiently use Data Structure
    */
    addCell : function(x, y, state) {
      if (state.length === 0) {
        state.push([y, x]);
        return;
      }

      var k, n, m, tempRow, newState = [], added;

      if (y < state[0][0]) { // Add to Head
        newState = [[y,x]];
        for (k = 0; k < state.length; k++) {
          newState[k+1] = state[k];
        }

        for (k = 0; k < newState.length; k++) {
          state[k] = newState[k];
        }

        return;

      } else if (y > state[state.length - 1][0]) { // Add to Tail
        state[state.length] = [y, x];
        return;

      } else { // Add to Middle

        for (n = 0; n < state.length; n++) {
          if (state[n][0] === y) { // Level Exists
            tempRow = [];
            added = false;
            for (m = 1; m < state[n].length; m++) {
              if ((!added) && (x < state[n][m])) {
                tempRow.push(x);
                added = !added;
              }
              tempRow.push(state[n][m]);
            }
            tempRow.unshift(y);
            if (!added) {
              tempRow.push(x);
            }
            state[n] = tempRow;
            return;
          }

          if (y < state[n][0]) { // Create Level
            newState = [];
            for (k = 0; k < state.length; k++) {
              if (k === n) {
                newState[k] = [y,x];
                newState[k+1] = state[k];
              } else if (k < n) {
                newState[k] = state[k];
              } else if (k > n) {
                newState[k+1] = state[k];
              }
            }

            for (k = 0; k < newState.length; k++) {
              state[k] = newState[k];
            }

            return;
          }
        }
      }
    }

  },

  //Helpers
  helpers : {
    objectIntersection : function(array){
      var slice = Array.prototype.slice; // added this line as a utility
      var rest = slice.call(arguments, 1);
      return _.filter(_.uniq(array), function(item) {
        return _.every(rest, function(other) {
          //return _.indexOf(other, item) >= 0; //Replaced from underscore so useful with objects
          return _.any(other, function(element) { return _.isEqual(element, item); });
        });
      });
    },
    arraysEqual : function (a, b) {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (a.length != b.length) return false;

      // If you don't care about the order of the elements inside
      // the array, you should sort both arrays here.

      for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    },

    urlParameters : null, // Cache


    /**
    * Return a random integer from [min, max]
    */
    random : function(min, max) {
      return min <= max ? min + Math.round(Math.random() * (max - min)) : null;
    },


    /**
    * Get URL Parameters
    */
    getUrlParameter : function(name) {
      if (this.urlParameters === null) { // Cache miss
        var hash, hashes, i;

        this.urlParameters = [];
        hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');

        for (i = 0; i < hashes.length; i++) {
          hash = hashes[i].split('=');
          this.urlParameters.push(hash[0]);
          this.urlParameters[hash[0]] = hash[1];
        }
      }

      return this.urlParameters[name];
    },


    /**
    * Register Event
    */
    registerEvent : function (element, event, handler, capture) {
      if (/msie/i.test(navigator.userAgent)) {
        element.attachEvent('on' + event, handler);
      } else {
        element.addEventListener(event, handler, capture);
      }
    },

    /**
    * Location of mouse in Canvas
    */
    mouseCoordinates : function (e){
      // http://www.malleus.de/FAQ/getImgMousePos.html
      // http://www.quirksmode.org/js/events_properties.html#position
      var event, x, y, domObject, posx = 0, posy = 0, top = 0, left = 0, cellSize = GOL.zoom.schemes[GOL.zoom.current].cellSize + 1;

      event = e;
      if (!event) {
        event = window.event;
      }

      if (event.pageX || event.pageY) 	{
        posx = event.pageX;
        posy = event.pageY;
      } else if (event.clientX || event.clientY) 	{
        posx = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        posy = event.clientY + document.body.scrollTop + document.documentElement.scrollTop;
      }

      domObject = event.target || event.srcElement;

      while ( domObject.offsetParent ) {
        left += domObject.offsetLeft;
        top += domObject.offsetTop;
        domObject = domObject.offsetParent;
      }

      domObject.pageTop = top;
      domObject.pageLeft = left;

      return {
        x:posx - domObject.pageLeft,
        y:posy - domObject.pageTop
      };
    },


    /**
    * Location of coordinate in cells
    */
    coordinatePosition: function (c) {
      var x, y, cellSize = GOL.zoom.schemes[GOL.zoom.current].cellSize + 1;
      return {
        x:  Math.ceil(c.x/cellSize - 1),
        y:  Math.ceil(c.y/cellSize - 1)
      };
    },

    /**
    * Location of mouse in cells
    */
    mousePosition : function (e) {
      return GOL.helpers.coordinatePosition(GOL.helpers.mouseCoordinates(e));
    },

    //Base cells from coordinates of center
    baseFromCoordinates : function (center) {
      var c = GOL.helpers.coordinatePosition(center);
      return [
        {x: c.x, y: c.y},
        {x: c.x+1, y: c.y},
        {x: c.x, y:c.y+1},
        {x: c.x+1, y:c.y+1}
      ];
    },

    distance : function(p1, p2) {
      var a = p1[1]-p2[1];
      var b = p1[0]-p2[0];
      return Math.sqrt(a*a + b*b);
    },

  }

};

GOL.helpers.registerEvent(window, 'load', function () {
  GOL.init();
}, false);

return GOL;
}());
