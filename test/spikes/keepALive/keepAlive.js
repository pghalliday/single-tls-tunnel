var net = require('net'),
    spawn = require('child_process').spawn;
var server = net.createServer({
  allowHalfOpen: true
}, function(connection) {
  //connection.setKeepAlive(true);
  connection.on('close', function() {
    console.log('server close');
    connection.end();
  });
  connection.on('end', function() {
    console.log('server end');
    connection.end();
  });
  connection.on('timeout', function() {
    console.log('server timeout');
    connection.end();
  });
  //connection.setTimeout(500);
});
server.listen(8080, function() {
  var child = spawn('node', ['./client.js'], {
    cwd: __dirname,
    stdio: 'pipe',
    detached: false
  });
  child.stdout.pipe(process.stdout).pipe(child.stdout);
  child.stderr.pipe(process.stderr).pipe(child.stderr);
});
