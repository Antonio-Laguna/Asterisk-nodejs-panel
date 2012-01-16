util = require('util');

function Agent(codAgente,nombre,apellido1,apellido2, queues, io){
    this.status = 1;
    this.prevStatus = 0;
    /********************************************************************************
     *                              INDEX OF STATUS
     *
     * 1 - Available: Agent is available and can receive calls
     * 2 - Unavailable: Agent is unavailable and can't receive calls
     * 3 - Administrative time: Agent is in administrative time, can't receive calls
     * 4 - Incoming call: Agent is attending an incoming call
     * 5 - Outgoing call: Agent is performing an outgoing call
     ********************************************************************************/
    this.codAgente = codAgente;
    this.nombre = nombre;
    this.apellido1 = apellido1;
    this.apellido2 = apellido2;
    this.currentStatusTime = null;
    this.currentStatusTimeDiff = null;
    this.currentCallTimeDiff = null;
    this.currentCallTime = null;
    this.currentTalkingQueue = null;
    this.queues = this.getQueues(queues);
    io.sockets.emit('logAgent', this);
}

Agent.prototype.calculateTimes = function(timerHelper){
    if (this.currentStatusTime != null)
        this.currentStatusTimeDiff = timerHelper.calculateTimeSince(this.currentStatusTime);
    if (this.currentCallTime != null)
        this.currentCallTimeDiff = timerHelper.calculateTimeSince(this.currentCallTime);
};
Agent.prototype.changeStatus = function(status, io, queue){
    if (status == 1){
        this.currentStatusTime = null;
        this.currentStatusTimeDiff = null;
        this.currentCallTime = null;
        this.currentCallTimeDiff = null;
        this.currentTalkingQueue = null;
    }
    else {
        if (status < 4){// That's it, not talking by phone
            this.currentStatusTime = new Date;
            this.currentTalkingQueue = null;
        }
        else{
            this.currentCallTime = new Date;
            this.prevStatus = this.status;
            this.currentTalkingQueue = queue;
        }
    }

    this.status = status;
    io.sockets.emit('changeEvent', {agent: this.codAgente, status: this.status, queue: this.currentTalkingQueue});
};
Agent.prototype.endCall = function (socket){
    if (this.prevStatus != 1)// Administrative time or unavailable
        this.changeStatus(this.prevStatus,socket,null);
    else
        this.changeStatus(1,socket,null);
    this.currentTalkingQueue = null;
};
Agent.prototype.getQueues = function (queues){
    var array = [];
    for (var i=0, len = queues.length; i < len; i ++){
        array.push({
            name: queues[i].cola.replace('Cola',''),
            priority: queues[i].prioridad
        });
    }
    return array;
}
module.exports = Agent;