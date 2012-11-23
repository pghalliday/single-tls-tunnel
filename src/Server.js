var tls = require('tls'),
    crypto = require('crypto'),
    net = require('net'),
    http = require('http'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Valve = require('pipette').Valve,
    MultiplexStream = require('multiplex-stream');

function Server(options) {
  var self = this,
      multiplex, 
      connections = [],
      server = net.createServer({
        allowHalfOpen: true
      }, function(connection) {
        connections.push(connection);
        connection.on('close', function() {
          connections.splice(connections.indexOf(connection), 1);
        });
      });

  function onConnectionAfterClientAuthenticated(connection) {
    // this is required as the server allows connections to be half open
    connection.on('end', function() {
      connection.end();
    });
    var valve = new Valve(connection, {paused: true});
    var tunnel = multiplex.connect(function() {
      valve.pipe(tunnel).pipe(connection);
      valve.resume();
    });
  }  
      
  var httpServer = http.createServer(function(request, response) {
    response.end('Waiting for a client');
  });

  httpServer.on('upgrade', function(request, socket, head) {
    socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                 'Upgrade: websocket\r\n' +
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

      var disconnected = false;
      function disconnect() {
        if (!disconnected) {
          disconnected = true;
          server.removeListener('connection', onConnectionAfterClientAuthenticated);
          server.on('connection', onConnectionWhileWaitingForClient);
          self.emit('disconnected');
        }
      }
      socket.on('close', function() {
        disconnect();
      });
      socket.on('end', function() {
        disconnect();
        socket.end();
      });
      self.emit('connected');
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
    connections.forEach(function(connection) {
      connection.end();
    });
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