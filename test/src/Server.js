var expect = require('chai').expect,
    tls = require('tls'),
    fs = require('fs'),
    net = require('net'),
    Checklist = require('checklist'),
    MultiplexStream = require('multiplex-stream'),
    Server = require('../../src/Server');

var PORT = 8080,
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

var CLIENT_OPTIONS = {
  port: PORT,
  key: CLIENT_KEY,
  cert: CLIENT_CERT,
  ca: [SERVER_CERT],
  rejectUnauthorized: true
};

describe('Server', function() {
  it('should initially listen on the given port for TLS connections', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.listen(PORT, function() {
      var client = tls.connect(CLIENT_OPTIONS, function() {
        client.on('end', function() {
          server.close(function() {
            done();
          });
        });
        client.end();
      });
    });
  });

  it('should emit an error if the port is already in use', function(done) {
    var server1 = new Server(SERVER_OPTIONS);
    server1.listen(PORT, function() {
      var server2 = new Server(SERVER_OPTIONS);
      server2.listen(PORT);
      server2.on('error', function(error) {
        expect(error.toString()).to.equal('Error: listen EADDRINUSE');
        server1.close(function() {
          done();
        });
      });
    });
  });
  
  describe('once a client is connected', function() {
    var server = new Server(SERVER_OPTIONS),
        client,
        multiplex;
        
    before(function(done) {
      server.listen(PORT, function() {
        client = tls.connect(CLIENT_OPTIONS, function() {
          multiplex = new MultiplexStream();
          client.pipe(multiplex).pipe(client);
          done();
        });
      });   
    });
    
    it('should listen for any connections on the given port and when connected, create a new multiplexed stream to the client', function(done) {
      var checklist = new Checklist([
        'upstream connected',
        'downstream connected',
        'Hello, downstream',
        'Hello, upstream',
        'Goodbye, downstream',
        'end downstream',
        'end upstream'
      ], function(error) {
        multiplex.removeAllListeners('connection');
        done(error);
      });
      multiplex.on('connection', function(downstreamConnection) {
        checklist.check('downstream connected');
        downstreamConnection.setEncoding('utf8');
        downstreamConnection.on('data', function(data) {
          checklist.check(data);
          downstreamConnection.removeAllListeners('data');
          downstreamConnection.on('data', function(data) {
            checklist.check(data);
          });
          downstreamConnection.write('Hello, upstream');
        });
        downstreamConnection.on('end', function() {
          checklist.check('end downstream');
        });
      });
      var upstreamConnection = net.connect({
        port: PORT
      }, function() {
        checklist.check('upstream connected');
        upstreamConnection.setEncoding('utf8');
        upstreamConnection.on('data', function(data) {
          checklist.check(data);
          upstreamConnection.end('Goodbye, downstream');
        });
        upstreamConnection.on('end', function() {
          checklist.check('end upstream');
        });
        upstreamConnection.write('Hello, downstream');
      });
    });
    
    after(function(done) {
      client.on('end', function() {
        server.close(done);
      });
      client.end();
    });
  });
});