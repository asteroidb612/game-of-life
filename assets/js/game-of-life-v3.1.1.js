/*jslint onevar: true, undef: false, nomen: true, eqeqeq: true, plusplus: false, bitwise: true, regexp: true, newcap: true, immed: true  */

/**
 * Game of Life - JS & CSS
 * http://pmav.eu
 * 04/Sep/2010
 */

(function () {

  //Stats
  var stats = new Stats();
  stats.setMode( 0 ); // 0 FPS, 1 MS

  // align top-left
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.right = '0px';
  stats.domElement.style.bottom = '0px';
  stats.domElement.style.zIndex = '999999';

  document.addEventListener("DOMContentLoaded", function() {
    document.body.appendChild( stats.domElement );
  });

  var GOL = {

    //Game State
    generation : 0,
    columns : 0,
    rows : 0,

    running : false,
    autoplay : false,//true,

    gameOver : false,
    gameResult : "",

    messageLoc : [90, 41],
    //    flag : [[41, 1], [41, 2], [42, 1], [42, 2]],
    //    enemyFlag : [[41, 177], [41, 178], [42, 177], [42, 178]],

    // Clear state
    clear : {
      schedule : false
    },

    initialState : '[{"41": [1,2, 177, 178]}, {"42": [1,2, 177, 178]}, {"46": [5,6,7], "45":[7], "44":[6]}]',

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

    //Motley Functiongs
    loadState : function() {
      var state, i, j, y, s = this.helpers.getUrlParameter('s');

      if ( s === 'random') {
        this.randomState();
      } else {
        if (s == undefined) {
          s = GOL.initialState;
        }

        state = jsonParse(decodeURI(s));

        for (i = 0; i < state.length; i++) {
          for (y in state[i]) {
            for (j = 0 ; j < state[i][y].length ; j++) {
              GOL.automata.addCell(state[i][y][j], parseInt(y, 10), GOL.automata.actualState);
            }
          }
        }
      }
    },


    /**
     * On Load Event
     */
    init : function() {
//      try {
        this.automata.init();   // Reset/init algorithm
        this.registerEvents();  // Register event handlers
        this.initSocket();      // Connect to server
 //     } catch (e) {
 //       alert("Error: "+e);
 //     }
    },


    initSocket : function() { 
      //this is GOL within initSocket, BUT NOT WITHIN CALLBACKS
      this.socket = io();

      this.socket.on("id", function(id){
        GOL.playerID = id;
        console.log("I am " + GOL.playerID);
      });

      this.socket.on("go", function(game) {
        console.log("Recieved Go");
        GOL.columns = game.columns;
        GOL.rows = game.rows;
        GOL.generation = game.generation;
        GOL.players = game.clients;
        GOL.enemies = [];
        for (c in GOL.players) {
          if (c.id !== GOL.playerID) {
            GOL.enemies[GOL.enemies.length] = GOL.players[c];
          }
        }
        console.log("Playing against ", GOL.enemies);
        GOL.enemyFlag = GOL.enemies[0].base
        GOL.flag = game.clients[GOL.playerID].base;
        GOL.automata.init()
        GOL.tickScheduled = true;
        GOL.running = true;
        GOL.canvas.init();     // Init canvas GUI
        GOL.canvas.drawWorld();
        GOL.loadState();       //TODO Load state from server
        GOL.nextStep();
      });

      this.socket.on("generation", function(generation) {
        //console.log("Generation ", generation);
        GOL.generation++;
        var response = {
          "gameOver": GOL.gameOver, 
          "count": GOL.element.livecells,
          "changed" : GOL.automata.queueCommitScheduled
        };
        if (response["changed"]) {
          response["moves"] = GOL.automata.queuedState;
          //console.log("Submitting Changes", response);
        }
        GOL.tickScheduled = true;;
        GOL.socket.emit("input", generation, response);
      });

      this.socket.on("changes", function(changes) { // This may only allow one user to make changes at a time
        console.log("Scheduleing Changes", changes);
        GOL.automata.serverState = changes.moves;
        GOL.automata.serverCommitScheduled = true;
      });
    },

    /**
     * Clean up actual state and prepare a new run
     */
    cleanUp : function() {
      this.automata.init(); // Reset/init algorithm
    },


    /* registerEvents
     *  Register event handlers for this session (one time execution)
     */
    registerEvents : function() {

      // Keyboard Events
      this.helpers.registerEvent(document.body, 'keyup', this.handlers.keyboard, false);

      // Controls
      this.helpers.registerEvent(document.getElementById('buttonRun'), 'click', this.handlers.buttons.run, false);
      this.helpers.registerEvent(document.getElementById('buttonStep'), 'click', this.handlers.buttons.step, false);
      this.helpers.registerEvent(document.getElementById('buttonClear'), 'click', this.handlers.buttons.clear, false);
      this.helpers.registerEvent(document.getElementById('buttonExport'), 'click', this.handlers.buttons.export_, false);

      // Layout
      this.helpers.registerEvent(document.getElementById('buttonTrail'), 'click', this.handlers.buttons.trail, false);
      this.helpers.registerEvent(document.getElementById('buttonGrid'), 'click', this.handlers.buttons.grid, false);
      this.helpers.registerEvent(document.getElementById('buttonColors'), 'click', this.handlers.buttons.colors, false);
    },

    //Run Next Step
    nextStep : function() {
      var i, x, y, r, liveCellNumber, algorithmTime, guiTime;

      // Algorithm run

      if (GOL.tickScheduled) {
        console.log("Tick for ", GOL.generation);
        algorithmTime = (new Date());

        //Does the real work of advancing state of game
        //Rest of this function does the graphics
        GOL.element.livecells = GOL.automata.nextGeneration();

        algorithmTime = (new Date()) - algorithmTime;
        GOL.tickScheduled = false;
      }


      // Canvas run

      guiTime = (new Date());

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

      guiTime = (new Date()) - guiTime;

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
        stats.begin();
        window.requestAnimationFrame(GOL.nextStep);
        stats.end();
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


      /**
       *
       */
      canvasMouseDown : function(event) {
        var position = GOL.helpers.mousePosition(event);
        GOL.canvas.queueCell(position[0], position[1]);
        GOL.handlers.lastX = position[0];
        GOL.handlers.lastY = position[1];
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
          var position = GOL.helpers.mousePosition(event);
          if ((position[0] !== GOL.handlers.lastX) || (position[1] !== GOL.handlers.lastY)) {
            GOL.canvas.queueCell(position[0], position[1]);
            GOL.handlers.lastX = position[0];
            GOL.handlers.lastY = position[1];
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

        if (event.keyCode === 67) { // Key: Space
          GOL.automata.queueCommitScheduled= true;
          console.log("Commit Registered");
        } else if (event.keyCode === 82 ) { // Key: R
          GOL.handlers.buttons.run();
        } else if (event.keyCode === 83 ) { // Key: S
          GOL.handlers.buttons.step();
        }
      },


      buttons : {

        /**
         * Button Handler - Run
         */
        run : function() {
          GOL.element.hint.style.display = 'none';

          GOL.running = !GOL.running;
          if (GOL.running) {
            GOL.nextStep();
            document.getElementById('buttonRun').value = 'Stop';
          } else {
            document.getElementById('buttonRun').value = 'Run';
          }
        },


        /**
         * Button Handler - Next Step - One Step only
         */
        step : function() {
          if (!GOL.running) {
            GOL.nextStep();
          }
        },


        /**
         * Button Handler - Clear World
         */
        clear : function() {
          if (GOL.running) {
            GOL.clear.schedule = true;
            GOL.running = false;
            document.getElementById('buttonRun').value = 'Run';
          } else {
            GOL.cleanUp();
          }
        },


        /**
         * Button Handler - Remove/Add Trail
         */
        trail : function() {
          GOL.element.messages.layout.innerHTML = GOL.trail.current ? 'Trail is Off' : 'Trail is On';
          GOL.trail.current = !GOL.trail.current;
          if (GOL.running) {
            GOL.trail.schedule = true;
          } else {
            GOL.canvas.drawWorld();
          }
        },


        /**
         *
         */
        colors : function() {
          GOL.colors.current = (GOL.colors.current + 1) % GOL.colors.schemes.length;
          GOL.element.messages.layout.innerHTML = 'Color Scheme #' + (GOL.colors.current + 1);
          if (GOL.running) {
            GOL.colors.schedule = true; // Delay redraw
          } else {
            GOL.canvas.drawWorld(); // Force complete redraw
          }
        },


        /**
         *
         */
        grid : function() {
          GOL.grid.current = (GOL.grid.current + 1) % GOL.grid.schemes.length;
          GOL.element.messages.layout.innerHTML = 'Grid Scheme #' + (GOL.grid.current + 1);
          if (GOL.running) {
            GOL.grid.schedule = true; // Delay redraw
          } else {
            GOL.canvas.drawWorld(); // Force complete redraw
          }
        },


        /**
         * Button Handler - Export State
         */
        export_ : function() {
          var i, j, url = '', cellState = '', params = '';

          for (i = 0; i < GOL.automata.actualState.length; i++) {
            cellState += '{"'+GOL.automata.actualState[i][0]+'":[';
            //cellState += '{"one":[';
            for (j = 1; j < GOL.automata.actualState[i].length; j++) {
              cellState += GOL.automata.actualState[i][j]+',';
            }
            cellState = cellState.substring(0, cellState.length - 1) + ']},';
          }

          cellState = cellState.substring(0, cellState.length - 1) + '';

          if (cellState.length !== 0) {
            url = (window.location.href.indexOf('?') === -1) ? window.location.href : window.location.href.slice(0, window.location.href.indexOf('?'));

            params = '?autoplay=0' +
              '&trail=' + (GOL.trail.current ? '1' : '0') +
              '&grid=' + (GOL.grid.current + 1) +
              '&colors=' + (GOL.colors.current + 1) +
              '&zoom=' + (GOL.zoom.current + 1) +
              '&s=['+ cellState +']';

            document.getElementById('exportUrlLink').href = params;
            document.getElementById('exportTinyUrlLink').href = 'http://tinyurl.com/api-create.php?url='+ url + params;
            document.getElementById('exportUrl').style.display = 'inline';
          }
        }

      }

    },

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
            } else {
              this.drawCell(i, j, "false");
            }
          }
        }

        if (GOL.gameOver) {
          this.context.font = "48px sans";
          this.context.textAlign = "center";
          this.context.fillText("Game Over",  (this.cellSize + this.cellSpace) * GOL.messageLoc[0], (this.cellSize + this.cellSpace) * GOL.messageLoc[1]);

          this.context.font = "36px sans";
          this.context.fillText(GOL.gameResult,  (this.cellSize + this.cellSpace) * GOL.messageLoc[0], (this.cellSize + this.cellSpace) * GOL.messageLoc[1] + 30);
        }
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
        } else {
          if (GOL.trail.current && this.age[i][j] < 0) {
            this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].trail[(this.age[i][j] * -1) % GOL.colors.schemes[GOL.colors.current].trail.length];
          } else {
            //TODO Reduce to one in case of radii implementation
            if (i < 60) {
              this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].home;
            } else if (i < 120) {
              this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].dead;
            } else {
              this.context.fillStyle = GOL.colors.schemes[GOL.colors.current].enemy;
            }
          }
        }

        this.context.fillRect(this.cellSpace + (this.cellSpace * i) + (this.cellSize * i),
          this.cellSpace + (this.cellSpace * j) + (this.cellSize * j),
          this.cellSize, this.cellSize);

      },


      //Added by Drew to queue/group cell insertions
      queueCell : function(i, j) {
        if (i < 60) {
          if (GOL.automata.isQueued(i, j)) {
            this.unqueue(i, j);
            GOL.automata.removeCell(i, j, GOL.automata.queuedState);
          }else {
            this.queue(i, j);
            GOL.automata.addCell(i, j, GOL.automata.queuedState);
          }
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


        // Add in anything from the Server
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
          this.queuedState = [];
        }

        this.actualState = newState;

        // Have either flags been destroyed?

        //Convert actualState to flag style state
        var reference = _.flatten(this.actualState.map(function (x) {
          var coordinateList = [];
          for (var i=1; i<x.length; i++) {
            coordinateList.push([x[0], x[i]]);
          }
          return coordinateList;
        }), true); //true to only flatten one level

        if (_.intersection(reference, GOL.flag).length < 4) {
          GOL.gameOver = true;
          GOL.gameResult = "You Lost";
          GOL.canvas.drawWorld();
          GOL.running = false;
          console.log("Game Over");
        }
        if (_.intersection(reference, GOL.enemyFlag).length < 4) { //Assumes enemy has same number of flags
          GOL.gameOver = true;
          GOL.gameResult = "You Won!";
          GOL.canvas.drawWorld();
          GOL.running = false;
          console.log("Game Over");
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
       *
       */
      mousePosition : function (e) {
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

        x = Math.ceil(((posx - domObject.pageLeft)/cellSize) - 1);
        y = Math.ceil(((posy - domObject.pageTop)/cellSize) - 1);

        return [x, y];
      }
    }

  };

  GOL.helpers.registerEvent(window, 'load', function () {
    GOL.init();
  }, false);

}());
