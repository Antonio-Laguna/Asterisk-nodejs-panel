function Queues (mysql_client, arrayHelper, timeHelper){
    this.queues = [];
    this.arrayHelper = arrayHelper;
    this.timeHelper = timeHelper;
    var self = this;

    mysql_client.query("SELECT colas.nombre as 'nombreCola', colas.color as 'color' FROM colas, clientes WHERE colas.cliente = clientes.idCliente AND idCliente != 0 AND panel = 1",
    function (err, results, fields){
        var queues = [];
        if (err){
            throw err;
        } else {
            for (var i=0, len = results.length; i < len; i++){
                queues.push({
                    name: results[i].nombreCola.replace('Cola',''),
                    originalName: results[i].nombreCola,
                    color: results[i].color,
                    calls: [],
                    lastCallTime: null,
                    lastCallTimeDiff: null
                });
            }
            self.queues = queues;
        }
    });
}

Queues.prototype.refetchQueues = function (mysql_client, refetcher){
    var self = this;
    var update = false;
    mysql_client.query("SELECT colas.nombre as 'nombreCola', colas.color as 'color' FROM colas, clientes WHERE colas.cliente = clientes.idCliente AND idCliente != 0 AND panel = 1",
    function (err, results, fields){
        // This part runs through the current queue list and update as needed. If the queue isn't found on results
        // it will be deleted
        for (var i = 0, len = self.queues.length; i < len; i ++){
            var queuePosition = self.arrayHelper.arrayObjectIndexOf(results, self.queues[i].originalName,'nombreCola');
            if (queuePosition === -1){ // If we don't find it in the results may be hidden or deleted
                console.log('La cola %s ha sido eliminada',self.queues[i].name);
                self.queues.splice(i,1); // So we have to delete it
                len--;
                update = true;
            }
            else{
                if (self.queues[i].color !== results[queuePosition].color){
                    self.queues[i].color = results[queuePosition].color;
                    update = true;
                }
            }
        }
        // This part will do the other part, adding queues that aren't present.
        for (var j = 0, length = results.length; j < length; j++){
            var selfQueuePosition = self.arrayHelper.arrayObjectIndexOf(
                    self.queues,
                    results[j].nombreCola,
                    'originalName'
            );
            if (selfQueuePosition === -1){//We have to insert
                console.log('Nueva cola detectada: %s', results[j].nombreCola.replace('Cola',''));
                self.queues.push({
                    name: results[j].nombreCola.replace('Cola',''),
                    originalName: results[j].nombreCola,
                    color: results[j].color,
                    calls: [],
                    lastCallTime: null,
                    lastCallTimeDiff: null
                });
                update = true;
            }
        }
        refetcher.done('queues',update);
    });
};
/*
 * When a call is received by a Queue, this function will be called
 * @data.queue : This is the Queue name.
 * @data.uniqueid : This is the uniqueid of the call
 * @data.type : The type of the event. The call could be 'in'serted or 'out' of the queue
 *
 * @returns nothing!
 */
Queues.prototype.dispatchCall = function(data){
    var queueName = data.queue.replace('Cola','');
    var queuePosition = this.arrayHelper.arrayObjectIndexOf(this.queues,data.queue.replace('Cola',''), 'name');

    if (data.type === 'in'){
        this.queues[queuePosition].calls.push({
            uniqueid : data.uniqueid,
            date: new Date()
        });
        if (this.queues[queuePosition].calls.length === 1)
            this.queues[queuePosition].lastCallTime = new Date();
    }
    else {
        this.arrayHelper.deleteFromArrayOfObjects(this.queues[queuePosition].calls,data.uniqueid,'uniqueid');
        if (this.queues[queuePosition].calls.length === 0)
                this.queues[queuePosition].lastCallTime = null;
            else
                this.queues[queuePosition].lastCallTime = this.queues[queuePosition].calls[0].date;
    }
    data.io.sockets.emit('callInOrOutQueue', {
        type: (typeof data.abandoned === "undefined") ? data.type : 'abandoned',
        queue: queueName,
        calls: this.queues[queuePosition].calls.length,
        timeSince: this.timeHelper.calculateTimeSince(this.queues[queuePosition].lastCallTime)
    });
};
Queues.prototype.currentStatus = function (){
    for (var i = 0, len = this.queues.length; i < len; i++){
        this.queues[i].lastCallTimeDiff = this.timeHelper.calculateTimeSince(this.queues[i].lastCallTime);
    }
};
module.exports = Queues;