/**
 * load-test-helpers.js - Artillery processor helpers
 * Provides shared functions for load test scenarios.
 * 
 * Reference: https://www.artillery.io/docs/reference/engines/http#processor
 */

/**
 * Before-scenario hook that fetches a JWT token for a test user.
 * Sets `vars.testToken` for authenticated scenarios.
 */
function getTestUserToken(reqContext, events, done) {
  const http = require('http');
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  // Try to register a test user, then login
  const postData = JSON.stringify({
    email: 'loadtest_persistent@test.movieanimation.ai',
    password: 'TestPass123!',
  });

  const url = new URL('/api/auth/login', baseUrl);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.tokens && parsed.tokens.accessToken) {
          reqContext.vars.testToken = parsed.tokens.accessToken;
        } else {
          // Fallback: use empty token (requests will get 401)
          reqContext.vars.testToken = '';
        }
      } catch (e) {
        reqContext.vars.testToken = '';
      }
      return done();
    });
  });

  req.on('error', (e) => {
    console.error(`[load-test-helper] Auth request failed: ${e.message}`);
    reqContext.vars.testToken = '';
    return done();
  });

  req.write(postData);
  req.end();
}

module.exports = {
  getTestUserToken,
};
