var expect = require('chai').expect,
    net = require('net'),
    http = require('http'),
    tls = require('tls'),
    https = require('https'),
    fs = require('fs'),
    Checklist = require('checklist'),
    Server = require('../../').Server,
    Client = require('../../').Client;

var UPSTREAM_PORT = 8080,
    DOWNSTREAM_PORT = 8081,
    SERVER_KEY = fs.readFileSync('./test/keys/server-key.pem'),
    SERVER_CERT = fs.readFileSync('./test/keys/server-cert.pem'),
    CLIENT_KEY = fs.readFileSync('./test/keys/client-key.pem'),
    CLIENT_CERT = fs.readFileSync('./test/keys/client-cert.pem'),
    DOWNSTREAM_SERVER_KEY = fs.readFileSync('./test/keys/downstream-server-key.pem'),
    DOWNSTREAM_SERVER_CERT = fs.readFileSync('./test/keys/downstream-server-cert.pem'),
    UPSTREAM_CLIENT_KEY = fs.readFileSync('./test/keys/upstream-client-key.pem'),
    UPSTREAM_CLIENT_CERT = fs.readFileSync('./test/keys/upstream-client-cert.pem');

var DOWNSTREAM_SERVER_OPTIONS = {
  key: DOWNSTREAM_SERVER_KEY,
  cert: DOWNSTREAM_SERVER_CERT,
  ca: [UPSTREAM_CLIENT_CERT], 
  requireCert: true,
  rejectUnauthorized: true
};

var UPSTREAM_CLIENT_OPTIONS = {
  port: UPSTREAM_PORT,
  key: UPSTREAM_CLIENT_KEY,
  cert: UPSTREAM_CLIENT_CERT,
  ca: [DOWNSTREAM_SERVER_CERT],
  rejectUnauthorized: true
};

var UPSTREAM_HTTPS_OPTIONS = {
  port: UPSTREAM_PORT,
  path: '/',
  method: 'GET',
  key: UPSTREAM_CLIENT_KEY,
  cert: UPSTREAM_CLIENT_CERT,
  ca: [DOWNSTREAM_SERVER_CERT],
  rejectUnauthorized: true
};

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

describe('single-tls-tunnel', function() {
  var server = new Server(SERVER_OPTIONS),
      client = new Client(CLIENT_UPSTREAM_OPTIONS, CLIENT_DOWNSTREAM_OPTIONS);

  before(function(done) {
    server.listen(UPSTREAM_PORT, function() {
      client.connect(done);
    });
  });

  it('should tunnel raw socket traffic', function(done) {
    var checklist = new Checklist([
      'Hello, downstream',
      'Hello, upstream',
      'end downstream',
      'end upstream',
      'downstream closed'
    ], done);

    var netServer = net.createServer(function(downstreamConnection) {
      downstreamConnection.setEncoding();
      downstreamConnection.on('end', function() {
        checklist.check('end downstream');
      });
      downstreamConnection.on('data', function(data) {
        checklist.check(data);
        downstreamConnection.end('Hello, upstream');
      });
    });
    netServer.listen(DOWNSTREAM_PORT, function() {
      var upstreamConnection = net.connect(UPSTREAM_PORT, function() {
        upstreamConnection.setEncoding();
        upstreamConnection.on('end', function() {
          checklist.check('end upstream');
          netServer.close(function() {
            checklist.check('downstream closed');
          });
        });
        upstreamConnection.on('data', function(data) {
          checklist.check(data);
        });
        upstreamConnection.write('Hello, downstream');
      });
    });
  });

  it('should tunnel HTTP traffic', function(done) {
    var httpServer;
    var checklist = new Checklist([
      200,
      'GET 1',
      'Hello, upstream',
      'end upstream 1',
      200,
      'GET 2',
      'Hello, upstream',
      'end upstream 2'
    ], function(error) {      
      if (error) {
        done(error);
      } else {
        httpServer.close(done);
      }
    });

    httpServer = http.createServer(function(request, response) {
      response.end('Hello, upstream');
    });
    httpServer.listen(DOWNSTREAM_PORT, function() {
      http.get('http://localhost:' + UPSTREAM_PORT, function(response) {
        checklist.check(response.statusCode);
        response.setEncoding();
        response.on('data', function(data) {
          checklist.check('GET 1');
          checklist.check(data);
        });
        response.on('end', function() {
          checklist.check('end upstream 1');
        });
      });
      http.get('http://localhost:' + UPSTREAM_PORT, function(response) {
        checklist.check(response.statusCode);
        response.setEncoding();
        response.on('data', function(data) {
          checklist.check('GET 2');
          checklist.check(data);
        });
        response.on('end', function() {
          checklist.check('end upstream 2');
        });
      });
    });
  });

  it('should tunnel TLS traffic', function(done) {
    var checklist = new Checklist([
      'Hello, downstream',
      'Hello, upstream',
      'end downstream',
      'end upstream',
      'downstream closed'
    ], done);

    var tlsServer = tls.createServer(DOWNSTREAM_SERVER_OPTIONS, function(downstreamConnection) {
      downstreamConnection.setEncoding();
      downstreamConnection.on('end', function() {
        checklist.check('end downstream');
      });
      downstreamConnection.on('data', function(data) {
        checklist.check(data);
        downstreamConnection.end('Hello, upstream');
      });
    });
    tlsServer.listen(DOWNSTREAM_PORT, function() {
      var upstreamConnection = tls.connect(UPSTREAM_CLIENT_OPTIONS, function() {
        upstreamConnection.setEncoding();
        upstreamConnection.on('end', function() {
          checklist.check('end upstream');
          tlsServer.close(function() {
            checklist.check('downstream closed');
          });
        });
        upstreamConnection.on('data', function(data) {
          checklist.check(data);
        });
        upstreamConnection.write('Hello, downstream');
      });
    });
  });

  it('should tunnel HTTPS traffic', function(done) {
    var httpsServer;
    var checklist = new Checklist([
      200,
      'GET 1',
      'Hello, upstream',
      'end upstream 1',
      200,
      'GET 2',
      'Hello, upstream',
      'end upstream 2'
    ], function(error) {      
      if (error) {
        done(error);
      } else {
        httpsServer.close(done);
      }
    });

    httpsServer = https.createServer(DOWNSTREAM_SERVER_OPTIONS, function(request, response) {
      response.end('Hello, upstream');
    });
    httpsServer.listen(DOWNSTREAM_PORT, function() {
      https.get(UPSTREAM_HTTPS_OPTIONS, function(response) {
        checklist.check(response.statusCode);
        response.setEncoding();
        response.on('data', function(data) {
          checklist.check('GET 1');
          checklist.check(data);
        });
        response.on('end', function() {
          checklist.check('end upstream 1');
        });
      });
      https.get(UPSTREAM_HTTPS_OPTIONS, function(response) {
        checklist.check(response.statusCode);
        response.setEncoding();
        response.on('data', function(data) {
          checklist.check('GET 2');
          checklist.check(data);
        });
        response.on('end', function() {
          checklist.check('end upstream 2');
        });
      });
    });
  });

  after(function(done) {
    client.on('end', function() {
      server.close(done);
    });
    client.end();
  });
});