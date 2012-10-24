var expect = require('chai').expect,
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
  it('should make a TLS connection to the server', function(done) {
    var client = new Client(CLIENT_UPSTREAM_OPTIONS, CLIENT_DOWNSTREAM_OPTIONS);
    var checklist = new Checklist([
      'connection',
      'end',
      'closed'
    ], done);
    var server = tls.createServer(SERVER_OPTIONS, function(connection) {
      checklist.check('connection');
      connection.on('end', function() {
        checklist.check('end');
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
    var upstreamServer = tls.createServer(SERVER_OPTIONS, function(connection) {
      var multiplexStream = new MultiplexStream();
      connection.pipe(multiplexStream);
      multiplexStream.pipe(connection);
      var multiplexedConnection = multiplexStream.createStream();
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
    var upstreamServer = tls.createServer(SERVER_OPTIONS, function(connection) {
      var multiplexStream = new MultiplexStream();
      connection.pipe(multiplexStream);
      multiplexStream.pipe(connection);
      var multiplexedConnection = multiplexStream.createStream();
      multiplexedConnection.on('end', function() {
        checklist.check('end');
        connection.end();
      });
      multiplexedConnection.write('Hello, downstream');
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
