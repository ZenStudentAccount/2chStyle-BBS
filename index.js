'use strict';

const http = require('node:http');
const auth = require('http-auth');
const path = require('node:path');
const router = require('./lib/router');

// 1. 環境変数から複数のユーザー情報を取得（改行 \n で区切って登録される前提）
//    ローカル環境用に、未設定時のデフォルト値としてリクエストの2パターンを入れておきます
const rawCredentials = process.env.HTPASSWD_DATA || 'admin:password\nguest:password';

// 2. 改行で分割して、各行を [ユーザー名, パスワード] の配列の形に変換して Map に格納
const userMap = new Map(
  rawCredentials.split('\n').map(line => {
    const [user, pass] = line.trim().split(':');
    return [user, pass];
  })
);

// 3. 入力されたユーザー名とパスワードが Map 内のデータと一致するか判定
const basic = auth.connect((req, res, next) => {
  const user = auth.username(req);
  
  if (user && userMap.has(user.name) && userMap.get(user.name) === user.pass) {
    next(); // ユーザー名が存在し、かつパスワードが一致したらアクセス許可
  } else {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Enter username and password."' });
    res.end('Unauthorized');
  }
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
