(function($){
    function pad(str, len, pad) {
        str += ' ';
        if (str.length < len){
            for (var i = str.length; i < len; i++){
                str += pad;
            }
        }
        str += ' ';

        return str;
    }

    var Panel = {
        // Configuration and default values
        currentCalls : 0,
        ISADMIN : false,
        SLALLAM : 40000,
        SLA_THRESHOLD : 3600000,
        visible_queues : [],
        queues_hidden : false,
        $queuesBox : null,
        MAXLLAM : 30,
        statuses : [
            {
                name : 'Disconnected',
                color : 'gris',
                start_timer : false,
                is_call : false
            },
            {
                name : 'Available',
                color : 'verde',
                start_timer : false,
                is_call : false
            },
            {
                name : 'Meeting',
                color : 'rojo',
                start_timer : true,
                is_call : false
            },
            {
                name : 'Administrative',
                color : 'amarillo',
                start_timer : true,
                is_call : false
            },
            {
                name : 'Incoming',
                color : 'azul',
                start_timer : true,
                is_call : true
            },
            {
                name : 'Outgoing',
                color : 'azul-claro',
                start_timer : true,
                is_call : true
            },
            {
                name : 'Resting',
                color : 'naranja',
                start_timer : true,
                is_call : false
            },
            {
                name : 'Glory time',
                color : 'morado',
                start_timer : true,
                is_call : false
            }
        ],
        sla_clients : ['Almirall','Applus','Isolux Corsán','Repsol'],

        init: function (config){
            this.config = config;

            this.setupTemplates();
            this.bindEvents();
        },
        sendSlaNotifications : function(){
            for (var i = 0, length = Panel.sla_clients.length; i < length; i++){
                var client_name = Panel.sla_clients[i];
                $.getJSON('/stats/json/clients/'+ client_name +'/', Panel.createNotification);
            }
        },
        createNotification : function(results){
            var notification_body = pad('**Answered calls time SLA** : ' + ((results.answered_before_SLA * 100) / results.total_answered).toFixed(1) + '%', 53,'-');
            notification_body +=  pad(' **Abandoned calls SLA** : ' + ((results.abandoned_after_SLA * 100) / results.total_offered_calls).toFixed(1) + '%', 53,'-');
            notification_body +=  ' **Average response time** : ' + results.average_response_time + ' seconds';

            var notification = window.webkitNotifications.createNotification('',
                results.client_name + ' - SLAs',
                notification_body
            );
            //Show the popup
            notification.show();

            setTimeout(function(){
                notification.close();
            },'30000')
        },
        bindEvents : function(){
            var self = this;

            this.config.queuesHolder.on({
                mouseenter : self.vanishAgents,
                mouseleave : self.unVanishAgents,
                click : self.queueClick
            }, this.config.queueBoxSelector);

            this.config.clientLogos.on('click', self.clientLogoClick);
        },
        setupTemplates: function(){
            Handlebars.registerHelper('length', function(array){
                return array.length;
            });

            this.config.templateAgent = Handlebars.compile(this.config.templateAgent);
            this.config.templateQueue = Handlebars.compile(this.config.templateQueue);
            this.config.templateQueueAgent = Handlebars.compile(this.config.templateQueueAgent);
            this.config.templateQueueAlert = Handlebars.compile(this.config.templateQueueAlert);
        },
        vanishAgents : function() {
            var id = $(this).data('cola');

            $(Panel.config.agentBoxSelector).filter(function(){
                return $(this).find('span[data-cola="'+id+'"]').length === 0;
            }).addClass('transparent');
        },
        unVanishAgents : function() {
            Panel.config.agentsHolder.find('.caja_agente.transparent').removeClass('transparent');
        },
        queueClick : function() {
            if (window.webKitNotifications) { window.webkitNotifications.requestPermission(); }
            var $this = $(this),
                queue = $this.data('cola');

            Panel.unVanishAgents();

            if ($this.hasClass('transparent'))
            {
                $this.removeClass('transparent');
                Panel.visible_queues.push(queue);
            }
            else
            {
                if (!Panel.queues_hidden)
                { //Es la primera cola que estamos ocultando
                    Panel.$queuesBox.filter(function(){
                        return $(this)[0] !== $this[0];
                    }).addClass('transparent');

                    Panel.visible_queues.push(queue);
                    Panel.queues_hidden = true;
                }
                else
                {
                    $this.addClass('transparent');
                    Panel.visible_queues.splice(Panel.visible_queues.indexOf(queue),1);
                }
            }

            // If no queue is hidden
            if(Panel.visible_queues.length === 0){
                Panel.config.queuesHolder.find('.transparent').removeClass('transparent');
                Panel.queues_hidden = false;

                $(Panel.config.agentBoxSelector + ':hidden').show();
                Panel.config.agentsHolder.find('div.invisible').hide();
            }
            else {
                $(Panel.config.agentBoxSelector).filter(function(){
                    var $this = $(this),
                        colas = $this.find('span.cola');

                    var filtradas = colas.filter(function(){
                        return Panel.visible_queues.indexOf($(this).data('cola')) === -1;
                    });

                    if (colas.length !== filtradas.length && $this.is(':hidden'))
                    {
                        $this.show();
                    }
                    return colas.length === filtradas.length;
                }).hide();
            }
            localStorage.setItem('visible-queues', Panel.visible_queues.join('-'));
        },
        clientLogoClick : function() {
            var client = $(this).data('cliente');

            Panel.$queuesBox.filter(function(){
                return $(this).data('cola').indexOf(client) !== -1;
            }).trigger('click');
        },
        addQueues : function(queues){
            queues = $.grep(queues, function(n,i){
                return (($('#cola-'+ i.name)).length === 0);
            });

            $.each(queues, function(key, queue){
                var html = Panel.config.templateQueue(queue);

                $(html).hide().appendTo(Panel.config.queuesHolder).fadeIn('slow');

                if (queue.lastCallTimeDiff){
                    var divQueue = $('#cola-'+queue.name),
                        divCallingTime = divQueue.find('div.tiempo-llamadas');

                    divCallingTime
                        .stopwatch({
                            timeFormat: 'mm:ss',
                            startTime: queue.last_call_time_diff
                        }).stopwatch('start');
                }
            });
            Panel.$queuesBox = $(Panel.config.queueBoxSelector);

            if(Panel.ISADMIN){
                Panel.makeQueuesDraggable();
            }
        },
        makeQueuesDraggable : function() {
            Panel.$queuesBox.draggable({
                opacity: 0.7,
                helper: 'clone',
                revert: true
            });
        },
        showTrashCans : function() {
            Panel.config.trashcans = $('img.force-unlog').css('cursor','pointer').show();
            Panel.config.trashcans.on('click', Panel.unlogAgent);
        },
        unlogAgent : function(e){
            var agent_box = $(this).closest('div.caja_agente');
            var aux = agent_box.attr('id').split('-');
            var cod_agente = aux[1];

            if(cod_agente !== undefined){
                if (confirm('¿Seguro que quiere deslogar la extensión ' + cod_agente + '?')){
                    socket.emit('forceUnlog', {
                        agent : cod_agente
                    });
                }
            }
        },
        addAgents : function(agents){
            $.each(agents, function(key, agent){
                if ($('#agente-'+agent.codAgente).length === 0){
                    var html = Panel.config.templateAgent({
                        codAgente: agent.codAgente,
                        headingColor: Panel.statuses[agent.status_id].color,
                        status: Panel.statuses[agent.status_id].name,
                        visible: (agent.status_id !== 0),
                        name: [
                            agent.nombre,
                            agent.apellido1,
                            agent.apellido2
                        ].join(' ')
                    });

                    if (agent.status_id === 0){
                        $(html).hide().appendTo(Panel.config.agentsHolder);
                    }
                    else {
                        $(html).hide().appendTo(Panel.config.agentsHolder).fadeIn('slow');
                    }

                    var callDifference = agent.currentCallTimeDiff,
                        previousDifference = agent.currentStatusTimeDiff,
                        agentBox = $('div#agente-'+ agent.codAgente),
                        queueContainer = agentBox.find('.colas');

                    queueContainer.append(
                            Panel.config.templateQueueAgent(
                                Panel.listAgentsQueues(agent.queues, agent.codAgente)
                        )
                    );

                    if (callDifference|| previousDifference){
                        var timer = agentBox.find('.tiempos');
                        if (callDifference && previousDifference) { //If we got both
                            timer.stopwatch({timeFormat: 'mm:ss', startTime: callDifference}).stopwatch('start');
                            timer.data('tiempoEstado',previousDifference-callDifference);
                        }
                        else{ // Just one
                            if (callDifference){
                                timer.stopwatch({timeFormat: 'mm:ss', startTime: callDifference}).stopwatch('start');
                            }
                            else{
                                timer.stopwatch({timeFormat: 'mm:ss', startTime: previousDifference}).stopwatch('start');
                            }
                        }
                    }
                    if (agent.currentTalkingQueue){
                        agentBox.find('.cola').addClass('transparent');
                        $('#'+[agent.codAgente,agent.currentTalkingQueue].join('-')).removeClass('transparent');
                    }
                }
            });

            if (Panel.ISADMIN) {
                Panel.makeAgentsDroppable();
                Panel.showTrashCans();
            }

            Panel.toolTipsOnAgentQueues();
            Panel.calculateAgentsAvailablePerQueue();
        },
        makeAgentsDroppable : function() {
            $(Panel.config.agentBoxSelector).droppable({
                accept : Panel.targetValidAgentHelper,
                activeClass : 'target',
                hoverClass: "flash",
                drop : Panel.dropQueueOverAgent
            });
        },
        toolTipsOnAgentQueues : function() {
            $(Panel.config.agentBoxSelector).find('.cola').tipTip({defaultPosition: 'top'});
        },
        targetValidAgentHelper : function () {
            var $this = $(this),
                header = $this.find('h2');

            return ($this.hasClass('visible') &&
                    (!header.hasClass('gradiente-azul') &&  !header.hasClass('gradiente-azul-claro'))
                  );
        },
        dropQueueOverAgent : function( event, ui ) {
            var $queue = $(ui.draggable[0]),
                $this = $(this),
                queueName = $queue.data('cola'),
                agent = $this.attr('id').replace('agente-','');

            Panel.unVanishAgents();

            socket.emit('sendCall', {
                from : queueName,
                to : agent
            });
        },
        listAgentsQueues : function(queues, codAgente){
            var returnable = [];
            $.each(queues, function (key, queue){
                var style = $('#cola-'+ queue.name).find('header').attr('style');
                returnable.push({
                    style : style,
                    id: [codAgente , queue.name].join('-'),
                    text: queue.priority,
                    queue: queue.name
                });
            });
            return returnable;
        },
        agentRinging : function(data){
            var agentBox = $('#agente-'+ data.agent);

            if (agentBox.length > 0){
                switch (data.action){
                    case 'start':
                        agentBox.addClass('ring');
                        break;
                    case 'stop':
                        agentBox.removeClass('ring');
                        break;
                }
            }
        },
        calculateAgentsAvailablePerQueue : function(){
            Panel.config.queuesHolder.find(Panel.config.queueBoxSelector).each(function(i, queue_box){
                var $this = $(this),
                    agents = 0,
                    agents_available = 0,
                    queue_name = $this.data('cola');

                var agents_in_queue = Panel.config.agentsHolder.find('span[data-cola="' + queue_name +'"]');
                agents = agents_in_queue.length;

                agents_in_queue.each(function(i,span){
                    var header = $(this).parent().parent().parent().find('h2');
                    if (header.hasClass('gradiente-verde')){
                        agents_available++;
                    }
                    else if (header.hasClass('gradiente-gris')){
                        agents--;
                    }
                });

                $this.find('.agentes-cola').text('('+ [agents_available,agents].join('/') +')');
            });
        },
        changeStatus : function(data){
            var agentBox = $('#agente-'+ data.agent),
                header = agentBox.find('h2.cabecera'),
                timer = agentBox.find('div.tiempos'),
                agentQueues = agentBox.find('.cola'),
                callTime, previousTime,
                status = Panel.statuses[data.status];

            agentBox.removeClass('ring');

            if (!data.queue){
                agentQueues.removeClass('transparent');
            }

            if (! status.start_timer) {
            // We have to remove timers
                if (timer.text()!= '')
                    timer.stopwatch('destroy').text('');
            }
            else { // This status init a new timer
                if (!status.is_call){
                    if (timer.text() === '') // Starting a new timer
                        timer.stopwatch({timeFormat: 'mm:ss'}).stopwatch('start');
                    else{
                        if ((header.hasClass('gradiente-azul-claro') || header.hasClass('gradiente-azul')) && status.name !== 'Glory time'){ //If it's a call
                            callTime = timer.stopwatch('getTime');
                            previousTime = timer.data('tiempoEstado');
                            timer.stopwatch('destroy');
                            timer.stopwatch({timeFormat: 'mm:ss', startTime: previousTime+callTime}).stopwatch('start');
                        }
                        else {
                            this.totallyResetTimer(timer);
                        }
                    }
                }
                else { //It's a call
                    Panel.vanishAgentQueues(data.queue,data.agent);
                    if (timer.text() === ''){
                        timer.stopwatch({timeFormat: 'mm:ss'}).stopwatch('start');
                    }
                    else{ // We have to save the previous time
                        previousTime = timer.stopwatch('getTime');
                        timer.data('tiempoEstado',previousTime);
                        this.totallyResetTimer(timer);
                    }
                }
            }
            header.find('small').text(status.name);
            header.removeClass().addClass('cabecera gradiente-' + status.color);
            if (status.name === 'Disconnected'){
                agentBox.addClass('invisible').hide();
            }
            else {
                if (!agentBox.is(':visible') && agentQueues.filter(function(i){
                    return $(this).data('cola').indexOf(Panel.visible_queues) !== -1;
                }).length > 0 ){
                    agentBox.removeClass('invisible').fadeIn();
                }
            }
            Panel.calculateAgentsAvailablePerQueue();
        },
        /**
         * This function will vanish all queues of a selected agent and will leave one active.
         *
         * @param queue - The queue which will remain active
         * @param agent - The agent that contains the queue
         */
        vanishAgentQueues : function (queue, agent){
            if (agent && queue){
                // ALL THE QUEUES TRANSPARENTS!!1!
                $('#agente-'+ agent).find('.cola').addClass('transparent');
                var agent_queue = $('span#'+agent+'-'+queue);

                if (agent_queue.length !== 0) {
                    agent_queue.removeClass('transparent');
                }
            }
        },
        totallyResetTimer : function (timer){
            timer.stopwatch('destroy');
            timer.stopwatch({timeFormat: 'mm:ss'}).stopwatch('start');
        },
        totallyDestroyTimer : function (timer){ timer.stopwatch('destroy').text(''); },
        updateCurrentCalls : function (calls){

            if (calls.calls !== undefined || calls.calls !== null){
                this.currentCalls = calls.calls;
            }
            var percent = ((this.currentCalls / this.MAXLLAM) * 100).toFixed(0);
            this.config.percentHolder.text(percent + ' %');
            this.config.awaitingHolder.text(calls.awaiting);
            this.config.talkingHolder.text(calls.talking);
        },
        callInOrOutOfQueue : function (data){
            var queueDiv = $('#cola-'+data.queue),
                callTimerDiv = queueDiv.find('.tiempo-llamadas');

            queueDiv.find('.llamadas-cola').text('('+data.calls+')');

            if (data.calls === 0){
                Panel.totallyDestroyTimer(callTimerDiv);
            }
            else {
                if (callTimerDiv.text() === ''){ // There weren't any calls
                    callTimerDiv.stopwatch({
                        timeFormat: 'mm:ss'
                    }).stopwatch('start');
                }
                else{
                    /*callTimerDiv.stopwatch({
                        timeFormat: 'mm:ss',
                        startTime: data.timeSince
                    }).stopwatch('start');*/
                }
            }
        },
        loadFilterPrefs : function() {
            var aux = localStorage.getItem('visible-queues');

            if (aux !== null){
                aux = aux.split('-');

                if (aux.length !== Panel.$queuesBox.length){
                    Panel.$queuesBox.filter(function(){
                        return $.inArray($(this).data('cola'),aux) !== -1;
                    }).trigger('click');
                }
            }
        },
        alertQueue : function(queue){
            if (Panel.ISADMIN &&
                Panel.visible_queues.length !== Panel.$queuesBox.length &&
                Panel.visible_queues.indexOf(queue) !== -1){

                var new_window = window.open('','height=150,width=150,location=no,menubar=no,resizable=no,scrollbars=no,status=no,titlebar=no');
                new_window.document.write(Panel.config.templateQueueAlert({queue:queue}));
                new_window.focus();
            }
        }
    };
    Panel.init({
        templateAgent : $('#template-agente').html(),
        templateQueue : $('#template-cola').html(),
        templateQueueAgent : $('#template-cola-agente').html(),
        templateQueueAlert : $('#template-alert-queue').html(),
        agentsHolder : $('#contenedorAgentes'),
        agentBoxSelector : 'div.caja_agente',
        queuesHolder : $('#widgetHolder'),
        queueBoxSelector : 'div.caja-cola',
        percentHolder : $('#texto-porcentaje'),
        awaitingHolder : $('#texto-awaiting'),
        talkingHolder : $('#texto-talking'),
        clientLogos : $('img.logo-cliente')
    });

    // Sockets STUFF and function binding
    //region Socket.io stuff
    var socket = io.connect('SOCKET_IO_HOST');

    socket.on('currentStatus', function (data){
        console.log(data);
        Panel.ISADMIN = data.is_admin;
        Panel.addQueues(data.queues);
        Panel.addAgents(data.agents);
        Panel.updateCurrentCalls(data);
        Panel.loadFilterPrefs();

        if (window.webkitNotifications && Panel.ISADMIN && window.webkitNotifications.checkPermission() === 0){
            Panel.sendSlaNotifications();
            setInterval(Panel.sendSlaNotifications, Panel.SLA_THRESHOLD);
        }
    });
    socket.on('logAgent', Panel.addAgents);
    socket.on('agentRinging',Panel.agentRinging);
    socket.on('changeEvent', function (data) {
        Panel.changeStatus({
            agent: data.agent,
            status: data.status,
            queue: data.queue
        });
    });
    socket.on('updatePrimary', function (data){ Panel.updateCurrentCalls(data);});
    socket.on('reload', function(){
        window.location.reload(true);
    });
    socket.on('simAvailability', function(data){
        var $sim = $('#sim_' + data.sim);
        if (data.available){
            $sim.removeClass('ocupada').removeClass('libre').addClass('libre');
        }
        else {
            $sim.removeClass('libre').removeClass('ocupada').addClass('ocupada');
        }
    });
    socket.on('callInOrOutQueue', Panel.callInOrOutOfQueue);
    //endregion
})(jQuery);