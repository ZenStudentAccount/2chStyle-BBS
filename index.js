'use strict';

const http = require('node:http');
const auth = require('http-auth');
const path = require('node:path');
const router = require('./lib/router');

const basic = auth.basic({
  realm: 'Enter username and password.',
  data: process.env.HTPASSWD_DATA || require('node:fs').readFileSync(path.join(__dirname, 'users.htpasswd'), 'utf8')
});

const server = http.createServer(basic.check((req, res) => {
  router.route(req, res);
})).on('error', (e) => {
  console.error('Server Error', e);
}).on('clientError', (e) => {
  console.error('Client Error', e);
});

const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.info(`Listening on ${port}`);
});
