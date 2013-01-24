/**
 * Module that encapsulates the mysql module
 */
mysql = require('mysql');

/**
 * Function that reconnects on connection lost by binding a function that fires up on error
 *
 * @param connection
 * @url https://github.com/felixge/node-mysql/issues/239
 */
function handleDisconnect(connection) {
  connection.on('error', function(err) {
    if (!err.fatal) {
      return;
    }

    if (err.code !== 'PROTOCOL_CONNECTION_LOST') {
      throw err;
    }

    console.log('Re-connecting lost connection: ' + err.stack);

    connection = mysql.createConnection(connection.config);
    handleDisconnect(connection);
    connection.connect();
  });
}

var mysql_conf = {
    host: 'HOST_IP',
    user: 'HOST_USER',
    password: 'HOST_PASS',
    database: 'HOST_DB'
};
var client =  mysql.createConnection(mysql_conf);

handleDisconnect(client);

module.exports.client = client;
/**
 * Function that will perform a Query to the database
 *
 * @param query to perform
 * @param callback to call when data is ready.
 */
module.exports.doQuery = function(query , callback){
    console.log ('Executing MySQL Query >> %s', query);
    client.query(query,
        function (err, results, fields){
            if (err)
            {
                throw err;
            }
            callback(results);
        }
    );
};