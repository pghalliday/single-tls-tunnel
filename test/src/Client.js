// TODO:
// Should reject unauthorized servers
// Should reject incorrect upgrade response
// Should retry when connections are ended? (could be due to other connection requests blocking)

var expect = require('chai').expect,
    http = require('http'),
    crypto = require('crypto'),
    tls = require('tls'),
    net = require('net'),
    MultiplexStream = require('multiplex-stream'),
    Checklist = require('checklist'),
    fs = require('fs'),
    Client = require('../../src/Client');

var UPSTREAM_PORT = 8080,
    DOWNSTREAM_PORT = 8081,
    SERVER_KEY = fs.readFileSync('./test/keys/server-key.pem'),
    SERVER_CERT = fs.readFileSync('./test/keys/server-cert.pem'),
    CLIENT_KEY = fs.readFileSync('./test/keys/client-key.pem'),
    CLIENT_CERT = fs.readFileSync('./test/keys/client-cert.pem');

var SERVER_OPTIONS = {
  key: SERVER_KEY,
  cert: SERVER_CERT,
  ca: [CLIENT_CERT], 
  requireCert: true,
  rejectUnauthorized: true
};

var CLIENT_UPSTREAM_OPTIONS = {
  port: UPSTREAM_PORT,
  key: CLIENT_KEY,
  cert: CLIENT_CERT,
  ca: [SERVER_CERT],
  rejectUnauthorized: true
};
    
var CLIENT_DOWNSTREAM_OPTIONS = {
  port: DOWNSTREAM_PORT
};
    
describe('Client', function() {
  it('should make an HTTP connection to the server and request an upgrade to TLS', function(done) {
    var client = new Client(CLIENT_UPSTREAM_OPTIONS, CLIENT_DOWNSTREAM_OPTIONS);
    var checklist = new Checklist([
      'upgraded',
      'closed'
    ], done);

    var server = http.createServer();
    server.on('upgrade', function(req, socket, head) {
      socket.on('end', function() {
        socket.destroy();
      });
      socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                   'Upgrade: websocket\r\n' +
                   'Connection: Upgrade\r\n' +
                   '\r\n');
                   
      var securePair = tls.createSecurePair(
        crypto.createCredentials({
         key: SERVER_OPTIONS.key,
         cert: SERVER_OPTIONS.cert,
         ca: SERVER_OPTIONS.ca
        }),
        true,
        SERVER_OPTIONS.requireCert,
        SERVER_OPTIONS.rejectUnauthorized
      );
      var connection = securePair.cleartext,
          encrypted = securePair.encrypted;

      socket.pipe(encrypted).pipe(socket);

      securePair.on('secure', function() {
        checklist.check('upgraded');
      });
    });

    server.listen(UPSTREAM_PORT, function() {
      client.connect(function() {
        client.on('end', function() {
          server.close(function() {
            checklist.check('closed');
          });    
        });
        client.end();
      });
    });
  });
  
  it('should emit an error when connection fails', function(done) {
    var client = new Client(CLIENT_UPSTREAM_OPTIONS);
    client.connect();
    client.on('error', function(error) {
      expect(error.toString()).to.equal('Error: connect ECONNREFUSED');
      done();
    });
  });
  
  it('should forward muliplexed streams from the upstream server to the downstream server', function(done) {
    var client = new Client(CLIENT_UPSTREAM_OPTIONS, CLIENT_DOWNSTREAM_OPTIONS);
    var checklist = new Checklist([
      'connection',
      'Hello, downstream',
      'Hello, upstream',
      'end',
      'closed'
    ], done);

    var upstreamServer = http.createServer();
    upstreamServer.on('upgrade', function(req, socket, head) {
      socket.on('end', function() {
        socket.destroy();
      });
      socket.write('HTTP/1.1 200\r\n' +
                   'Upgrade: TLS\r\n' +
                   'Connection: Upgrade\r\n' +
                   '\r\n');
                   
      var securePair = tls.createSecurePair(
        crypto.createCredentials({
         key: SERVER_OPTIONS.key,
         cert: SERVER_OPTIONS.cert,
         ca: SERVER_OPTIONS.ca
        }),
        true,
        SERVER_OPTIONS.requireCert,
        SERVER_OPTIONS.rejectUnauthorized
      );
      var connection = securePair.cleartext,
          encrypted = securePair.encrypted;

      socket.pipe(encrypted).pipe(socket);

      securePair.on('secure', function() {
        var multiplexStream = new MultiplexStream();
        connection.pipe(multiplexStream).pipe(connection);
        var multiplexedConnection = multiplexStream.connect(function() {
          multiplexedConnection.setEncoding();
          multiplexedConnection.on('data', function(data) {
            checklist.check(data);
          });
          multiplexedConnection.on('end', function() {
            checklist.check('end');
            connection.end();
          });
          multiplexedConnection.write('Hello, downstream');
        });
      });
    });

    var downstreamServer = net.createServer(function(connection) {
      checklist.check('connection');
      connection.setEncoding();
      connection.on('data', function(data) {
        checklist.check(data);
        connection.end('Hello, upstream');
      });
    });

    upstreamServer.listen(UPSTREAM_PORT, function() {
      downstreamServer.listen(DOWNSTREAM_PORT, function() {
        client.connect(function() {
          client.on('end', function() {
            downstreamServer.close(function() {
              upstreamServer.close(function() {
                checklist.check('closed');
              });
            });
          });
        });
      });
    });
  });
  
  // TODO: would be better if the error could be
  // propagated, perhaps by having the upstream
  // connection emit an error instead of just being
  // ended
  it('should end muliplexed streams from the upstream server on errors connecting to the downstream server', function(done) {
    var client = new Client(CLIENT_UPSTREAM_OPTIONS, CLIENT_DOWNSTREAM_OPTIONS);
    var checklist = new Checklist([
      'end',
      'closed'
    ], done);
    var upstreamServer = http.createServer();
    upstreamServer.on('upgrade', function(req, socket, head) {
      socket.on('end', function() {
        socket.destroy();
      });
      socket.write('HTTP/1.1 200\r\n' +
                   'Upgrade: TLS\r\n' +
                   'Connection: Upgrade\r\n' +
                   '\r\n');
                   
      var securePair = tls.createSecurePair(
        crypto.createCredentials({
         key: SERVER_OPTIONS.key,
         cert: SERVER_OPTIONS.cert,
         ca: SERVER_OPTIONS.ca
        }),
        true,
        SERVER_OPTIONS.requireCert,
        SERVER_OPTIONS.rejectUnauthorized
      );
      var connection = securePair.cleartext,
          encrypted = securePair.encrypted;

      socket.pipe(encrypted).pipe(socket);

      securePair.on('secure', function() {
        var multiplexStream = new MultiplexStream();
        connection.pipe(multiplexStream);
        multiplexStream.pipe(connection);
        var multiplexedConnection = multiplexStream.connect(function() {
          multiplexedConnection.on('end', function() {
            checklist.check('end');
            connection.end();
          });
          multiplexedConnection.write('Hello, downstream');
        });
      });
    });
    upstreamServer.listen(UPSTREAM_PORT, function() {
      client.connect(function() {
        client.on('end', function() {
          upstreamServer.close(function() {
            checklist.check('closed');
          });
        });
      });
    });
  });
});
