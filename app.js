/* Requiring Express */
var express = require('express');
var app = express.createServer();
var timeHelper = require('./helpers/time.js');
var arrayHelper = require('./helpers/array.js');
app.listen(8080);
var Agent = require('./models/agent.js');
var Queue = require('./models/queues.js');
var Agents = []; // This will hold agents
/* Requiring and setting up MySQL Configuration*/
var mysql = require('mysql');
var PBX_DATABASE = '';
var mysql_client = mysql.createClient({
    host: '',
    user: '',
    password: '',
    database: PBX_DATABASE
});
var calls = 0;
var refetcher = {
    queuesOP : false,
    agentsOP : false,
    necessary : false,
    perform : function (){
        this.queuesOP = false;
        this.agentsOP = true;

        queues.refetchQueues(mysql_client,this);
    },
    done : function (who, necessary){
        if (who === 'queues')
            this.queuesOP = true;
        else
            this.agentsOP = true;
        this.necessary = this.necessary || necessary;
        if (this.queuesOP && this.agentsOP && necessary){
            io.sockets.emit('reload', {});
        }
    }
};

/* Requiring Socket.io */
var io = require('socket.io').listen(app);
app.use("/assets", express.static(__dirname + '/assets'));
app.redirect('inicio', function(req,res){
    return '/';
});
var queues = new Queue(mysql_client, arrayHelper, timeHelper);
/* Routes, the core of the application */

/*Index*/
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});
/* Reload
 *
 * The function perform a refetch, currently for queues but should catch agents too.
 */
app.get('/reload',function (req,res){
    refetcher.perform();
    res.send('ok');
});
/*
    ##########################
    #### Agents management ####
    ##########################
*/
/*
 * When an agent logs into the phone this function will be called.
 *
 * @:agentCode : The Agent Code or Extension.
 *
 * URL Example: /logAgent/1010
 */
app.get('/logAgent/:agentCode',function (req, res){
    mysql_client.query('SELECT agentes.nombre as nombre,'+ // You should adapt the query to your system
                        ' agentes.apellido1 as apellido1,'+
                        ' agentes.apellido2 as apellido2,'+
                        ' agentes.codAgente as codAgente,'+
                        ' relcolaext.cola as cola,'+
                        ' relcolaext.prioridad as prioridad'+
                        ' FROM agentes, relcolaext'+
                        ' WHERE relcolaext.codAgente = agentes.codAgente'+
                        ' AND agentes.codAgente = "SIP/' + req.params.agentCode + '"',
    function (err, results, fields){
        if (err){
            throw err;
        }
        if (arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente') === -1){ // It's not already connected
            // If we have a result, we push it into the agents array
            Agents.push( new Agent(
                    req.params.agentCode,
                    results[0].nombre,
                    results[0].apellido1,
                    results[0].apellido2,
                    results,
                    io
            ));
            console.log('Agent has logged %s %s [%s]', results[0].nombre, results[0].apellido1, req.params.agentCode);
            res.send('ok'); // Avoid unending requests
        }
        else
            res.send('Agent were already added');
    });
});
/*
 * When an agent unlog it's phone this function will be called.
 *
 * @:agentCode : The Agent Code or Extension.
 *
 * URL Example: /unLogAgent/1010
 */
app.get('/unLogAgent/:agentCode', function (req, res){
    // We have to delete it from our mantained list of logged agents
    arrayHelper.deleteFromArrayOfObjects(Agents,req.params.agentCode,'codAgente');
    console.log('Unlogged agent %s', req.params.agentCode);
    io.sockets.emit('unLogAgent', req.params.agentCode);
    res.send('ok');
});
/*
 * When an agent enters in administrative time, this function will be called.
 *
 * @:agentCode : The Agent Code or Extension.
 *
 * URL Example: /administrative/1010
 */
app.get('/administrative/:agentCode',function (req,res){
    console.log ('Agent %s entered in administrative time', req.params.agentCode);
    var pos_agent = arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente');
    Agents[pos_agent].changeStatus(3,io,null);
    res.send('ok');
});
/*
 * When an agent put him/herself into unavailable, this function will be called.
 *
 * @:agentCode : The Agent Code or Extension.
 *
 * URL Example: /unavailable/1010
 */
app.get('/unavailable/:agentCode',function (req,res){
    console.log ('Agent %s became unavailable', req.params.agentCode);
    var pos_agent = arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente');
    Agents[pos_agent].changeStatus(2,io,null);
    res.send('ok');
});
/*
 * When an agent disable administrative time or unavailable mode, this function will be called.
 *
 * @:agentCode : The Agent Code or Extension.
 *
 * URL Example: /available/1010
 */
