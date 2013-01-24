/**
 * This module encapsulates the execution of commands in bash
 */
module.exports = function Executor() {
    var sys = require('sys'),
        exec = require('child_process').exec;

    /**
     * Private function that just logs the output to console
     *
     * @param error if any
     * @param stdout from execution
     * @param stderr from execution
     */
    function handleOutput ( error , stdout , stderr ) {
        console.log( stdout );
        console.log('End of execution');
    }
    /**
     * This is the only function visible and is in charge of actually, executing the command
     *
     * @param command to execute
     * @param cb callback to call on finish, if no callback is defined @handleOutput will be used instead
     */
    this.execute = function ( command , cb) {
        console.log('Executing "%s" in bash', command);
        exec (command , cb || handleOutput);
    };
};