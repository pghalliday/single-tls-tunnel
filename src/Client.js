var tls = require('tls'),
    util = require('util'),
    MultiplexStream = require('multiplex-stream'),
    net = require('net'),
    Valve = require('pipette').Valve,
    EventEmitter = require('events').EventEmitter;

function Client(upstreamOptions, downstreamOptions) {
  var self = this,
      connection;
  
  self.connect = function(callback) {
    connection = tls.connect(upstreamOptions, function() {
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
      connection.pipe(multiplexStream);
      multiplexStream.pipe(connection);
      if (callback) {
        self.on('connect', callback);
      }
      self.emit('connect');
    });
    connection.on('error', function(error) {
      self.emit('error', error);
    });
    connection.on('end', function() {
      self.emit('end');
    });
  };
  
  self.end = function() {
    connection.end();
  };
}
util.inherits(Client, EventEmitter);

module.exports = Client;