app.get('/available/:agentCode',function (req,res){
    console.log ('Agent %s became available', req.params.agentCode);
    var pos_agent = arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente');
    Agents[pos_agent].changeStatus(1,io,null);
    res.send('ok');
});
/*
    ##########################
    #### Calls management ####
    ##########################
*/
/*
 * When a call enters in a queue, this function will be called
 *
 * @:queue : The queue that is receiving the call.
 * @:uniqueid : The uniqueid of the call.
 *
 * URL Example: /call/APPLUSCola/1234567890
 */
app.get('/call/:queue/:uniqueid',function (req,res){
    console.log ('Incoming call [%s] to queue %s', req.params.uniqueid, req.params.queue);
    updatePrimary(1);
    queues.dispatchCall({
        uniqueid: req.params.uniqueid,
        queue: req.params.queue,
        type: 'in',
        io: io
    });
    res.send('ok');
});
/*
 * When a call is answered by an agent, this function will be called.
 *
 * @:queue : The queue that is receiving the call.
 * @:uniqueid : The uniqueid of the call.
 * @:agentCode : The agent whom is answering the call.
 *
 * URL Example: /answerCall/APPLUSCola/1234567890/1010
 */
app.get('/answerCall/:queue/:uniqueid/:agentCode',function (req,res){
    console.log ('Call answered by %s', req.params.agentCode);
    var pos_agent = arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente');

    queues.dispatchCall({
        uniqueid: req.params.uniqueid,
        queue: req.params.queue,
        type: 'out',
        io: io
    });
    Agents[pos_agent].changeStatus(4,io,req.params.queue.replace('Cola',''));
    res.send('ok');
});
/*
 * When an agent performs a call, this function will be called.
 *
 * @:agentCode : The agent whom is performing the call.
 * @:queue : The queue that is receiving the call.
 *
 * URL Example: /externalCall/1010/APPLUSCola
 */
app.get('/externalCall/:agentCode/:queue',function (req,res){
    console.log ('Outgoing call from %s', req.params.agentCode);
    var pos_agent = arrayHelper.arrayObjectIndexOf(Agents,req.params.agentCode,'codAgente');
    Agents[pos_agent].changeStatus(5,io,req.params.queue.replace('Cola',''));
    res.send('ok');
});
/*
 * When a call hangs, this function will be called.
 *
 * @:type : This indicates where the call were terminated. Could have this values:
 *      * 'agente' : If it ends in an agent
 *      * 'cola' : If it ends in a queue
 * @:uniqueid : The uniqueid of the call
 * @:agentOrQueue : The AgentCode or the Queue Name where the call terminated.
 *
 * URL Example 1: /hangCall/cola/1234567890/APPLUSCola
 * URL Example 2: /hangCall/agente/1234567890/1010
 */
app.get('/hangCall/:type/:uniqueid/:agentOrQueue',function (req,res){
    console.log ('Call finished at %s', req.params.type);
    updatePrimary(-1);

    if (req.params.type === 'agente'){
        var pos_agent = arrayHelper.arrayObjectIndexOf(Agents, req.params.agentOrQueue, 'codAgente');
        Agents[pos_agent].endCall(io);
    } else {
        queues.dispatchCall({
            queue: req.params.agentOrQueue.replace('Cola',''),
            uniqueid: req.params.uniqueid,
            type: 'out',
            abandoned: true,
            io: io
        });
    }
    res.send('ok');
});
/* ### Socket.io Stuff ### */
io.disable('heartbeats');
io.sockets.on('connection', function (socket) {
    // If someone new comes, it will notified of the current status of the application
    console.log('Someone connected to the pannel');
    sendCurrentStatus(io,socket.id);
});

/* Functions */
function calculateAgentTime(agents,timeHelper){
    for (var i = 0, len = agents.length; i < len; i ++){
        agents[i].calculateTimes(timeHelper);
    }
}
function sendCurrentStatus (io, socketid){
    var status = {};
    if (Agents.length > 0){
        calculateAgentTime(Agents,timeHelper);
    }
    queues.currentStatus();

    status.agents = Agents;
    status.queues = queues;
    status.currentCalls = calls;

    io.sockets.socket(socketid).emit('currentStatus', status);
}
function updatePrimary (qty){
    calls = calls + qty;
    io.sockets.emit('updatePrimary',{calls: calls});
}