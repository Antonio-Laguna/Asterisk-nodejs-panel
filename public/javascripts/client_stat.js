(function($){
    function pad2(number) {
        return (number < 10 ? '0' : '') + number
    }
    function fixedTo (number, n) {
        var k = Math.pow(10, n+1);
        return (Math.round(number * k) / k);
    }

    function formatSeconds (seconds){
        seconds = Number(seconds);

        var h = Math.floor(seconds / 3600) || 0;
        var m = Math.floor(seconds % 3600 / 60) || 0;
        var s = Math.floor(seconds % 3600 % 60) || 0;

        return ((m > 0 ? (h > 0 && m < 10 ? "00" : "") + pad2(m) + ":" : "00:") + (s < 10 ? "0" : "") + s);
    }

    var Stats = {
        inbound_calls : 0,
        failed_calls : 0,
        offered_calls : 0,
        abandoned_calls : 0,
        basic_route : '/stats/clients/',
        abandoned_sla : 0,
        abandoned_perc : 0,
        abandoned_sla_perc : 0,
        answered_calls : 0,
        answered_perc : 0,
        answered_sla : 0,
        answered_sla_perc : 0,
        average_response_time : 0,
        colors : Highcharts.getOptions().colors,
        categories : ['Abandoned','Answered'],
        per_hour : [],
        chart : undefined,

        init : function(config){
            this.config = config;

            // Global var!
            if (real_time){
                this.connectSocket();
            }
            else {
                this.receiveData(loaded_stats);
            }
            this.bindEvents();
        },
        connectSocket : function(){
            this.socket = io.connect(this.config.socket_address);
        },
        bindEvents : function(){
            var self = this;

            if (self.socket) {
                self.socket.on('clientStatus',self.receiveData);
                window.onbeforeunload = function() {
                    return "Refreshing is unnecesary since data is fetched in real time.";
                }
            }
            self.config.$open_tab.on('click',self.preventEvent);
            self.config.$tab.toggle(self.showTab,self.hideTab);

            self.config. $from.datepicker({
                changeMonth: true,
                maxDate : 0,
                onSelect: function( selectedDate ) {
                    self.config.$to.datepicker( "option", "minDate", selectedDate );
                }
            });
            self.config.$to.datepicker({
                defaultDate: "+1w",
                maxDate : 0,
                changeMonth: true,
                onSelect: function( selectedDate ) {
                    self.config.$from.datepicker( "option", "maxDate", selectedDate );
                }
            });

            self.config.$datetime.on('click',self.seeStatsForDate);
            self.config.$realtime.on('click', self.seeRealtime);

        },
        seeRealtime : function(e){
            Stats.preventEvent(e);
            location.href = Stats.basic_route + window.client_name;
        },
        seeStatsForDate : function(e){
            Stats.preventEvent(e);
            var from = Stats.config.$from.datepicker("getDate"),
                to = Stats.config.$to.datepicker("getDate"),
                dates = [];

            if (from === null){
                alert('Plase, select the dates correctly in order to get stats from those dates');
            }
            else {
                if (from) { dates.push(Stats.ISODateString(from)); }
                if (to) { dates.push(Stats.ISODateString(to)); }

                location.href = Stats.basic_route + window.client_name + '/' + dates.join('/to/');
            }
        },
        preventEvent : function(e){
            e.preventDefault();
        },
        showTab : function(){
            Stats.config.$tab
                .stop()
                .animate({
                    right: "400px"
                },500, function(){
                    Stats.config.$inner_tab.addClass('expanded');
                });
            Stats.config.$panel
                .stop()
                .animate({
                    width: "400px",
                    opacity: 0.8
                }, 500, function(){
                    Stats.config.$content.fadeIn('slow');
                });
        },
        hideTab : function() {
            Stats.config.$content.fadeOut('slow', function() {
                Stats.config.$tab
                    .stop()
                    .animate({
                        right: "0"
                    },500, function(){
                        Stats.config.$inner_tab.removeClass();
                    });
                Stats.config.$panel
                    .stop()
                    .animate({
                        width: "0",
                        opacity: 0.1
                    }, 500);
            });
        },
        receiveData : function (data){
            Stats.storeData(data);
            Stats.updateWeb();
            Stats.tableHourUpdate();
            if (Stats.chart === undefined){
                Stats.chartInit();
            }
            else{
                Stats.chartUpdate();
            }
        },
        getChartData : function(){
            var data = [{
                y: parseFloat(Stats.abandoned_perc,10),
                color: Stats.colors[1],
                drilldown: {
                    name: 'Abandoned',
                    categories: ['Abandoned in SLA', 'Abandoned out of SLA'],
                    data: [
                        parseFloat(parseFloat(Stats.abandoned_sla_perc,10).toFixed(1),10),
                        parseFloat(parseFloat((100 - Stats.abandoned_sla_perc),10).toFixed(1),10)
                    ],
                    color: Stats.colors[0]
                }
            }, {
                y: parseFloat(Stats.answered_perc,10),
                color: Stats.colors[2],
                drilldown: {
                    name: 'Answered',
                    categories: ['Answered in SLA', 'Answered out of SLA'],
                    data: [
                        parseFloat(parseFloat(Stats.answered_sla_perc,10).toFixed(1),10),
                        parseFloat(parseFloat((100 - Stats.answered_sla_perc),10).toFixed(1),10)
                    ],
                    color: Stats.colors[2]
                }
            }];

            var total_data = [];
            var sla_data = [];
            for (var i = 0; i < data.length; i++) {
                total_data.push({
                    name: Stats.categories[i],
                    y: data[i].y,
                    color: data[i].color
                });
                for (var j = 0; j < data[i].drilldown.data.length; j++) {
                    var brightness = 0.2 - (j / data[i].drilldown.data.length) / 5 ;
                    sla_data.push({
                        name: data[i].drilldown.categories[j],
                        y: data[i].drilldown.data[j],
                        color: Highcharts.Color(data[i].color).brighten(brightness).get()
                    });
                }
            }
            return {
                total : total_data,
                sla : sla_data
            };
        },
        chartInit : function(){
            var data = Stats.getChartData();

            Stats.chart = chart = new Highcharts.Chart({
                chart: {
                    renderTo: 'graph-calls',
                    backgroundColor : '#707275',
                    type: 'pie'
                },
                title: {
                    text: ''
                },
                yAxis: {
                    title: {
                        text: ''
                    }
                },
                plotOptions: {
                    pie: {
                        shadow: false
                    }
                },
                tooltip: {
                    formatter: function() {
                        return '<b>'+ this.point.name +'</b>: '+ this.y +' %';
                    }
                },
                series: [{
                    name: 'Total',
                    data: data.total,
                    size: '60%',
                    dataLabels: {
                        formatter: function() {
                            return this.y > 5 ? this.point.name : null;
                        },
                        color: 'white',
                        distance: -30
                    }
                }, {
                    name: 'Sla',
                    data: data.sla,
                    innerSize: '60%',
                    dataLabels: {
                        formatter: function() {
                            // display only if larger than 1
                            return this.y > 1 ? '<b>'+ this.point.name +':</b> '+ this.y +'%'  : null;
                        },
                        color: 'white'
                    }
                }]
            });
        },
        chartUpdate : function(){
            var data = Stats.getChartData();

            Stats.chart.series[0].setData(data.total,true);
            Stats.chart.series[1].setData(data.sla,true);
        },
        tableHourUpdate : function(){
            var html = '';
            for (var i = 0, length = this.per_hour.length; i < length; i++){
                var service_level = this.per_hour[i].service_level === 'NaN'  ? '-' : this.per_hour[i].service_level;
                html += '<tr>' +
                            '<td>'+ this.per_hour[i].hour_range +'</td>' +
                            '<td>'+ this.per_hour[i].answered +'</td>' +
                            '<td>'+ this.per_hour[i].abandoned +'</td>' +
                            '<td>'+ service_level +' %</td>' +
                            '<td>'+ this.per_hour[i].abandon_rate +' %</td>' +
                            '<td>'+ this.per_hour[i].answered_time +'</td>' +
                            '<td>'+ this.per_hour[i].abandoned_time +'</td>' +
                        '</tr>';
            }
            Stats.config.$stats_table.html(html);
        },
        storeData : function(data){
            this.inbound_calls = data.total_calls;
            this.failed_calls = data.failed_calls;
            this.offered_calls = data.total_offered_calls;
            this.abandoned_calls = data.total_abandoned;
            this.answered_calls = data.total_answered;
            this.abandoned_sla = data.abandoned_after_SLA;
            this.answered_sla = data.answered_before_SLA;
            this.average_response_time = data.average_response_time;
            this.abandoned_sla_perc = Stats.calculatePercent('abandoned');
            this.answered_sla_perc = Stats.calculatePercent('answered');
            this.parseHourStats(data.per_hour);
        },
        parseHourStats : function (per_hour){
            this.per_hour = [];

            if (per_hour) {
                for (var i = 0, len = 24; i < len; i++){
                    if (per_hour[i]){
                        var hour_range = [[pad2(i),'00'].join(':'), [pad2(i+1),'00'].join(':')].join(' - '),
                            total_calls = per_hour[i].abandoned + per_hour[i].answered,
                            abandoned_time = formatSeconds(per_hour[i].abandoned_time / per_hour[i].abandoned),
                            answered_time = formatSeconds(per_hour[i].answered_time / per_hour[i].answered);

                        this.per_hour.push({
                            hour_range : hour_range,
                            abandoned : per_hour[i].abandoned,
                            abandoned_time : abandoned_time,
                            answered : per_hour[i].answered,
                            answered_time : answered_time,
                            service_level : ((per_hour[i].answered_sla * 100) / per_hour[i].answered).toFixed(1),
                            abandon_rate : ((per_hour[i].abandoned * 100) / total_calls).toFixed(1)
                        });
                    }
                }
            }
        },
        updateWeb : function() {
            Stats.config.sla_abandoned.text(parseFloat(Stats.abandoned_sla_perc,10).toFixed(1) + ' %');
            Stats.config.sla_abandoned.removeClass();
            Stats.config.sla_abandoned.addClass('number ' +
                Stats.determineColor(Stats.abandoned_sla_perc, Stats.config.perc_abandoned, true)
            );

            Stats.config.sla_answered.text(parseFloat(Stats.answered_sla_perc,10).toFixed(1) + ' %');
            Stats.config.sla_answered.removeClass();
            Stats.config.sla_answered.addClass('number ' +
                Stats.determineColor(Stats.answered_sla_perc, Stats.config.perc_answered)
            );

            Stats.config.average_response_time_row
                    .text(Stats.average_response_time || '0')
                    .removeClass()
                    .addClass('number ' + Stats.determineColor(Stats.average_response_time, Stats.config.sec_answered, true));

            Stats.config.inbound_calls_row.text(Stats.inbound_calls);
            Stats.config.failed_calls_row.text(Stats.failed_calls);
            Stats.config.kpi_abandoned_row.text(Stats.abandoned_perc || '0' + ' %');

            Stats.config.offered_calls_row.text(Stats.offered_calls);

            Stats.config.abandoned_calls_row.text(Stats.abandoned_calls);
            Stats.config.answered_calls_row.text(Stats.answered_calls);
            Stats.config.abandoned_sla_row.text(Stats.abandoned_sla);
            Stats.config.answered_sla_row.text(Stats.answered_sla);
        },
        logData : function(data){
            console.log(data);
        },
        ISODateString : function (d) {
            function pad(n){
                return n < 10 ? '0'+ n : n
            }
            return d.getUTCFullYear()+'-'
                + pad(d.getMonth()+1)+'-'
                + pad(d.getDate())+'T'
                + pad(d.getHours())+':'
                + pad(d.getMinutes())+':'
                + pad(d.getSeconds())+'Z'
        },
        calculatePercent : function(which) {
            var total, amount;

            if (which === 'abandoned'){
                total = Stats.offered_calls;
                amount = Stats[which + '_sla'];
                Stats[which + '_perc'] = ((Stats.abandoned_calls * 100) / Stats.offered_calls).toFixed(1);
            }
            else {
                total = Stats[which + '_calls'];
                amount = Stats[which + '_sla'];
                Stats[which + '_perc'] = ((total * 100) / Stats.offered_calls).toFixed(1);
            }


            var result = (amount * 100) / total;
            return isNaN(result) ? 100 : result.toFixed(1);
        },
        determineColor : function (amount, target, lesser) {
            var color = '';

            if (lesser){
                if (amount > target) {
                    color = 'red'
                }
                else {
                    if (amount >= (target -2)){
                        color = 'orange';
                    }
                    else {
                        color = 'green';
                    }
                }
            }
            else {
                if (amount < target) {
                    color = 'red'
                }
                else {
                    if (amount <= (target -2)){
                        color = 'orange';
                    }
                    else {
                        color = 'green';
                    }
                }
            }

            return color;
        }
    };

    Stats.init({
        socket_address : 'http://170.251.100.90:8080/' + client_name,
        perc_abandoned : parseInt(perc_abandoned, 10),
        perc_answered : parseInt(perc_answered, 10),
        sec_answered : parseInt(sec_answered,10),
        offered_calls_row : $('td#offered-calls'),
        inbound_calls_row : $('td#inbound-calls'),
        failed_calls_row : $('td#failed-calls'),
        abandoned_calls_row : $('td#abandoned-calls'),
        abandoned_sla_row : $('td#abandoned-sla'),
        answered_calls_row : $('td#answered-calls'),
        answered_sla_row : $('td#answered-sla'),
        average_response_time_row : $('td#average-response'),
        sla_abandoned : $('td#sla-abandoned'),
        sla_answered : $('td#sla-answering'),
        kpi_abandoned_row : $('td#kpi-abandoned'),
        $content : $(".content").hide(),
        $open_tab : $('a#open-tab'),
        $tab : $('#tab'),
        $inner_tab : $('#inner_tab'),
        $panel : $('#panel'),
        $from : $('input#from'),
        $to : $('input#to'),
        $datetime : $('button#datetime'),
        $realtime : $('button#realtime'),
        $stats_table : $('table#stats-table').find('tbody')
    });
})(jQuery);