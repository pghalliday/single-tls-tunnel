var http = require('http'),
    tls = require('tls'),
    fs = require('fs'),
    crypto = require('crypto'),
    net = require('net');

var PORT = 8080,
    SERVER_KEY = fs.readFileSync('./test/keys/server-key.pem'),
    SERVER_CERT = fs.readFileSync('./test/keys/server-cert.pem'),
    CLIENT_KEY = fs.readFileSync('./test/keys/client-key.pem'),
    CLIENT_CERT = fs.readFileSync('./test/keys/client-cert.pem');

var httpServer = http.createServer();

httpServer.on('upgrade', function(req, socket, head) {
  socket.on('end', function() {
    console.log('end server socket');
    socket.end(); // have to end the socket here so the server can be stopped
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
  var cleartext = securePair.cleartext,
      encrypted = securePair.encrypted;

  socket.pipe(encrypted).pipe(socket);
    
  securePair.on('secure', function() {
    console.log('server secure');
  });
    
  cleartext.setEncoding();
  cleartext.on('data', function(data) {
    console.log(data);
    cleartext.write('Hello, client');
  });
});

// now that server is running
httpServer.listen(PORT, function() {

  // make a request
  var options = {
    port: PORT,
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'TLS'
    }
  };

  var req = http.request(options);
  req.end();

  req.on('upgrade', function(res, socket, upgradeHead) {
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
    var cleartext = securePair.cleartext,
        encrypted = securePair.encrypted;

    socket.pipe(encrypted).pipe(socket);

    securePair.on('secure', function() {
      console.log('client secure');
      cleartext.write('Hello, server');
    });

    cleartext.on('end', function() {
      console.log('end client');
      httpServer.close(function() {
        console.log('finished');
      });
    });

    cleartext.setEncoding();
    cleartext.on('data', function(data) {
      console.log(data);
      cleartext.end();
    });
  });
});

