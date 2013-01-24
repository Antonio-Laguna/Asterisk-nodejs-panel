module.exports = function App(database, io, async){
    var Agent = require('../models/agent.js'),
        Client = require('../models/client.js'),
        Queue = require('../models/queue.js'),
        arrayHelper = require('../helpers/array.js'),
        timeHelper = require('../helpers/time.js'),
        Refetcher = require('../modules/refetcher.js'),
        Reseter = require('../modules/reseter.js'),
        Executor = require('../helpers/executor.js');

    // Initializing data
    this.calls = 0;
    this.talking = 0;
    this.awaiting = 0;

    this.connected_clients = [];
    this.agents = [];
    this.clients = [];
    this.queues = [];

    this.agent_utils = Agent.utils;
    this.client_utils = Client.utils;
    this.queue_utils = Queue.utils;

    this.database = database;
    this.io = io;
    this.async = require('async');
    this.refetcher = new Refetcher(this, database, io);
    this.reseter = new Reseter(this);
    this.executor = new Executor();

    this.abandoned_status = [
        'Out of schedule',
        'Abandoned in ring',
        'Abandoned in message',
        'Abandoned in queue',
        'Voicemail'
    ];

    var self = this;

    // Getting data from the database
    this.init = function(callback){
        async.parallel([
            self.getAgents,
            self.getClients
        ], function(){
            // We need Agents and Clients before we can load Queues
            self.getQueues(function(){
                callback.apply(self,[null]);
            });
        });
    };

    /**
     * This function get all visible agents and their queues and then store them
     *
     * @param callback to be called when it finishes
     */
    this.getAgents = function(callback){
        Agent.utils.fetchAgents(
            self.database,
            self.io,
            self.agents,
            function(agents){
                self.agents = agents;
                callback.apply(self,[null]);
            }
        );
    };
    /**
     * This function will get all clients for stats purpouses
     *
     * @param callback to be called when it finishes
     */
    this.getClients = function(callback){
        Client.utils.fetchClients(
            self.database,
            self.io,
            self.clients,
            function(clients){
                self.clients = clients;
                callback.apply(self,[null]);
            }
        );
    };
    /**
     * This function get all queues and then store them
     *
     * @param callback to be called when it finishes
     */
    this.getQueues = function(callback){
        Queue.utils.fetchQueues(
            self.database,
            self.io,
            self.queues,
            self.clients,
            Client.utils.getClientFromName,
            function(queues){
                self.queues = queues;
                callback.apply(self,[null]);
            }
        );
    };
    /**
     * This function will update the primary occupation with the one supplied and will inform all sockets about that
     */
    this.updatePrimary = function (){
        if (self.calls < 0) {
            self.calls = 0;
        }

        if (self.awaiting < 0) {
            self.awaiting = 0;
        }

        if (self.talking < 0) {
            self.talking = 0;
        }

        io.sockets.emit('updatePrimary',{
            calls: self.calls,
            talking: self.talking,
            awaiting: self.awaiting
        });
    };
    /**
     * This is the function that is called once someone connects to the socket. It gets all data from all sources and
     * send back to the socket.
     *
     * @param socketid that just connected
     */
    this.sendCurrentStatus = function (socketid, client_ip){
        var status = {};

        status.agents = Agent.utils.getStatus(self.agents);
        status.queues = Queue.utils.getStatus(self.queues);

        status.calls = self.calls;
        status.awaiting = self.awaiting;
        status.talking = self.talking;

        self.isAdminUser(client_ip, false, function (is_admin) {
            status.is_admin = is_admin;
            io.sockets.socket(socketid).emit('currentStatus', status);
        });
    };
    /**
     * This is the function that is called before sending status to a connected client to determine if this
     * user has admin role which enables some advanced functions
     *
     * @param client_ip is the client IP which is get through request's header
     * @param enforced this param avoid query madness because this only will be true the first time the client visits
     * @param callback which will be called with the result.
     */
    this.isAdminUser = function (client_ip, enforced, callback) {
        var client_position = arrayHelper.arrayObjectIndexOf(self.connected_clients, client_ip, 'ip'),
            client = self.connected_clients[client_position];

        if (client && client.is_admin){
            callback(true);
        }
        else {
            if (enforced){
                var query = 'SELECT agentes.grupo, agentes.usuario FROM agentes ' +
                    'LEFT JOIN acl_rel_grupos_permisos rel ON agentes.grupo = rel.grupo ' +
                    'WHERE agentes.usuario = (SELECT usuario FROM eventos_equipos WHERE ip = \'' +
                    client_ip +
                    '\' AND fecha >= CURDATE() ORDER BY fecha DESC LIMIT 1) ' +
                    'AND rel.permiso = 6';

                self.database.doQuery(query, function(results){
                    callback(results.length !== 0);
                });
            }
            else {
                callback(false);
            }
        }
    };
    /**
     * This funcion will get all rows for some agent
     *
     * @param array that contains all the rows for all agents
     * @param codAgent the agent code we are looking for
     * @return {Array} of rows
     */
    this.getAgentRows = function (array, codAgent) {
        var agent_rows = [];

        // We get all results from that agent
        for (var j= 0; j < array.length; j++)
        {
            if (array[j].codAgente === codAgent)
            {
                agent_rows.push(array[j]);
            }
        }

        return agent_rows;
    };
    /**
     * This function will send a call to an agent.
     *
     * @param data object that contains all needed properties.
     *  @from The queue you want to transfer the call from
     *  @to The agent you want to transfer the call to
     */
    this.sendCallToAgent = function (data){
        var queue = Queue.utils.getQueueFromName(self.queues, data.from);

        if (queue){
            var agent_position = arrayHelper.arrayObjectIndexOf(self.agents, data.to, 'codAgente');
            if (agent_position !== -1) {
                if (queue.calls.length !== 0){
                    // If there is any call to be transfered
                    var call_id = queue.calls[0].uniqueid,
                        agent_code = data.to,
                        command = 'ssh root@170.251.100.9 "/usr/local/bin/transferencia-flaix.sh ' + call_id+
                        ' '+agent_code+' '+
                        queue.name +'"';
                    self.executor.execute(command, function( error , stdout , stderr ){
                        console.log( stdout );
                        console.log('End of execution');
                        if (stdout.indexOf('failed') !== -1){
                            console.log('Transfering %s failed!', call_id);
                        }
                    });
                }

            }
        }
    };
    /**
     * This function force the unlog of an agent by running a script that calls Asterisk and tell it to unlog he/she
     *
     * @param data object that contains all needed properties.
     *  @agent agent that will be unlogged
     *
     *  TODO: This is not ideal, the pannel should connect to Asterisk directly
     */
    this.forceUnlogAgent = function(data){
        var agent_position = arrayHelper.arrayObjectIndexOf(self.agents, data.agent, 'codAgente');

        if (agent_position !== -1) {
            self.executor.execute(
                'ssh root@170.251.100.9 "/usr/local/bin/deslogeoforzado.sh ' + data.agent + '"'
            );
        }
    };
    /**
     * This function will load the stats for today. This will act in case you restart the app so the stats keep working
     */
    this.loadTodayStats = function(){
        console.log('Let\'s start loading today stats');
        var query = 'SELECT ' +
        'llamadas.uniqueid AS unique_id, ' +
        'llamadas.tipo AS type, ' +
        'clientes.nombre AS client, ' +
        'colas.nombre AS queue, ' +
        'IF(ISNULL(llamadas.fechaInicioCola), fecha , fechaInicioCola) AS start_date, ' +
        'llamadas.fechaAnswered AS answered_date, ' +
        'llamadas.fechaHungup AS hungup_date, ' +
        'IF(ISNULL(fechaAnswered), TIMESTAMPDIFF(SECOND,fechaInicioCola,fechaHungup),TIMESTAMPDIFF(SECOND,fechaInicioCola,fechaAnswered)) AS time_in_queue, '+
        'llamadas.agente AS agent, ' +
        'llamadas.status AS status ' +
        'FROM llamadas ' +
        'LEFT JOIN colas ON colas.id = llamadas.cola ' +
        'LEFT JOIN numeros_cabecera ON numeros_cabecera.id = colas.numero ' +
        'LEFT JOIN clientes ON clientes.idCliente = numeros_cabecera.cliente ' +
        'WHERE DATE(llamadas.fecha) = CURDATE() ' +
        'ORDER BY llamadas.fecha;';

        console.log ('Executing MySQL Query >> %s', query);
        // TODO: It should be used the encapsulated version of the Database instead of this

        self.database.client.query(query,
            function (err, results, fields){
                if (err)
                {
                    throw err;
                }
                if (results.length > 0)
                {
                    for (var i = 0; i < results.length; i++)
                    {
                        var client = Client.utils.getClientFromName(self.clients, results[i].client),
                            call_queue = Queue.utils.getQueueFromName(self.queues,results[i].queue);

                        var agent_position = arrayHelper.arrayObjectIndexOf(
                            self.agents,
                            results[i].agent,
                            'codAgente'
                        );

                        var call_agent = (agent_position !== -1) ? self.agents[agent_position] : undefined;

                        if (client !== undefined){
                            var call_date = results[i].start_date,
                                answered_date = results[i].answered_date,
                                hungup_date = results[i].hungup_date,
                                status = results[i].status,
                                type = (self.abandoned_status.indexOf(status) === -1) ? 'answered' : 'abandoned';

                            if (results[i].type === 'Incoming'){
                                client.total_calls++;

                                if (status !== 'Abandoned in message' && status !== 'Out of schedule') {
                                    client.offered_calls++;

                                    if (type === 'abandoned') {
                                        client.storeCall(hungup_date,call_date,true);
                                    }
                                    else {
                                        client.storeCall(answered_date, call_date,false);
                                    }
                                }
                                else {
                                    client.failed_calls++;
                                }
                            }

                            if (type === 'answered' && hungup_date === null && results[i].agent === null){
                                if (call_queue) {
                                    console.log('Call %s assigned to the queue %s in startup.',
                                        results[i].unique_id,
                                        call_queue.name
                                    );

                                    self.awaiting++;
                                    self.calls++;
                                    call_queue.calls.push({
                                        uniqueid : results[i].unique_id,
                                        date : call_date
                                    });
                                }
                                else {
                                    console.log('This call - %s - cannot be allocated',
                                            results[i].unique_id
                                    );
                                }
                            }
                            else {
                                if (type === 'answered' && hungup_date === null){
                                    if (call_agent !== undefined) {
                                        console.log('Call %s assigned to the agent %s in startup.',
                                            results[i].unique_id,
                                            call_agent.codAgente
                                        );

                                        if (results[i].type === 'Incoming'){
                                            self.talking++;
                                        }

                                        self.calls++;
                                        call_agent.changeStatus({
                                            start_timer : true,
                                            status : (results[i].type == 'Incoming') ? 4 : 5,
                                            io : self.io,
                                            is_call : true,
                                            queue : (call_queue) ? call_queue.name : null
                                        });

                                        call_agent.currentCallTime = answered_date;
                                    }
                                    else {
                                        console.log('This call - %s - cannot be allocated',
                                            results[i].unique_id
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        );
    };
    /**
     * This will start the reset process...
     */
    this.startReset = function (){
        self.reseter.reset();
    };
    /**
     * This function will store clients data on connection
     *
     * @param client_ip the client ip
     * @param admin if it's admin or it's not
     */
    this.storeConnectedClient = function(client_ip, admin) {
        var client_position = arrayHelper.arrayObjectIndexOf(self.connected_clients, client_ip, 'ip');
        if(client_position === -1){
            var query = 'SELECT usuario FROM eventos_equipos WHERE ip = \'' +
                client_ip +
                '\' AND fecha >= CURDATE() ORDER BY fecha DESC LIMIT 1';

            self.database.doQuery(query, function(results){
                var name = undefined;

                if (results.length !== 0){
                    name = results[0].usuario;
                }

                self.connected_clients.push({
                    user_name : name,
                    is_admin : admin,
                    ip : client_ip
                });
            });
        }
        else {
            self.connected_clients.push({
                user_name : self.connected_clients[client_position].name,
                is_admin : admin,
                ip : client_ip
            });
            self.connected_clients[client_position].is_admin = admin;
        }
    };
    /**
     * This function will delete the client data using it's IP to find it
     *
     * @param client_ip
     */
    this.deleteConnectedClient = function(client_ip) {
        arrayHelper.deleteFromArrayOfObjects(self.connected_clients, client_ip,'ip');
    };
};