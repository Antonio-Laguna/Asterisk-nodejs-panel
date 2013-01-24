var arrayHelper = require('../helpers/array.js'),
    timeHelper = require('../helpers/time.js');

function Client ( data , io , database ) {
    var self = this;

    this.name = data.name;
    this.database = database;
    this.perc_abandoned = data.perc_abandoned;
    this.perc_answered = data.perc_answered;
    this.sec_abandoned = data.sec_abandoned;
    this.sec_answered = data.sec_answered;
    this.timeHelper = require('../helpers/time.js');
    this.mathHelper = require('../helpers/math.js');

    this.total_calls = 0;
    this.offered_calls = 0;
    this.total_abandoned = 0;
    this.total_answered = 0;
    this.failed_calls = 0;
    this.abandoned_after_SLA = 0;
    this.answered_before_SLA = 0;
    this.total_response_time = 0;
    this.total_abandon_time = 0;

    this.stats_by_hour = [];
    this.stats_by_hour.length = 23;

    this.io = io;
    this.socket = self.io.of('/' + this.name);

    self.socket.on('connection', function(socket){
        console.log('Someone wants to see some %s stats...', self.name);
        self.sendStatus(socket.id);
    });
}
Client.prototype.storeCall = function(now, call_date, abandoned){
    var type = abandoned ? 'abandoned' : 'answered',
        meet_sla = false;

    now = (!now) ? new Date() : now;

    if (abandoned){
        this.total_abandon_time += parseInt(((now - call_date) /1000).toFixed(0),10);
        this.total_abandoned++;

        if (timeHelper.meetSLAAfter(call_date, now, this.sec_abandoned)){
            this.abandoned_after_SLA++;
            meet_sla = true;
        }
    }
    else {
        this.total_response_time +=  parseInt(((now - call_date) /1000).toFixed(0),10);
        this.total_answered++;

        if (timeHelper.meetSLABefore(call_date, now, this.sec_answered)){
            this.answered_before_SLA++;
            meet_sla = true;
        }
    }

    utils.storeCall(this.stats_by_hour, now, call_date, type, meet_sla);
};
Client.prototype.getStatus = function(){
    return {
        total_calls : this.total_calls,
        total_offered_calls : this.offered_calls,
        total_abandoned : this.total_abandoned,
        total_answered : this.total_answered,
        failed_calls : this.failed_calls,
        abandoned_after_SLA : this.abandoned_after_SLA,
        answered_before_SLA : this.answered_before_SLA,
        average_response_time : this.mathHelper.fixedTo((this.total_response_time / this.total_answered),2),
        per_hour : this.stats_by_hour
    };
};
Client.prototype.sendStatus = function (socketid) {
    var status = this.getStatus();

    if (socketid) {
        this.socket.socket(socketid).emit('clientStatus', status);
    }
    else {
        this.socket.emit('clientStatus', status)
    }
};
Client.prototype.resetData = function () {
    this.total_calls = 0;
    this.total_offered_calls = 0;
    this.total_abandoned = 0;
    this.total_answered = 0;
    this.failed_calls = 0;
    this.abandoned_after_SLA = 0;
    this.answered_before_SLA = 0;
    this.average_response_time = 0;

    this.sendStatus();
};
Client.prototype.loadStats = function(start_date, end_date, callback){
    var self = this;
    var query = 'SELECT ' +
        'llamadas.uniqueid AS unique_id, ' +
        'llamadas.tipo AS type, ' +
        'clientes.nombre AS client, ' +
        'colas.nombre AS queue, ' +
        'IF(ISNULL(llamadas.fechaInicioCola), llamadas.fecha, llamadas.fechaInicioCola) AS start_date, ' +
        'llamadas.fechaAnswered AS answered_date, ' +
        'llamadas.fechaHungup AS hungup_date, ' +
        'llamadas.agente AS agent, ' +
        'IF(ISNULL(fechaAnswered), TIMESTAMPDIFF(SECOND,IF(ISNULL(llamadas.fechaInicioCola), llamadas.fecha, llamadas.fechaInicioCola),fechaHungup),TIMESTAMPDIFF(SECOND,IF(ISNULL(llamadas.fechaInicioCola), llamadas.fecha, llamadas.fechaInicioCola),fechaAnswered)) AS time_in_queue, '+
        'llamadas.status AS status ' +
        'FROM llamadas ' +
        'LEFT JOIN colas ON colas.id = llamadas.cola ' +
        'LEFT JOIN numeros_cabecera ON numeros_cabecera.id = colas.numero ' +
        'LEFT JOIN clientes ON clientes.idCliente = numeros_cabecera.cliente ' +
        'WHERE llamadas.fecha >= ? ' +
        'AND llamadas.fecha <= ? ' +
        'AND clientes.nombre = ? ' +
        'AND llamadas.tipo = \'Incoming\' ' +
        'ORDER BY llamadas.fecha;';

    console.log('Executing query >> %s', query);

    this.database.client.query( query , [start_date, end_date, this.name], function(err,results){
        callback(self.returnStats.call(self,results));
    });
};
Client.prototype.returnStats = function(results) {
    var stats = {
        name : this.name,
        sec_abandoned : this.sec_abandoned,
        sec_answered : this.sec_answered,
        perc_abandoned : this.perc_abandoned,
        perc_answered : this.perc_answered,
        real_time : false,
        total_calls : 0,
        total_offered_calls : 0,
        total_response_time : 0,
        average_response_time : 0,
        failed_calls : 0,
        total_abandoned : 0,
        abandoned_after_SLA : 0,
        total_answered : 0,
        answered_before_SLA : 0
    };
    stats.per_hour = [];

    for (var i = 0, length = results.length; i < length; i++){
        if (results[i].type === 'Incoming'){
            var call_date = results[i].start_date,
                answered_date = results[i].answered_date,
                hungup_date = results[i].hungup_date,
                status = results[i].status,
                type = (
                    (status.indexOf('bandoned') === -1) &&
                        (status.indexOf('Voicemail') === -1)
                    ) ? 'answered' : 'abandoned',
                meets_sla;

            stats.total_calls++;

            if (status !== 'Abandoned in message' && status !== 'Out of schedule') {
                stats.total_offered_calls++;
                stats['total_' + type]++;

                if (type === 'abandoned'){
                    meets_sla = this.timeHelper.meetSLAAfter(
                        call_date,
                        hungup_date,
                        this['sec_' + type]
                    );
                    if (meets_sla){
                        stats.abandoned_after_SLA++;
                    }

                    if (hungup_date === null || hungup_date.getTime() !== hungup_date.getTime()){
                        console.log('Error abandoned: ');
                        console.log(results[i]);
                    }
                    else {
                        utils.storeCall(stats.per_hour, hungup_date, call_date, type, meets_sla);
                    }
                }
                else {
                    var time_in_queue = parseInt(results[i].time_in_queue,10);
                    if (!isNaN(time_in_queue)){
                        stats.total_response_time += time_in_queue;
                    }

                    meets_sla = this.timeHelper.meetSLABefore(
                        call_date,
                        answered_date,
                        this['sec_' + type]
                    );
                    if (meets_sla){
                        stats.answered_before_SLA++;
                    }

                    if (answered_date === null || answered_date.getTime() !== answered_date.getTime()){
                        console.log('Error answered: ');
                        console.log(results[i]);
                    }
                    else {
                        utils.storeCall(stats.per_hour, answered_date, call_date, type, meets_sla);
                    }
                }
            }
            else {
                stats.failed_calls++;
            }
        }
    }
    stats.average_response_time = this.mathHelper.fixedTo((stats.total_response_time / stats.total_answered),2);

    return stats;
};

