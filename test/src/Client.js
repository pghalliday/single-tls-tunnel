var expect = require('chai').expect,
    tls = require('tls'),
    net = require('net'),
    MultiplexStream = require('multiplex-stream'),
    Checklist = require('checklist'),
    fs = require('fs'),
    Client = require('../../src/Client');

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
    
describe('Client', function() {
  it('should make a TLS connection to the server', function(done) {
    var client = new Client(CLIENT_OPTIONS);
    var checklist = new Checklist([
      'connection',
      'end',
      'undefined',
      'undefined',
      'undefined',
      'undefined'
    ], done);
    var server = tls.createServer(SERVER_OPTIONS, function(connection) {
      checklist.check('connection');
      connection.on('end', function() {
        checklist.check('end');
      });
    });
    server.listen(PORT, function(error) {
      checklist.check(typeof error);
      client.connect(function(error) {
        checklist.check(typeof error);
        client.disconnect(function(error) {
          checklist.check(typeof error);
          server.close(function(error) {
            checklist.check(typeof error);
          });    
        });
      });
    });
  });
});
