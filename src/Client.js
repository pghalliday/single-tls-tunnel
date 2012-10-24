var tls = require('tls');

function Client(options) {
  var self = this,
      connection;
  
  self.connect = function(callback) {
    connection = tls.connect(options, function() {
      callback();
    });
  };
  
  self.disconnect = function(callback) {
    connection.on('end', function() {
      callback();
    });
    connection.end();
  };
}

module.exports = Client;