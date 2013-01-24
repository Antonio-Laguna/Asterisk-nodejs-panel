var arrayHelper = require('../helpers/array.js');
/**
 * AGENTs model
 *
 * @param data object *array* with information needed to create the agent:
 *      @codAgente agent code
 *      @nombre agent name
 *      @apellido1 first last name
 *      @apellido2 second last name (if applicable)
 *      @estado agent status in Asterisk
 * @param io socket.io object to broadcast
 * @constructor
 */
function Agent(data, io){
    this.statuses = [
        {
            id : 0,
            name : 'Disconnected',
            start_timer : false,
            is_call : false
        },
        {
            id : 1,
            name : 'Available',
            start_timer : false,
            is_call : false
        },
        {
            id : 2,
            name : 'Meeting',
            start_timer : true,
            is_call : false
        },
        {
            id : 3,
            name : 'Administrative',
            start_timer : true,
            is_call : false
        },
        {
            id : 4,
            name : 'Incoming',
            start_timer : true,
            is_call : true
        },
        {
            id : 5,
            name : 'Outgoing',
            start_timer : true,
            is_call : true
        },
        {
            id : 6,
            name : 'Resting',
            start_timer : true,
            is_call : false
        },
        {
            id : 7,
            name : 'Glory time',
            start_timer : true,
            is_call : false
        }
    ];

    this.prevStatus = {};

    this.codAgente = data[0].codAgente;
    this.nombre = data[0].nombre;
    this.apellido1 = data[0].apellido1;
    this.apellido2 = data[0].apellido2;
    this.currentStatusTime = null;
    this.currentStatusTimeDiff = null;
    this.currentCallTimeDiff = null;
    this.currentCallTime = null;
    this.currentTalkingQueue = null;
    this.queues = this.getQueues(data);
    io.sockets.emit('logAgent', this);

    this.arrayHelper = arrayHelper;
    this.timeHelper = require('../helpers/time.js');
    this.status = (this.arrayHelper.arrayObjectIndexOf(this.statuses, data[0].estado, 'name') !== -1) ?
        this.statuses[this.arrayHelper.arrayObjectIndexOf(this.statuses, data[0].estado, 'name')] :
        this.statuses[0];
}
/**
 * This functions calculate current times of the current status and / or the current call
 */
Agent.prototype.calculateTimes = function(){
    if (this.currentStatusTime !== null){
        this.currentStatusTimeDiff = this.timeHelper.calculateTimeSince(this.currentStatusTime);
    }

    if (this.currentCallTime !== null){
        this.currentCallTimeDiff = this.timeHelper.calculateTimeSince(this.currentCallTime);
    }
};
/**
 * This function change the status of the agent.
 *
 * @param data object with needed data
 *      @status : The new status (integer) should be a value between 1 and 5
 *      @queue : The current queue where the agent is talking
 */
Agent.prototype.changeStatus = function(data){
    this.prevStatus = this.status;

    if (this.statuses[data.status] !== undefined){
        if (!this.statuses[data.status].start_timer)
        {
            this.currentStatusTime = null;
            this.currentStatusTimeDiff = null;
            this.currentCallTime = null;
            this.currentCallTimeDiff = null;
            this.currentTalkingQueue = null;
        }
        else
        {
            if (!this.statuses[data.status].is_call)
            {// That's it, not talking by phone
                this.currentStatusTime = new Date;
                this.currentTalkingQueue = null;
            }
            else
            {
                this.currentCallTime = new Date;
                this.currentTalkingQueue = data.queue || '';
            }
        }

        this.status = this.statuses[data.status];
        data.io.sockets.emit('changeEvent', {agent: this.codAgente, status: this.status.id, queue: this.currentTalkingQueue});
    }
};
/**
 * This function ends the current call
 *
 * @socket : The socket object in which will send info once the change has been made
 */
