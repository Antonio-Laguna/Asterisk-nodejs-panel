/**
 * Module dependencies.
 */
var express = require('express'),
    server = express(),
    Routes = require('./routes'),
    App = require('./modules/app.js'),
    browser_ban = require('./modules/browser_ban.js'),
    pbx_bugs_solver = require('./modules/pbx_bugs_solver.js'),
    async = require('async'),
    database = require('./libraries/mysql.js'),
    socketio = require('socket.io'),
    CronJob = require('cron').CronJob,
    mysql = require('mysql');

var io = socketio.listen(server.listen(8080));

io.configure('production', function(){
    console.log("***** Server in production mode *********");
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging
    io.set('transports', [                     // enable all transports (optional if you want flashsocket)
        'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'
    ]);
});
io.configure('development', function(){
    io.set('transports', ['websocket']);
});

// Undefined max listeners!
process.setMaxListeners(0);

var app = new App(database, io, async),
    routes = new Routes(app, database, io);

// CronJob which restarts stats for all data
var cron_job = new CronJob('00 00 00 * * *', app.startReset,null,true);

app.init(app.loadTodayStats);

/* Server configuration */
server.configure(function(){
    server.use(express.favicon());
    server.use(express.logger('dev'));
    server.set('views', __dirname + '/views');
    server.set('view engine', 'jade');
    server.use(express.bodyParser());
    server.use(express.cookieParser());
    server.use(express.methodOverride());
    server.use(express.static(__dirname + '/public'));
    server.use("/public", express.static(__dirname + '/public'));
    server.use(browser_ban());
    server.use(pbx_bugs_solver());
    server.use(server.router);
});

server.configure('development', function(){
    server.use(express.errorHandler());
});

/**** Routes definition *****/
server.get('/', routes.index);

//region Agents management
/*
 ##########################
 ###  Agents management ###
 ##########################
 */
/**
 * When an agent logs into the phone this function will be called.
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /logAgent/1010
 */
server.get('/logAgent/:agentCode', routes.logAgent);

/**
 * When an agent unlog it's phone this function will be called.
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /unLogAgent/1010
 */
server.get('/unLogAgent/:agentCode', routes.unLogAgent);

/**
 * When an agent enters in administrative time, this function will be called.
 *
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /administrative/1010
 */
server.get('/administrative/:agentCode', routes.changeStatusNoCall);
/**
 * When an agent enters in resting time, this function will be called.
 *
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /resting/1010
 */
server.get('/resting/:agentCode', routes.changeStatusNoCall);
/**
 * When an agent disable administrative time or unavailable mode, this function will be called.
 *
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /available/1010
 */
server.get('/available/:agentCode', routes.changeStatusNoCall);
/**
 * When an agent put him/herself into unavailable, this function will be called.
 *
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /meeting/1010
 */
server.get('/meeting/:agentCode', routes.changeStatusNoCall);
/**
 * When an agent's phone starts or stops ringing, this function will be called
 *
 * @action : Whether the phone 'start' or 'stop' ringing
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /ringing/start/1010
 */
server.get('/ringing/:action/:agentCode', routes.agentRing);
/**
 * When an agent enters glorytime, this function will be called
 *
 * @agentCode : The Agent Code or Extension.
 *
 * URL Example: /glorytime/1010
 */
server.get('/glorytime/:agentCode', routes.changeStatusNoCall);
//endregion
//region Calls management
/*
 ##########################
 #### Calls management ####
 ##########################
 */
/**
 * When a call enters in a queue, this function will be called
 *
 * @queue : The queue that is receiving the call.
 * @uniqueid : The uniqueid of the call.
 *
 * URL Example: /call/APPLUSCola/1234567890
 */
server.get('/call/:queue/:uniqueid', routes.dispatchCallInQueue);
/**
 * When a call is answered by an agent, this function will be called.
 *
 * @queue : The queue that is receiving the call.
 * @uniqueid : The uniqueid of the call.
 * @agentCode : The agent whom is answering the call.
 *
 * URL Example: /answerCall/APPLUSCola/1234567890/1010
 */
server.get('/answerCall/:queue/:uniqueid/:agentCode', routes.dispatchCallInQueue);
/**
 * When an agent performs a call, this function will be called.
 *
 * @agentCode : The agent whom is performing the call.
 * @queue : The queue that is receiving the call.
 *
 * URL Example: /externalCall/1010/APPLUSCola
 */
