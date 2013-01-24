module.exports = function Routes (app, database, io){
    var self = this,
        arrayHelper = require('../helpers/array.js'),
        timeHelper = require('../helpers/time.js');

    this.index = function(req, res){
        var ip = req.ip;

        if (req.cookies.isadmin !== undefined){
            // Revalidate cookie
            res.cookie('isadmin', true, {maxAge:90000});
            app.storeConnectedClient(ip,true);
            res.sendfile('./index.html');
        }
        else {
            app.isAdminUser(ip, true, function(is_admin){
                if (is_admin){
                    res.cookie('isadmin', true, {maxAge:90000});
                }
                app.storeConnectedClient(ip,is_admin);
                res.sendfile('./index.html');
            });
        }
    };

    /**
     * Function that will be called when an agent transitions from unavailable to available
     */
    this.logAgent = function (req, res){
        var agent_position = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agentCode,'codAgente');

        // We have it but it's not logged
        if (agent_position !== -1) {
            if (app.agents[agent_position].status.id === 0) { // It's unlogged
                app.agents[agent_position].changeStatus({
                    status : 1, //Available
                    io: io
                });
            }
            res.send(200);
        }
        else { // We don't even know about him/her
            var query = 'SELECT agentes.nombre as nombre,'+
                ' agentes.apellido1 as apellido1,'+
                ' agentes.apellido2 as apellido2,'+
                ' agentes.codAgente as codAgente,'+
                ' agentes.estado as estado,'+
                ' relcolaext.cola as cola,'+
                ' relcolaext.prioridad as prioridad'+
                ' FROM agentes, relcolaext'+
                ' WHERE relcolaext.codAgente = agentes.codAgente'+
                ' AND agentes.codAgente = "' + req.params.agentCode + '"';
            console.log ('Executing MySQL Query >> %s', query);

            database.client.query(query,
                function (err, results, fields){
                    if (err){
                        res.send(500);
                        throw err;
                    }

                    if (results[0]){
                        if (arrayHelper.arrayObjectIndexOf(app.agents, req.params.agentCode,'codAgente') === -1){ // It's not already connected
                            // If we have a result, we push it into the agents array
                            app.agents.push( app.agent_utils.createAgent(
                                results,
                                io
                            ));
                            console.log('Agent has logged %s %s [%s]', results[0].nombre, results[0].apellido1, req.params.agentCode);
                            res.send(200);
                        }
                        else {
                            res.send(500,'Agent were already added');
                        }
                    }
                    else{
                        console.log("Someone has tried to log into the system with the extension %s, but it wasn't able to do that. Maybe the extension is not registered or it's not related to any queues.", req.params.agentCode);
                    }
                }
            );
        }
    };
    /*
     * Function that will be called upon agent disconnection
     */
    this.unLogAgent = function (req, res) {
        var agent_position = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agentCode,'codAgente');
        if (agent_position !== -1){
            app.agents[agent_position].changeStatus({
                status : 0, //Disconnected
                io: io
            });
            console.log('Unlogged agent [%s]', req.params.agentCode);
        }

        res.send(200);
    };
    /*
     * Function that will be called when an agent's phone start/stop ringing
     */
    this.agentRing = function (req, res) {
        var agent_position = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agentCode,'codAgente');

        if (agent_position !== -1){
            app.agents[agent_position].manageRinging({
                action : req.params.action,
                io: io
            });
        }

        res.send(200);
    };
    /**
     * Function that change the status of an agent. This function *should* only be called if the new status it's not a call
     */
    this.changeStatusNoCall = function (req, res) {
        var newStatus = self.determineStatusByReq(req.url),
            agentPosition = arrayHelper.arrayObjectIndexOf(app.agents,req.params.agentCode,'codAgente');

        // Changing the agent status and emiting by socket
        if (agentPosition !== -1){
            app.agents[agentPosition].changeStatus({
                status : newStatus.status_code,
                io : io
            });
        }

        res.send(200);
    };

    this.dispatchCallInQueue = function (req, res){
        var isIncoming = (req.url.indexOf('/call/') !== -1),
            type = '',
            queue_name = req.params.queue,
            queue = app.queue_utils.getQueueFromName(app.queues, queue_name),
            unique_id = req.params.uniqueid,
            client = (queue !== undefined) ? queue.client_obj : null,
            call_position = -1;

        if (queue){
            call_position = arrayHelper.arrayObjectIndexOf(queue.calls, unique_id, 'uniqueid');
        }

        // If the call isn't in the queue yet
        if (isIncoming && call_position === -1) {
            console.log ('Incoming call [%s] to queue %s at %s', unique_id, queue_name, new Date());

            // Stats stuff
            if (client) {
                client.total_calls++;
                client.offered_calls++;
                client.sendStatus();
            }

            type = 'in';
        }
        else
        {
            console.log ('Call answered by [%s] in %s at %s', req.params.agentCode, queue_name, new Date());

            var pos_agent = arrayHelper.arrayObjectIndexOf(app.agents,req.params.agentCode,'codAgente');

            if (pos_agent !== -1){
                app.agents[pos_agent].changeStatus({status:4, io: io, queue: queue_name});
                app.talking = self.calculateTalking();
                app.updatePrimary();
            }
            type = 'out';
        }

        // Valid if queue position is found
        // Then if is incoming call, will be assured that the call isn't already registered
        // or it's not incoming
        if (queue !== undefined && ((isIncoming && call_position === -1) || (!isIncoming))){
            app.queue_utils.dispatchCall({
                uniqueid: unique_id,
                queue: queue,
                type: type,
                abandoned : false,
                io: io
            });
        }
        else {
            console.log('The call [%s] wasn\'t added to %s because it was already there!', unique_id, queue_name);
        }

        res.send(200);
    };
    /**
     * Function that will be called when an agent is performing a call
     */
    this.externalCall = function (req, res){
        console.log ('Outgoing call from %s', req.params.agentCode);

        var pos_agent = arrayHelper.arrayObjectIndexOf(app.agents,req.params.agentCode,'codAgente');

        if (pos_agent !== -1){
            app.agents[pos_agent].changeStatus({status: 5, io: io});
        }

        res.send(200);
    };
    /*
     * This function will be called when a call hangs. It may be in 'agente' in 'cola' or in 'message'
     */
    this.hangCall = function (req, res){
        console.log ('Call finished at %s', req.params.type);
        var queue;

        switch (req.params.type)
        {
            case 'agente':
                var pos_agent = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agentOrQueue, 'codAgente');

                if (pos_agent !== -1){
                    // If it's an incoming call
                    app.agents[pos_agent].endCall(io);
                    app.talking = self.calculateTalking();
                    app.updatePrimary();
                }
                else {
                    console.log('Call couldn\'t be ended because agent %s, cannot be found',req.params.agentOrQueue);
                }

                break;
            case 'cola' :
                queue = app.queue_utils.getQueueFromName(app.queues, req.params.agentOrQueue);
                if (queue !== undefined) {
                    console.log('Call [%s] is about to be dispatched from %s', req.params.uniqueid, req.params.agentOrQueue);

                    app.queue_utils.dispatchCall(
                        {
                            queue: queue,
                            uniqueid: req.params.uniqueid,
                            type: 'out',
                            abandoned: true,
                            io: io
                        }
                    );
                }
                else {
                    console.log('Call [%s] couldn\'t be dispatched from %s because queue wasn\'t found',
                        req.params.uniqueid, req.params.agentOrQueue
                    );
                }
                break;
            case 'message' :
                queue = app.queue_utils.getQueueFromName(app.queues, req.params.agentOrQueue);

                if (queue !== undefined){
                    var client = queue.client_obj;

                    if (client){
                        client.failed_calls++;
                        client.total_calls++;
                        client.sendStatus();
                    }
                }
                break;
        }

        res.send(200);
    };
    /*
     * Whenever a call is transferred this function will be called from server.js
     */
    this.transferCall = function (req, res){
        console.log('Transfering [%s] from %s to %s', req.params.uniqueid, req.params.agent_from, req.params.agent_to);

        var pos_agent_from =  arrayHelper.arrayObjectIndexOf(app.agents, req.params.agent_from, 'codAgente'),
            pos_agent_to = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agent_to, 'codAgente');

        // If we get the agent whom is transferring, we end the call there
        if (pos_agent_from !== -1) {
            app.agents[pos_agent_from].endCall(io);
        }
        else {
            console.log('We couldnt end the call at %s because we couldnt find it', req.params.agent_from)
        }

        // If we get the agent to whom the call is going to be transferred, we create a new call to him
        if (pos_agent_to !== -1) {
            app.agents[pos_agent_to].changeStatus({status:4, io: io, queue: req.params.queue_name});
        }
        else {
            console.log('We couldnt send the call at %s because we couldnt find it', req.params.agent_to)
        }

        res.send(200);
    };
    /*
     * This function is called whenever someone tries to see some stats from a client
     */
    this.getClientStats = function ( req, res ) {
        var client = app.client_utils.getClientFromName(app.clients, req.params.client_name);
        if (client){
            if (req.params.from_date === undefined){
                // Real time request
                var client_data = {
                    name : client.name,
                    real_time : true,
                    range_date : false,
                    total_offered_calls : 0,
                    total_calls : 0,
                    total_abandoned : 0,
                    abandoned_after_SLA : 0,
                    total_answered : 0,
                    answered_before_SLA : 0,
                    average_response_time : 0,
                    failed_calls : 0,
                    perc_abandoned : client.perc_abandoned,
                    perc_answered : client.perc_answered,
                    per_hour : null,
                    sec_abandoned : client.sec_abandoned,
                    sec_answered : client.sec_answered
                };

                if (req.url.indexOf('json') !== -1){
                    var status = client.getStatus();
                    status.client_name = client.name;
                    status.per_hour = client.stats_by_hour;
                    res.json(status);
                }
                else {
                    res.render('index', client_data);
                }
            }
            else {
                var start_date = new Date(req.params.from_date),
                    end_date, original_end_date;

                timeHelper.setAbsoluteDay(start_date);

                if (req.params.to_date !== undefined) {
                    end_date = new Date(req.params.to_date);
                    original_end_date = new Date(req.params.to_date);
                    timeHelper.setAbsoluteDay(end_date);
                    end_date.setDate(end_date.getDate() +1);
                }
                else {
                    end_date = new Date(req.params.from_date);
                    original_end_date = new Date(req.params.from_date);
                    timeHelper.setAbsoluteDay(end_date);
                    end_date.setDate(start_date.getDate() + 1);
                }

                if ((end_date - start_date) > 0){
                    app.async.parallel([function(callback){
                        client.loadStats(start_date, end_date, callback);
                    }], function(data){
                        data.start_date = start_date;
                        data.end_date = original_end_date;
                        data.range_date = (end_date - start_date !== 86400000);

                        res.render('index',data);
                    });
                }
                else {
                    res.end('Dates are incorrect. IE, Start date is lower than End date');
                }
            }
        }
        else {
            res.send(404, 'Sorry, we cannot find that!');
        }
    };
    /*
     * This function is called to update the current calls and calls in queue in the pannel
     */
    this.updateCalls = function (req, res){
        app.calls = parseInt(req.params.total_calls ,10);
        app.awaiting = parseInt(req.params.calls_in_queue ,10);
        app.updatePrimary();

        res.send(200);
    };
    /*
     * This function performs a reload of the data that the pannel has
     */
    this.reload = function ( req, res ) {
        app.refetcher.perform(true);
        res.send(200, 'Done');
    };
    /*
     *  This functions output by console a debug trace for a queue
     */
    this.debugQueue = function (req, res) {
        var queue = app.queue_utils.getQueueFromName(app.queues, req.params.queue_name);

        if (queue){
            console.log('Debug trace for [%s]',queue.name);
            console.log('------------------------------');
            console.log(queue.calls);
            console.log('------------------------------');
        }

        res.send(200, 'Done');
    };

    this.debugAgent = function(req, res) {
        var agent_position = arrayHelper.arrayObjectIndexOf(app.agents, req.params.agent_code, 'codAgente'),
            agent = (agent_position !== -1) ? app.agents[agent_position] : undefined;

        if (agent){
            console.log('Debug trace for [%s]', agent.nombre);
            console.log('------------------------------');
            console.log(agent);
            console.log('------------------------------');
        }
    };

    this.panelStats = function(req,res){
        console.log(app.connected_clients);
        res.send(200,'Done');
    };

    /*
     * This function controlls the sim availability that's shown on the Pannel
     */
    this.simAvailability = function (req, res) {
        io.sockets.emit('simAvailability',
            {
                sim: req.params.sim_number ,
                available : req.params.available.toLowerCase() === 'available'
            }
        );
        res.send(200, 'Done');
    };
    /**
     * This function calculates the number of people that it's currently talking
     * it just counts the people attending an Incoming call.
     *
     * @return {Number} of people talking
     */
    this.calculateTalking = function(){
        var talking = 0;
        for (var i = 0, length = app.agents.length; i < length; i++){
           if (app.agents[i].status.id === 4){
               talking++;
           }
        }
        return talking;
    };

    /**
     * This functions determine the status contained in a string. The status code should match with those in
     * agent.js
     *
     * @request : The string to look within
     *
     * @return an object with the code and the string as it's properties
     */
    this.determineStatusByReq = function (request) {
        var searches = [
            {
                status_code : 1,
                string : '/available/'
            },
            {
                status_code : 2,
                string : '/meeting/'
            },
            {
                status_code : 3,
                string : '/administrative/'
            },
            {
                status_code : 6,
                string : '/resting/'
            },
            {
                status_code : 7,
                string : '/glorytime/'
            }
        ];

        for (var i = 0; i < searches.length; i++){
            if (request.indexOf(searches[i].string) !== -1) { return searches[i] }
        }

        // We should never reach here!
        return {
            status_code: 0,
            string : ''
        };
    };

    this.getAgentStatus = function (req, res) {
        var agent_code = req.params.agent_code,
            is_json = req.url.indexOf('json') !== -1;

        var result = is_json ? [] : '';

        if (agent_code !== 'all'){
            var agent = app.agent_utils.getAgentFromCode(app.agents,agent_code);
            if (agent) {
                if (is_json){
                    result.push(agent.status.name);
                }
                else {
                    result = agent.status.name;
                }
            }
        }
        else {
            for (var i = 0, length = app.agents.length; i < length; i++){
                if (is_json){
                    result.push({
                        codAgente : app.agents[i].codAgente,
                        status : app.agents[i].status.name
                    });
                }
                else{
                    result += [app.agents[i].codAgente, app.agents[i].status.name].join(' ') + '\n';
                }
            }
        }

        if (is_json){ res.json(result); }
        else { res.send(200, result); }
    };
};