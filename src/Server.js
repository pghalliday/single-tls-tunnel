var http = require('http'),
    tls = require('tls'),
    crypto = require('crypto'),
    net = require('net'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    MultiplexStream = require('multiplex-stream');

function Server(options) {
  var self = this,
      multiplex,
      clientConnected = false,
      server = net.createServer();

  function onSubsequentConnection(connection) {
    if (clientConnected) {
      var tunnel = multiplex.createStream();
      connection.pipe(tunnel).pipe(connection);
    } else {
      // not ready, just end the connection it can retry later if it wants
      connection.end();
    }
  }  

  function onFirstConnection(connection) {
    // start listening for connections
    server.on('connection', onSubsequentConnection);
    
    // reject connections until client server connection has been secured
    clientConnected = false;

    connection.on('end', function() {
      // destroy the socket when it ends, otherwise it will block the server from closing
      //socket.destroy();
      
      // stop listening for connections
      server.removeListener('connection', onSubsequentConnection);
      
      // listen for the next upgrade request from a client
      server.once('connection', onFirstConnection);
    });

    connection.once('data', function(data) {
      // TODO: validate that upgrade request data
         
      connection.write('HTTP/1.1 200\r\n' +
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
        // ready now
        clientConnected = true;
      });    
      connection.pipe(securePair.encrypted).pipe(connection);
    });
  }
  
  // start by listening for an upgrade request from a client
  server.once('connection', onFirstConnection);
    
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