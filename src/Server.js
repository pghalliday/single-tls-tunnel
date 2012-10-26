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
      server = http.createServer();

  function onConnection(connection) {
    console.log('connection');
    if (clientConnected) {
      console.log('ready');
      var tunnel = multiplex.createStream();
      connection.emit('data',
                      'HTTP/1.1\r\n' +
                      '\r\n');
      connection.pipe(tunnel).pipe(connection);
      // TODO: How do I prevent the connection ending on it's own?
    } else {
      // not ready, just end the connection it can retry later if it wants
      connection.end();
    }
  }  

  function onUpgrade(request, socket, head) {    
    // start listening for connections
    server.on('connection', onConnection);
    
    // reject connections until client server connection has been secured
    clientConnected = false;

    socket.on('end', function() {
      // destroy the socket when it ends, otherwise it will block the server from closing
      socket.destroy();
      
      // stop listening for connections
      server.removeListener('connection', onConnection);
      
      // listen for the next upgrade request from a client
      server.once('upgrade', onUpgrade);
    });

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
      // ready now
      console.log('server secure');
      clientConnected = true;
    });    
    socket.pipe(securePair.encrypted).pipe(socket);
  }
  
  // start by listening for an upgrade request from a client
  server.once('upgrade', onUpgrade);
    
  self.listen = function(port, callback) {
    if (callback) {
      self.on('listening', callback);
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
      self.on('close', callback);
    }
    server.on('close', function() {
      self.emit('close');
    });
    server.close();
  };
}
util.inherits(Server, EventEmitter);

module.exports = Server;