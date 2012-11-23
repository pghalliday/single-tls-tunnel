// TODO:
// Should reject clients that do not request upgrades correctly
// Should reject unauthorized clients
// Should resist denial of service attacks? (more likely, connection retries blocking client negotiation)

var expect = require('chai').expect,
    http = require('http'),
    crypto = require('crypto'),
    tls = require('tls'),
    fs = require('fs'),
    net = require('net'),
    Checklist = require('checklist'),
    MultiplexStream = require('multiplex-stream'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Server = require('../../src/Server'),
    spawn = require('child_process').spawn,
    MockClient = require('../support/MockClient');

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
  rejectUnauthorized: true,
  timeout: 500
};

var CLIENT_OPTIONS = {
  port: PORT,
  key: CLIENT_KEY,
  cert: CLIENT_CERT,
  ca: [SERVER_CERT],
  rejectUnauthorized: true
};

describe('Server', function() {
  it('should initially listen on the given port for HTTP GET requests and reply with a status message', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.listen(PORT, function() {
      http.get('http://localhost:' + PORT, function(response) {
        expect(response.statusCode).to.equal(200);
        response.setEncoding();
        response.on('data', function(data) {
          expect(data).to.equal('Waiting for a client');
        });
        response.on('end', function() {
          server.close(done);
        });
      });
    });
  });
  
  it('should initially listen on the given port for HTTP upgrade requests and upgrade the socket to TLS', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.listen(PORT, function() {
      var client = new MockClient(CLIENT_OPTIONS);
      client.on('end', function() {
        server.close(function() {
          done();
        });
      });
      client.connect(function() {
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
  
  it('should accept a new client after a client disconnects', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.listen(PORT, function() {
      var client1 = new MockClient(CLIENT_OPTIONS);
      client1.on('end', function() {
        var client2 = new MockClient(CLIENT_OPTIONS);
        client2.on('end', function() {
          server.close(function() {
            done();
          });
        });
        client2.connect(function() {
          client2.multiplex.on('connection', function(downstreamConnection) {
            downstreamConnection.setEncoding('utf8');
            downstreamConnection.on('data', function(data) {
              downstreamConnection.end('Hello, upstream');
            });
            downstreamConnection.on('end', function() {
            });
          });
          var upstreamConnection = net.connect({
            port: PORT
          }, function() {
            upstreamConnection.setEncoding('utf8');
            upstreamConnection.on('data', function(data) {
            });
            upstreamConnection.on('end', function() {
              client2.end();
            });
            upstreamConnection.write('Hello, downstream');
          });
        });
      });
      client1.connect(function() {
        client1.multiplex.on('connection', function(downstreamConnection) {
          downstreamConnection.setEncoding('utf8');
          downstreamConnection.on('data', function(data) {
            downstreamConnection.end('Hello, upstream');
          });
          downstreamConnection.on('end', function() {
          });
        });
        var upstreamConnection = net.connect({
          port: PORT
        }, function() {
          upstreamConnection.setEncoding('utf8');
          upstreamConnection.on('data', function(data) {
          });
          upstreamConnection.on('end', function() {
            client1.end();
          });
          upstreamConnection.write('Hello, downstream');
        });
      });
    });
  });

  it('should emit events when clients connect and disconnect', function(done) {
    var checklist = new Checklist([
      'connected',
      'disconnected',
      'closed'
    ], done);
    var server = new Server(SERVER_OPTIONS);
    server.on('connected', function() {
      checklist.check('connected');
    });
    server.on('disconnected', function() {
      checklist.check('disconnected');
    });
    server.listen(PORT, function() {
      var client = new MockClient(CLIENT_OPTIONS);
      client.on('end', function() {
        server.close(function() {
          checklist.check('closed');
        });
      });
      client.connect(function() {
        client.end();
      });
    });
  });

  it('should accept a new client after a client is destroyed', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.on('disconnected', function() {
      var client2 = new MockClient(CLIENT_OPTIONS);
      client2.on('end', function() {
        server.close(function() {
          done();
        });
      });
      client2.connect(function() {
        client2.end();
      });
    });
    server.listen(PORT, function() {
      var client1 = new MockClient(CLIENT_OPTIONS);
      client1.connect(function() {
        client1.destroy();
      });
    });
  });

  it('should accept a new client after a client is killed', function(done) {
    var server = new Server(SERVER_OPTIONS);
    server.on('disconnected', function() {
      var client = new MockClient(CLIENT_OPTIONS);
      client.on('end', function() {
        server.close(function() {
          done();
        });
      });
      client.connect(function() {
        client.end();
      });
    });
    server.listen(PORT, function() {
      var child = spawn('node', ['./test/support/ClientDeath.js', PORT], {
        stdio: 'pipe',
        detached: false
      });
      child.stdout.pipe(process.stdout).pipe(child.stdout);
      child.stderr.pipe(process.stderr).pipe(child.stderr);
    });
  });

  describe('once a client is connected', function() {
    var server = new Server(SERVER_OPTIONS),
        client;
        
    before(function(done) {
      server.listen(PORT, function() {
        client = new MockClient(CLIENT_OPTIONS);
        client.connect(done);
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
        client.multiplex.removeAllListeners('connection');
        done(error);
      });
      client.multiplex.on('connection', function(downstreamConnection) {
        checklist.check('downstream connected');
        downstreamConnection.on('end', function() {
          checklist.check('end downstream');
        });
        downstreamConnection.setEncoding('utf8');
        downstreamConnection.on('data', function(data) {
          checklist.check(data);
          downstreamConnection.removeAllListeners('data');
          downstreamConnection.on('data', function(data) {
            checklist.check(data);
          });
          downstreamConnection.write('Hello, upstream');
        });
      });
      var upstreamConnection = net.connect({
        port: PORT
      }, function() {
        checklist.check('upstream connected');
        upstreamConnection.on('end', function() {
          checklist.check('end upstream');
        });
        upstreamConnection.setEncoding('utf8');
        upstreamConnection.on('data', function(data) {
          checklist.check(data);
          upstreamConnection.end('Goodbye, downstream');
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