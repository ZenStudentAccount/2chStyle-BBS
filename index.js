'use strict';

const http = require('node:http');
const auth = require('http-auth');
const path = require('node:path');
const router = require('./lib/router');

// 1. 環境変数から複数のユーザー情報を取得
const rawCredentials = process.env.HTPASSWD_DATA || 'admin:password\nguest:password';

// 2. データを Map に格納
const userMap = new Map(
  rawCredentials.split('\n').map(line => {
    const [user, pass] = line.trim().split(':');
    return [user, pass];
  })
);

// 3. 【修正】http-auth の「カスタム検証機能」を正しく使ってベーシック認証を作成
const basic = auth.basic(
  { realm: 'Enter username and password.' },
  (username, password, callback) => {
    // 入力されたユーザー名がMapに存在し、かつパスワードが一致するかチェック
    const isValid = userMap.has(username) && userMap.get(username) === password;
    // callback(結果) を呼び出す（第1引数はエラーなので null）
    callback(isValid);
  }
);

// 4. http.createServer 内で basic.check を使ってガードする
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
