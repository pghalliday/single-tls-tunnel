var tls = require('tls'),
    crypto = require('crypto'),
    net = require('net'),
    http = require('http'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    MultiplexStream = require('multiplex-stream');

function Server(options) {
  var self = this,
      multiplex,
      server = net.createServer();

  function onConnectionAfterClientAuthenticated(connection) {
    var tunnel = multiplex.createStream();
    connection.pipe(tunnel).pipe(connection);
  }  
      
  var httpServer = http.createServer(function(request, response) {
    response.end('Waiting for a client');
  });

  httpServer.on('upgrade', function(request, socket, head) {
    socket.write('HTTP/1.1 200\r\n' +
                     'Upgrade: TLS\r\n' +
                     'Connection: Upgrade\r\n' +
                     '\r\n');

    var securePair = tls.createSecurePair(
     crypto.createCredentials({
       key: options.key,
       cert: options.cert,
       ca: options.ca
     }),
     true,
     options.requireCert,
     options.rejectUnauthorized
    );
    securePair.on('secure', function() {
      multiplex = new MultiplexStream();
      multiplex.pipe(securePair.cleartext).pipe(multiplex);
      
      server.removeListener('connection', onConnectionWhileWaitingForClient);
      server.on('connection', onConnectionAfterClientAuthenticated);  
      socket.on('end', function() {
        server.removeListener('connection', onConnectionAfterClientAuthenticated);
        server.on('connection', onConnectionWhileWaitingForClient);
      });
    });    
    socket.pipe(securePair.encrypted).pipe(socket);    
  });

  function onConnectionWhileWaitingForClient(connection) {
    httpServer.emit('connection', connection);
  }
  server.on('connection', onConnectionWhileWaitingForClient);
    
  self.listen = function(port, callback) {
    if (callback) {
      self.once('listening', callback);
    }
    server.on('listening', function() {
      self.emit('listening');
    });
    server.on('error', function(error) {
      self.emit('error', error);
    });
    server.listen(port);
  };
  
  self.close = function(callback) {
    if (callback) {
      self.once('close', callback);
    }
    server.on('close', function() {
      self.emit('close');
    });
    server.close();
  };
}
util.inherits(Server, EventEmitter);

module.exports = Server;