module.exports = function Refetcher(app, mysql_client, io) {
    /**
     * This is the function that calls all reseters from different modules
     *
     * @param necessary indicates if the panel should be restarted.
     */
    this.perform = function (){
        var self = this;

        console.log('Starting reload');

        app.init(function(){
            console.log('All done!');
            setTimeout(function(){
                io.sockets.emit('reload', {});
            }, 5000);
        });
    };
};