'use strict';

const postsHandler = require('./posts-handler');
const util = require('./handler-util');

function route(req, res) {
  // 運用環境での常時HTTPSの強制
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    util.handleNotFound(req, res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/threads') {
    postsHandler.handleThreads(req, res);
  } else if (pathname.startsWith('/threads/')) {
    const parts = pathname.split('/');
    const threadId = parseInt(parts[2]);
    const action = parts[3];

    if (!isNaN(threadId)) {
      req.threadId = threadId;
      if (action === 'delete') {
        postsHandler.handleDelete(req, res);
      } else if (action === 'deleteThread') {
        postsHandler.handleDeleteThread(req, res);
      } else {
        postsHandler.handle(req, res);
      }
    } else {
      util.handleNotFound(req, res);
    }
  } else if (pathname === '/logout') {
    util.handleLogout(req, res);
  } else if (pathname === '/favicon.ico') {
    util.handleFavicon(req, res);
  } else if (pathname === '/changeTheme') {
    postsHandler.handleChangeTheme(req, res);
  } else if (pathname === '/' || pathname === '/posts') {
    // 互換性のため、またはトップページとしてリダイレクト
    res.writeHead(303, { 'Location': '/threads' });
    res.end();
  } else {
    util.handleNotFound(req, res);
  }
}

module.exports = {
  route
};
