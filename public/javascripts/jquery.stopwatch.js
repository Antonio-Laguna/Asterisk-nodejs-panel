(function( $ ){

    function incrementer(ct, increment) {
        return function() { ct+=increment; return ct; };
    }
    
    function pad2(number) {
         return (number < 10 ? '0' : '') + number;
    }
    
    function formatMilliseconds(millis, format) {
        var x, seconds, minutes, hours, days, result;
        switch (format){
            case 'dd:hh:mm:ss':{
                x = millis / 1000;
                seconds = Math.floor(x % 60);
                x /= 60;
                minutes = Math.floor(x % 60);
                x /= 60;
                hours = Math.floor(x % 24);
                x /= 24;
                days = Math.floor(x);
                result = [pad2(days), pad2(hours), pad2(minutes), pad2(seconds)].join(':');
                break;
            }
            case 'hh:mm:ss': {
                x = millis / 1000;
                seconds = Math.floor(x % 60);
                x /= 60;
                minutes = Math.floor(x % 60);
                x /= 60;
                hours = Math.floor(x);
                result =  [pad2(hours), pad2(minutes), pad2(seconds)].join(':');
                break;
            }
            case 'mm:ss': {
                x = millis / 1000;
                seconds = Math.floor(x % 60);
                x /= 60;
                minutes = Math.floor(x);
                result =  [pad2(minutes), pad2(seconds)].join(':');
                break;
            }
            case 'ss': {
                x = millis / 1000;
                seconds = Math.floor(x);
                result =  pad2(seconds);
                break;
            }
        }
        return result;
    }
    
    var methods = {
        
        init: function(options) {
            var settings = {
                updateInterval: 1000, 
                startTime: 0, 
                timeFormat: 'hh:mm:ss',
                formatter: formatMilliseconds,
                doSomethingAt : {
                    firer: null,
                    action: function(a){}
                }
            };
            
            if (options) { $.extend(settings, options); }
            
            return this.each(function() {
                var $this = $(this),
                    data = $this.data('stopwatch');
                
                // If the plugin hasn't been initialized yet
                if (!data) {
                    // Setup the stopwatch data
                    data = settings;
                    data.target = $this;
                    data.elapsed = settings.startTime;
                    data.timeFormat = settings.timeFormat;
                    // create counter
                    data.incrementer = incrementer(data.startTime, data.updateInterval);
                    data.doSomethingAt = settings.doSomethingAt;
                    data.tick_function = function() {
                        var millis = data.incrementer();
                        data.elapsed = millis;
                        if (data.doSomethingAt.firer && millis === data.doSomethingAt.firer){ // If it's not falsy
                            data.doSomethingAt.action($this);
                        }
                        data.target.trigger('tick.stopwatch', [millis]);
                        data.target.stopwatch('render');
                    };
                    $this.data('stopwatch', data);
                }
                
            });
        },
        
        start: function() {
            return this.each(function() {
                var $this = $(this),
                    data = $this.data('stopwatch');
                // Mark as active
                data.active = true;
                data.timerID = setInterval(data.tick_function, data.updateInterval)
                $this.data('stopwatch', data);
            });
        },
        
        stop: function() {
            return this.each(function() {
                var $this = $(this),
                    data = $this.data('stopwatch');
                clearInterval(data.timerID);
                data.active = false;
                $this.data('stopwatch', data);
            });
        },

        destroy: function() {
            return this.each(function(){
                var $this = $(this),
                    data = $this.data('stopwatch');
                $this.stopwatch('stop').unbind('.stopwatch').removeData('stopwatch');                
            })
        },
        
        render: function() {
            var $this = $(this),
                data = $this.data('stopwatch');
            $this.html(data.formatter(data.elapsed,data.timeFormat));
        },

        getTime: function() {
            var $this = $(this),
                data = $this.data('stopwatch');
            return (data.elapsed);
        },

        toggle: function() {
            return this.each(function() {
                var $this = $(this);
                var data = $this.data('stopwatch');
                if (data.active) {
                    $this.stopwatch('stop');
                } else {
                    $this.stopwatch('start');
                }
            });
        }, 
        
        reset: function() {
            return this.each(function() {
                var $this = $(this);
                    data = $this.data('stopwatch');
                data.incrementer = incrementer(data.startTime, data.updateInterval);
                data.elapsed = data.startTime;
                $this.data('stopwatch', data);
            });
        }
    };
    
    
    // Define the function
    $.fn.stopwatch = function( method ) {
        if (methods[method]) {
            return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
        } else if (typeof method === 'object' || !method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error( 'Method ' +  method + ' does not exist on jQuery.stopwatch' );
        } 
    };

})( jQuery );