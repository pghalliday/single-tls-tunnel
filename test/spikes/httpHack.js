var net = require('net'),
    http = require('http');
    
var httpServer = http.createServer(function(request, response) {
  response.end('Hello, world!');
});

var netServer = net.createServer(function(socket) {
  httpServer.emit('connection', socket);
});

netServer.listen(8080, function() {
  http.get('http://localhost:8080', function(response) {
    console.log(response.statusCode);
    response.setEncoding();
    response.on('data', function(data) {
      console.log(data);
    });
    response.on('end', function() {
      console.log('end');
      netServer.close(function() {
        console.log('close');
      });
    });
  });
});

