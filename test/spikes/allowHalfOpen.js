var net = require('net');

var server = net.createServer({
  allowHalfOpen: true
}, function(connection) {
  connection.on('end', function() {
    connection.setTimeout(5000, function() {
      connection.end();
    });
    console.log('end');
  });
  connection.on('close', function() {
    console.log('close');
  })
});
server.listen(8080, function() {
  var connection = net.connect({
    port: 8080
  }, function() {
    connection.on('end', function() {
      server.close(function() {
        console.log('finished');
      });
    });
    connection.end();
  });
});