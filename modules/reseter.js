/**
 * This function Resets stats for all stuff.
 *
 * @param app that holds the objects /modules/app.js
 */
module.exports = function Reseter(app){
    /**
     * This starts all reset processes
     */
    this.reset = function(){
        this.resetClients();
    };
    /**
     * This resets client's stats.
     */
    this.resetClients = function(){
        for (var i = 0, length = app.clients.length; i < length; i++){
            app.clients[i].resetData();
        }
    };
};