server.get('/externalCall/:agentCode/:queue', routes.externalCall);
/**
 * When a call hangs, this function will be called.
 *
 * @type : This indicates where the call were terminated. Could have this values:
 *      * 'agente' : If it ends in an agent
 *      * 'cola' : If it ends in a queue
 * @uniqueid : The uniqueid of the call
 * @agentOrQueue : The AgentCode or the Queue Name where the call terminated.
 *
 * URL Example 1: /hangCall/cola/1234567890/APPLUSCola
 * URL Example 2: /hangCall/agente/1234567890/1010
 */
server.get('/hangCall/:type/:uniqueid/:agentOrQueue', routes.hangCall);
/**
 * When a is tranferred from an agent to another one, this function will be called
 *
 * @uniqueid : The uniqueid of the call
 * @agent_from : The agent whom is transferring the call
 * @agent_to : The agent whom is receiving the call
 * @queue_name : The queue in which is the call that's going to be transferred
 */
server.get('/transferCall/:uniqueid/from/:agent_from/to/:agent_to/at/:queue_name', routes.transferCall);
/**
 * Simple function that receives the total calls and the calls in queue from Asterisk
 *
 * @total_calls : Total calls in the system to calculate the primary occupation
 * @calls_in_queue : Current calls in queue
 */
server.get('/updateCalls/:total_calls/:calls_in_queue', routes.updateCalls);
//endregion
//region Stats management
/**
 * This will try to find a client and will redirect to the stats page of the client
 *
 * @clientName : The name of the client
 *
 * URL Example: /stats/clients/Applus
 */
server.get('/stats/clients/:client_name', routes.getClientStats);
/**
 * This will return the actual stats for the client in JSON format
 *
 * @clientName : The name of the client
 *
 * URL Example: /stats/json/clients/Applus
 */
server.get('/stats/json/clients/:client_name/', routes.getClientStats);
/**
 * This will try to find a client and will redirect to the stats page of the client using a given day
 *
 * @clientName : The name of the client
 * @from_date : The day which we want o see the stats
 *
 * URL Example: /stats/clients/Applus
 */
server.get('/stats/clients/:client_name/:from_date', routes.getClientStats);
/**
 * This will try to find a client and will redirect to the stats page of the client given a range date
 * it WILL validate that from_date is minor than to_date
 *
 * @clientName : The name of the client
 * @from_date
 *
 * URL Example: /stats/clients/Applus
 */
server.get('/stats/clients/:client_name/:from_date/to/:to_date', routes.getClientStats);
/**
 * This function returns the current status of an agent. `all` can be used to fetch all agents statuses.
 *
 * @agent_code : The extension of the agent to request or, `all`
 *
 * URL Example: /stats/clients/Applus
 */
server.get('/status/agents/:agent_code', routes.getAgentStatus);
/**
 * This function returns the current status of an agent. `all` can be used to fetch all agents statuses in JSON.
 *
 * @agent_code : The extension of the agent to request or, `all`
 *
 * URL Example: /stats/clients/Applus
 */
server.get('/status/agents/:agent_code/json', routes.getAgentStatus);
//endregion
//region Debugging functions
/**
 * Simple function that logs the status of a queue. Usefull to see what calls are currently enqueued.
 */
server.get('/debug/queue/:queue_name', routes.debugQueue);
/**
 * Simple function that logs the status of an agent.
 */
server.get('/debug/agent/:agent_code', routes.debugAgent);
/**
 * Simple function that logs some usage info of the pannel
 */
server.get('/debug/stats/', routes.panelStats);
//endregion
//region Utility functions
/**
 * This route will reload all data from all sources and will send a signal to all panels so they refresh
 */
server.get('/reload', routes.reload);
/**
 * Function that stablish a mobile sim available or busy
 */
server.get('/sim/:sim_number/:available', routes.simAvailability);
//endregion

// On connection action
io.sockets.on('connection', function (socket) {
    // If someone new comes, it will notified of the current status of the application
    var endpoint = socket.manager.handshaken[socket.id].address;
    console.log('Someone (%s) connected to the pannel', endpoint.address);

    app.sendCurrentStatus(socket.id, endpoint.address);

    // Binding to socket events
    socket.on('sendCall', app.sendCallToAgent);
    socket.on('forceUnlog', app.forceUnlogAgent);
    socket.on('disconnect', function() {
        app.deleteConnectedClient(socket.manager.handshaken[socket.id].address.address);
    });
});

// Reload all current pannels after 5 seconds
// If the server reload because an error this will tell all connected clients to reload
setTimeout(function(){
    io.sockets.emit('reload', {});
}, 5000);