var utils = {
    fetchClients : function(database, io, stored_clients, callback){
        var clients = [];

        utils.getClients(database, function(results) {
            clients = utils.storeClientsFromDB(io, stored_clients, database, results);
            callback.apply(undefined,[clients]);
        });
    },
    /**
     * This function will get all clients for stats purpouses
     *
     * @param callback to be called when it finishes
     */
    getClients : function(database, callback) {
        var query = 'SELECT nombre AS name, ' +
            'porcAbandoned AS perc_abandoned, ' +
            'secAbandoned AS sec_abandoned, ' +
            'porcAnswered AS perc_answered, ' +
            'secAnswered AS sec_answered ' +
            'FROM clientes';
        database.doQuery(query, callback);
    },

    /**
     * This function will store all results from getClients
     *
     * @see getClients
     */
    storeClientsFromDB : function(io, stored_clients, database, results) {
        var prefetched = (stored_clients.length !== 0),
            clients = stored_clients || [];

        for (var i = 0; i < results.length; i++) {
            var result_set = results[i],
                current_position = arrayHelper.arrayObjectIndexOf(
                    clients,
                    result_set.name,
                    'name'
                );

            if (current_position === -1){
                var client = new Client(result_set, io , database);

                clients.push(
                    client
                );
            }
            else {
                clients[current_position].perc_abandoned = result_set.perc_abandoned;
                clients[current_position].perc_answered = result_set.perc_answered;
                clients[current_position].sec_abandoned = result_set.sec_abandoned;
                clients[current_position].sec_answered = result_set.sec_answered;
            }

            console.log('Client %s was loaded on server startup', result_set.name);
        }

        // If there was some clients already loaded and his function is called, it means that the panel
        // is being refetched so we'll get rid of those which aren't in our result
        if (prefetched){
            var to_delete = [];
            for (var j= 0, length = clients.length; j < length; j++){
                var position = arrayHelper.arrayObjectIndexOf(
                    results,
                    clients[j].name,
                    'name'
                );

                if (position === -1) {
                    to_delete.push(clients[j].name);
                }
            }

            arrayHelper.deleteSeveralFromArrayOfObjects(to_delete, clients, 'name');
        }

        return clients;
    },

    /**
     * This is a helper method that gets a client object by it's name
     *
     * @param name you are looking for
     * @return {Client} the object or undefined
     */
    getClientFromName : function (clients, name){
        var client,
            client_position = arrayHelper.arrayObjectIndexOf(clients, name , 'name');

        if (client_position !== -1){ client = clients[client_position]; }

        return client;
    },

    storeCall : function (storage, now, call_date, type, meet_sla) {
        var hour = now.getHours();

        if (storage[hour] === undefined){
            storage[hour] = {
                total : 0,
                answered : 0,
                abandoned : 0,
                answered_sla : 0,
                abandoned_sla : 0,
                answered_time : 0,
                abandoned_time : 0
            };
        }

        storage[hour].total++;
        storage[hour][type]++;
        storage[hour][type + '_time'] += parseInt(((now - call_date) /1000).toFixed(0),10);
        if (meet_sla){ storage[hour][type + '_sla']++; }
    }
};
exports.model = Client;
exports.utils = utils;