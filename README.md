single-tls-tunnel
=========

A single port TLS tunnel implementation to support a single downstream client proxy

## Features

- should tunnel raw socket traffic
- should tunnel HTTP traffic
- should tunnel TLS traffic
- should tunnel HTTPS traffic

## Installation

```
npm install single-tls-tunnel
```

## API

To instantiate a server and start listening for a client connection

```javascript
var Server = require('single-tls-tunnel').Server;

var server = new Server({
  key: SERVER_KEY,
  cert: SERVER_CERT,
  ca: [CLIENT_CERT], 
  requireCert: true,
  rejectUnauthorized: true  
});

server.listen(PUBLIC_PORT, function() {
  // Server is now listening
});
```

To instantiate a client and connect to the server

```javascript
var Client = require('single-tls-tunnel').Client;

var client = new Client({
  host: PUBLIC_HOST,
  port: PUBLIC_PORT,
  key: CLIENT_KEY,
  cert: CLIENT_CERT,
  ca: [SERVER_CERT],
  rejectUnauthorized: true
}, {
  host: PRIVATE_HOST,
  port: PRIVATE_PORT
});

client.connect(function() {
  // Client is now connected
});
```

From now on, any connection made to PUBLIC_HOST:PUBLIC_PORT will be forwarded to PRIVATE_HOST:PRIVATE_PORT

## Hints on generating certs for testing

See the ``test/keys`` folder for certificates used by the tests. These can be regenerated at anytime using either ``keys.sh`` (OSX, Linux) or ``keys.bat`` (Windows). These scripts use [OpenSSL](http://www.openssl.org). OSX and Linux most likely already ship with OpenSSL. If using Windows you will need to install [OpenSSL](http://slproweb.com/products/Win32OpenSSL.html) first.

It should be noted that for the client to authorize server certificates they need to have the correct hosts listed as altnames in the v3 extensions (although this doesn't seem to be required on Windows).

## Roadmap

- should use HTTP for intial client connection and upgrade the socket to a TLS connection

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using ``./grunt.sh`` or ``.\grunt.bat``.

## Release History
_(Nothing yet)_

## License
Copyright (c) 2012 Peter Halliday  
Licensed under the MIT license.