Agent.prototype.endCall = function (socket){
    if (!this.prevStatus.is_call)
    {// Administrative time or unavailable
        this.changeStatus({
            status : this.prevStatus.id || this.status.id,
            io : socket
        });
    }
    else
    {
        this.changeStatus({
            status: 1,
            io: socket
        });
    }
    this.currentTalkingQueue = null;
};
/**
 * This functions will store the agent's queues (and his/her priority) in a property.
 *
 * @queues : The queues
 */
Agent.prototype.getQueues = function (queues){
    var array = [];
    for (var i=0, len = queues.length; i < len; i ++){
        array.push({
            name: queues[i].cola.replace('Cola',''),
            priority: queues[i].prioridad
        });
    }
    return array;
};
/**
 * This function is called whenever the agent starts or stops ringing. Will broadcast by socket
 *
 * @param data object with needed data
 *      @action : Start or Stop
 */
Agent.prototype.manageRinging = function(data){
    console.log('Agent [%s] %s ringing.', this.codAgente, data.action === 'start' ? 'started' : 'stopped');
    data.io.sockets.emit('agentRinging', {agent: this.codAgente, action: data.action});
};
/**
 * Utility functions related to this model. Those are exported.
 *
 * @type {Object}
 */
var utils = {
    /**
     * This function is in charge of fetching agents from Database. First, will fetch and store agents.
     * Then, will retrieve their statuses and finally will call the callback with the results
     *
     * @param database to extract data
     * @param io to emit by socket
     * @param stored_agents currently stored agents (if any)
     * @param callback to be called once it finishes
     */
    fetchAgents : function(database, io, stored_agents, callback){
        var agents = [];

        utils.getAgents(database, function(results){
            agents = utils.storeAgentsFromDB(io, stored_agents, results);
            utils.loadStatusTimes(database,function(data){
                agents = utils.storeStatusTimes(agents, data);
                callback.apply(undefined,[agents]);
            });
        });
    },

    /**
     * Function that get Agents from the database
     *
     * @param database
     * @param callback
     */
    getAgents : function(database, callback){
        var query = 'SELECT agentes.nombre AS nombre, ' +
            'agentes.apellido1 AS apellido1, ' +
            'agentes.apellido2 AS apellido2, ' +
            'agentes.codAgente AS codAgente, ' +
            'agentes.estado AS estado, ' +
            'relcolaext.cola AS cola, ' +
            'relcolaext.prioridad AS prioridad ' +
            'FROM agentes ' +
            'LEFT JOIN relcolaext ON relcolaext.codAgente = agentes.codAgente ' +
            'LEFT JOIN colas ON colas.nombre = relcolaext.cola ' +
            'WHERE agentes.visible_panel = 1 ' +
            'AND agentes.activo = 1 ' +
            'AND colas.panel = 1';

        database.doQuery(query, callback);
    },
    /**
     * This function will store all results from getAgents. It will try to keep current agents if there are any
     * updating their info (if applicable), inserting new ones and deleting.
     *
     * This function could be called anytime in the lifecycle of the app.
     *
     * @see getAgents
     * @param io to emit by socket
     * @param stored_agents contains the current stored agents
     * @param results that comes from the Database resultset
     */
    storeAgentsFromDB : function (io, stored_agents, results) {
        var agents = stored_agents || [];

        for (var i = 0; i < results.length; i++)
        {
            var currentPosition = arrayHelper.arrayObjectIndexOf(
                agents,
                results[i].codAgente,
                'codAgente'
            );
            var agent_rows = utils.getAgentRows(results,results[i].codAgente);

            if (currentPosition === -1)
            { // It's not already connected
                agents.push( new Agent(
                    agent_rows,
                    io
                ));
                console.log('Agent %s %s [%s] was loaded on server startup',
                    results[i].nombre, results[i].apellido1, results[i].codAgente);
            }
            else
            {
                var data = results[i],
                    agent = agents[currentPosition];

                agent.codAgente = data.codAgente;
                agent.nombre = data.nombre;
                agent.apellido1 = data.apellido1;
                agent.apellido2 = data.apellido2;
                agent.queues = agent.getQueues(agent_rows);

                if (!agent.status.is_call){
                    agent.status = (arrayHelper.arrayObjectIndexOf(agent.statuses, data.estado, 'name') !== -1) ?
                        agent.statuses[arrayHelper.arrayObjectIndexOf(agent.statuses, data.estado, 'name')] :
                        agent.statuses[0];
                }
            }
        }
        var to_delete = [];

        for (var j = 0, length = agents.length; j < length; j ++) {
            var agent_aux = agents[j];
            var current_position = arrayHelper.arrayObjectIndexOf(results, agent_aux.codAgente,'codAgente');
            if (current_position === -1) {
                to_delete.push(agent_aux.codAgente);
            }
        }
        arrayHelper.deleteSeveralFromArrayOfObjects(to_delete, agents,'codAgente');

        return agents;
    },

    /**
     * This function will load the last status from all agents and when the change occurred
     *
     * @param database to query for data
     * @param callback to be called
     */
    loadStatusTimes : function(database, callback){
        var query = 'SELECT a.* ' +
            'FROM eventos_centralita a ' +
            'LEFT JOIN eventos_centralita b ' +
            'ON b.codAgente = a.codAgente ' +
            'AND b.fechaHora > a.fechaHora ' +
            'WHERE b.idEvent IS NULL GROUP BY a.codAgente';

        database.doQuery(query, callback);
    },
    /**
     * This function will update each agent and will set the currenStatusTime property so it matches with the one we
     * have in database.
     *
     * @see loadStatusTimes
     * @param agents current agents
     * @param results that comes from the database
     */
    storeStatusTimes : function(agents, results){
        for (var i = 0, length = results.length; i < length; i++) {
            var agent_pos = arrayHelper.arrayObjectIndexOf(agents, results[i].codAgente, 'codAgente');

            if (agent_pos !== -1 && agents[agent_pos].status.id > 1){
                agents[agent_pos].currentStatusTime = results[i].fechaHora;
            }
        }
        return agents;
    },
    /**
     * This function will get all rows for some agent
     *
     * @param array that contains all the rows for all agents
     * @param codAgent the agent code we are looking for
     * @return {Array} of rows
     */
    getAgentRows : function (array, codAgent) {
        var agent_rows = [];

        // We get all results from that agent
        for (var j= 0; j < array.length; j++)
        {
            if (array[j].codAgente === codAgent) {
                agent_rows.push(array[j]);
            }
        }

        return agent_rows;
    },
    /**
     * This function get the status of the agents, this function is the one that's called once a
     * client connects to the pannel and retrieve all necessary information that needs to be displayed
     *
     * @param agents
     * @return {Array}
     */
    getStatus : function (agents){
        var status = [];

        for (var i = 0, length = agents.length; i < length; i ++){
            agents[i].calculateTimes();

            status.push({
                codAgente : agents[i].codAgente,
                status_id : agents[i].status.id,
                nombre : agents[i].nombre,
                apellido1 : agents[i].apellido1,
                apellido2 : agents[i].apellido2,
                currentCallTimeDiff : agents[i].currentCallTimeDiff,
                currentStatusTimeDiff : agents[i].currentStatusTimeDiff,
                currentTalkingQueue : agents[i].currentTalkingQueue,
                queues : agents[i].queues
            });
        }

        return status;
    },
    /**
     * This function is in charge of creating a new Agent
     *
     * @param results
     * @param io
     * @return {Agent}
     */
    createAgent : function(results, io){
        return new Agent(results,io);
    },
    /**
     * Get an Agent object from it's agent's code
     *
     * @param agents
     * @param code
     * @return {*}
     */
    getAgentFromCode : function (agents, code){
        var agent,
            agent_position = arrayHelper.arrayObjectIndexOf(agents, code , 'codAgente');

        if (agent_position !== -1){ agent = agents[agent_position]; }

        return agent;
    }
};

exports.model = Agent;
exports.utils = utils;