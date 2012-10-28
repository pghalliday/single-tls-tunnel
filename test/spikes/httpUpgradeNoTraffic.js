var http = require('http'),
    tls = require('tls'),
    fs = require('fs'),
    crypto = require('crypto');

var PORT = 8080,
    SERVER_KEY = fs.readFileSync('./test/keys/server-key.pem'),
    SERVER_CERT = fs.readFileSync('./test/keys/server-cert.pem'),
    CLIENT_KEY = fs.readFileSync('./test/keys/client-key.pem'),
    CLIENT_CERT = fs.readFileSync('./test/keys/client-cert.pem');

var server = http.createServer();
server.on('upgrade', function(req, socket, head) {
  socket.on('end', function() {
    console.log('server socket ended');
    // Have to end the socket here too as HTTP servers allow sockets to be half open
    socket.end();
  });

  socket.write('HTTP/1.1 200\r\n' +
               'Upgrade: TLS\r\n' +
               'Connection: Upgrade\r\n' +
               '\r\n');
               
  var securePair = tls.createSecurePair(
    crypto.createCredentials({
     key: SERVER_KEY,
     cert: SERVER_CERT,
     ca: [CLIENT_CERT]
    }),
    true,
    true,
    true
  );

  socket.pipe(securePair.encrypted).pipe(socket);
});

server.listen(PORT, function() {
  var options = {
    port: PORT,
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'TLS'
    }
  };

  var request = http.request(options);
  request.on('upgrade', function(res, socket, upgradeHead) {
    var securePair = tls.createSecurePair(
     crypto.createCredentials({
       key: CLIENT_KEY,
       cert: CLIENT_CERT,
       ca: [SERVER_CERT]
     }),
     false,
     true,
     true
    );

    securePair.cleartext.on('end', function() {
      console.log('client cleartext ended');
      server.close(function() {
        console.log('finished');
      });
    });

    securePair.on('secure', function() {
      securePair.cleartext.end();
    })

    socket.pipe(securePair.encrypted).pipe(socket);
  });
  request.end();
});
