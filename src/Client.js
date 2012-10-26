var http = require('http'),
    crypto = require('crypto'),
    tls = require('tls'),
    util = require('util'),
    MultiplexStream = require('multiplex-stream'),
    net = require('net'),
    Valve = require('pipette').Valve,
    EventEmitter = require('events').EventEmitter;

function Client(upstreamOptions, downstreamOptions) {
  var self = this,
      connection;
  
  self.connect = function(callback) {
    var options = {
      port: upstreamOptions.port,
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'TLS'
      }
    };

    var request = http.request(options);
    request.on('error', function(error) {
      self.emit('error', error);
    });
    request.end();

    request.on('upgrade', function(res, socket, upgradeHead) {
      console.log('upgrade');

      connection = socket;
      connection.on('error', function(error) {
        self.emit('error', error);
      });
      connection.on('end', function() {
        self.emit('end');
      });

      var securePair = tls.createSecurePair(
       crypto.createCredentials({
         key: upstreamOptions.key,
         cert: upstreamOptions.cert,
         ca: upstreamOptions.ca
       }),
       false,
       true, // TODO: check what effect requireCert might have on a client connection (it's not a valid parameter for tls.connect so probably ignored here)
       upstreamOptions.rejectUnauthorized
      );
      var cleartext = securePair.cleartext;
      var encrypted = securePair.encrypted;

      connection.pipe(encrypted).pipe(connection);

      var multiplexStream = new MultiplexStream(function(upstreamConnection) {
        var valve = new Valve(upstreamConnection, {paused: true});
        var downstreamConnection = net.connect(downstreamOptions, function() {
          valve.pipe(downstreamConnection);
          downstreamConnection.pipe(upstreamConnection);
          valve.resume();
        });
        downstreamConnection.on('error', function(error) {
          upstreamConnection.end();
        });
      });

      cleartext.pipe(multiplexStream).pipe(cleartext);

      if (callback) {
        self.on('connect', callback);
      }
      self.emit('connect');
    });
  };
  
  self.end = function() {
    connection.end();
  };
}
util.inherits(Client, EventEmitter);

module.exports = Client;