var MockClient = require('./MockCLient'),
    fs = require('fs');

var PORT = process.argv[2],
    SERVER_CERT = fs.readFileSync('./test/keys/server-cert.pem'),
    CLIENT_KEY = fs.readFileSync('./test/keys/client-key.pem'),
    CLIENT_CERT = fs.readFileSync('./test/keys/client-cert.pem');

var CLIENT_OPTIONS = {
  port: PORT,
  key: CLIENT_KEY,
  cert: CLIENT_CERT,
  ca: [SERVER_CERT],
  rejectUnauthorized: true
};

var client = new MockClient(CLIENT_OPTIONS);
client.connect(function() {
  process.exit(0);
});
