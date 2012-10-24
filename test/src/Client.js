var expect = require('chai').expect,
    Client = require('../../src/Client');
    
describe('Client', function() {
  it('should construct', function(done) {
    var client = new Client();
    done();
  });
});
