var app = require('express').createServer()
  , io = require('socket.io').listen(app);
app.listen(8080);
var llamadas = [];

app.use("/assets", express.static(__dirname + '/assets'));
/*Rutas*/
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});
app.get('/encola/:clid/:did/:cola/:uniqueid', function(req, res){
    console.log('Ha entrado una en cola');
    llamada = {
        id: req.params.uniqueid,
        origen: req.params.clid,
        destino: req.params.did,
        cola: req.params.cola,
        inicio: new Date
    };
    io.sockets.emit('encola', llamada);
    
    llamadas.push(llamada);
    res.send('ok');
});
app.get('/respondida/:uniqueid/:extension', function(req, res){
    console.log('Sale una de la cola');
    io.sockets.emit('respondida', {
        id: req.params.uniqueid,
        extension: req.params.extension
    });
    deleteFromArray(llamadas,req.params.uniqueid);
    res.send('ok');
});
function deleteFromArray(my_array, element) {
    position = my_array.indexOf(element);
    my_array.splice(position, 1);
}
io.disable('heartbeats');
io.sockets.on('connection', function (socket) {
    /* Si llega alguien nuevo, le mandamos el estado actual de llamadas y agentes */
    if (llamadas.length > 0){
        io.sockets.socket(socket.id).emit('llamadas', llamadas);
    }
});