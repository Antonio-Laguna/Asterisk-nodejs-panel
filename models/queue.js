var arrayHelper = require('../helpers/array.js'),
    timeHelper = require('../helpers/time.js');

function Queue(data){
    // Stats
    this.total_calls = 0;
    this.total_abandoned = 0;
    this.total_abandoned_before_sla = 0;
    this.total_answered = 0;
    this.total_answered_before_sla = 0;

    this.name = data.name;
    this.color = data.color;
    this.client_name = data.client;
    this.client_obj = data.client_obj;

    // Initializing and data fullfillment
    this.calls = [];
    this.last_call_time = null;
    this.last_call_time_diff = null;
}

var utils = {
    fetchQueues : function(database, io, stored_queues, clients, getClientFromName, callback){
        var queues = [];

        utils.getQueues(database,function(results){
            queues = utils.storeQueuesFromDB(stored_queues, clients, getClientFromName, results);
            callback.apply(undefined,[queues]);
        });
    },
    getQueues : function(database, callback){
        var query = "SELECT " +
            "colas.nombre AS name, " +
            "colas.color AS color, " +
            "clientes.nombre AS client " +
            "FROM colas " +
            "INNER JOIN numeros_cabecera cabecera ON colas.numero = cabecera.id " +
            "INNER JOIN clientes ON cabecera.cliente = clientes.idCliente " +
            "WHERE colas.panel = 1 " +
            "ORDER BY nombreCola ASC";

        database.doQuery(query, callback);
    },
    storeQueuesFromDB : function(stored_queues, clients, getClientFromName, results){
        // This part runs through the current queue list and update as needed. If the queue isn't found on results
        // it will be deleted
        var queues = stored_queues || [],
            to_delete = [];

        for (var i = 0, len = queues.length; i < len; i ++){
            var queuePosition = arrayHelper.arrayObjectIndexOf(results, queues[i].name, 'name');

            if (queuePosition === -1) { // If we don't find it in the results may be hidden or deleted
                to_delete.push(queues[i].name);
            }
            else{
                if (queues[i].color !== results[queuePosition].color){
                    queues[i].color = results[queuePosition].color;
                }
            }
        }

        // Deleting
        arrayHelper.deleteSeveralFromArrayOfObjects(to_delete, queues, 'name');

        // This part will do the other part, adding queues that aren't present.
        for (var j = 0, length = results.length; j < length; j++){

            var selfQueuePosition = arrayHelper.arrayObjectIndexOf(
                queues,
                results[j].name,
                'name'
            );

            if (selfQueuePosition === -1){//We have to insert
                console.log('New queue detected: %s', results[j].name);

                queues.push(
                    new Queue(
                        {
                            name: results[j].name,
                            color: results[j].color,
                            client_name: results[j].client,
                            client_obj : getClientFromName(clients, results[j].client)
                        }
                    )
                );
            }
        }

        return queues;
    },

    dispatchCall : function(data){
        var queue = data.queue,
            client = queue.client_obj;

        if (queue !== undefined){
            var calls_length = queue.calls.length;

            if (data.type === 'in'){
                // Pushing the call to the queue
                queue.calls.push({
                    uniqueid : data.uniqueid,
                    date: new Date()
                });

                // If there is only one call in the queue, the last time of a call is right now!
                if (queue.calls.length === 1) {
                    queue.last_call_time = new Date();
                }
            }
            else
            {
                // If it's in the queue
                var call_position = arrayHelper.arrayObjectIndexOf(queue.calls, data.uniqueid, 'uniqueid');

                if (call_position !== -1) {
                    var call = queue.calls[call_position],
                        now = new Date();

                    // Client stats stuff
                    client.storeCall(now, call.date, data.abandoned);
                    client.sendStatus();

                    arrayHelper.deleteFromArrayOfObjects(queue.calls, data.uniqueid, 'uniqueid');

                    if (queue.calls.length === 0) {
                        queue.last_call_time = null;
                    }
                    else {
                        queue.last_call_time = queue.calls[0].date;
                    }
                }
                else {
                    console.log('Sorry, we couldn\'t find the call [%s]  within %s.', data.uniqueid, queue.name);
                }
            }
            //Emiting by socket
            data.io.sockets.emit('callInOrOutQueue', {
                type: (data.abandoned === false) ? data.type : 'abandoned',
                queue: queue.name,
                calls: queue.calls.length,
                timeSince: timeHelper.calculateTimeSince(queue.last_call_time)
            });
        }
    },
    getStatus : function (queues){
        var status = [];

        for (var i = 0, length = queues.length; i < length; i++){
            status.push({
                color : queues[i].color,
                last_call_time_diff : timeHelper.calculateTimeSince(queues[i].last_call_time),
                name : queues[i].name,
                num_calls : queues[i].calls.length
            });
        }

        return status;
    },
    getQueueFromName : function(queues, queue_name){
        var queuePosition = arrayHelper.arrayObjectIndexOf(queues, queue_name, 'name');
        return (queuePosition !== -1) ? queues[queuePosition] : undefined;
    },
    resetData : function(queues) {
        for (var i = 0, length = queues.length; i < length; i++){
            queues[i].total_calls = 0;
            queues[i].total_abandoned = 0;
            queues[i].total_abandoned_before_sla = 0;
            queues[i].total_answered = 0;
            queues[i].total_answered_before_sla = 0;
        }
    }
};

exports.model = Queue;
exports.utils = utils;