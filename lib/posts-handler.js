'use strict';

const pug = require('pug');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const crypto = require('node:crypto');
const Cookies = require('cookies');
const config = require('../config');
const util = require('./handler-util');

require('dayjs/locale/ja');
dayjs.locale('ja');

dayjs.extend(utc);
dayjs.extend(timezone);

const csrfTokenMap = new Map(); // key: trackingId, value: csrfToken

/**
 * スレッド一覧の表示と作成
 */
async function handleThreads(req, res) {
  const cookies = new Cookies(req, res);
  const trackingId = addTrackingCookie(cookies);

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; style-src https://cdn.jsdelivr.net 'unsafe-inline'; font-src https://cdn.jsdelivr.net; script-src https://cdn.jsdelivr.net 'unsafe-inline';"
      });
      const threads = await prisma.thread.findMany({
        include: {
          _count: {
            select: { posts: true }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      const csrfToken = crypto.randomBytes(8).toString('hex');
      csrfTokenMap.set(trackingId, csrfToken);
      const currentTheme = cookies.get(config.THEME_KEY) || 'light';
      res.end(pug.renderFile('./views/threads.pug', {
        threads,
        user: req.user,
        csrfToken,
        currentTheme
      }));
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const title = params.get('title');
        const content = params.get('content');
        const postedBy = params.get('postedBy') || '名無しさん';
        const requestedCsrfToken = params.get('csrfToken');

        if (csrfTokenMap.get(trackingId) !== requestedCsrfToken || !title || !content) {
          util.handleBadRequest(req, res);
          return;
        }

        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const thread = await prisma.thread.create({
          data: {
            title,
            username: req.user,
            posts: {
              create: {
                content,
                postedBy,
                ipAddress,
                username: req.user
              }
            }
          }
        });
        res.writeHead(303, {
          'Location': `/threads/${thread.id}`
        });
        res.end();
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

/**
 * 個別スレッドの投稿一覧表示と書き込み
 */
async function handle(req, res) {
  const cookies = new Cookies(req, res);
  const trackingId = addTrackingCookie(cookies);
  const threadId = req.threadId;

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      posts: {
        orderBy: { id: 'asc' }
      }
    }
  });

  if (!thread) {
    util.handleNotFound(req, res);
    return;
  }

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; style-src https://cdn.jsdelivr.net 'unsafe-inline'; font-src https://cdn.jsdelivr.net; script-src https://cdn.jsdelivr.net 'unsafe-inline';"
      });
      
      thread.posts.forEach((post) => {
        post.formattedCreatedAt = dayjs(post.createdAt).tz('Asia/Tokyo').format('YYYY/MM/DD(ddd) HH:mm:ss.SSS');
        post.displayId = crypto.createHash('sha256').update(post.ipAddress + dayjs(post.createdAt).format('YYYYMMDD')).digest('hex').slice(0, 8);
      });

      const csrfToken = crypto.randomBytes(8).toString('hex');
      csrfTokenMap.set(trackingId, csrfToken);
      const currentTheme = cookies.get(config.THEME_KEY) || 'light';
      res.end(pug.renderFile('./views/posts.pug', {
        thread,
        posts: thread.posts,
        user: req.user,
        csrfToken,
        currentTheme
      }));
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const content = params.get('content');
        const postedBy = params.get('postedBy') || '名無しさん';
        const requestedCsrfToken = params.get('csrfToken');

        if (csrfTokenMap.get(trackingId) !== requestedCsrfToken || !content) {
          util.handleBadRequest(req, res);
          return;
        }

        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await prisma.post.create({
          data: {
            content,
            postedBy,
            ipAddress,
            username: req.user,
            threadId
          }
        });
        res.writeHead(303, {
          'Location': `/threads/${threadId}?last=true`
        });
        res.end();
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

async function handleDelete(req, res) {
  if (req.method !== 'POST') {
    util.handleBadRequest(req, res);
    return;
  }

  if (req.user !== 'admin' && req.user !== 'guest') {
    util.handleBadRequest(req, res);
    return;
  }

  const cookies = new Cookies(req, res);
  const trackingId = cookies.get(config.COOKIE_KEY);
  const threadId = req.threadId;

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  }).on('end', async () => {
    const params = new URLSearchParams(body);
    const id = parseInt(params.get('id'));
    const requestedCsrfToken = params.get('csrfToken');

    if (csrfTokenMap.get(trackingId) !== requestedCsrfToken) {
      util.handleBadRequest(req, res);
      return;
    }

    const post = await prisma.post.findUnique({
      where: { id }
    });

    if (!post) {
      util.handleNotFound(req, res);
      return;
    }

    if (req.user === 'admin' || (req.user === 'guest' && post.username === 'guest')) {
      await prisma.post.delete({
        where: { id }
      });
      res.writeHead(303, {
        'Location': `/threads/${threadId}`
      });
      res.end();
    } else {
      util.handleBadRequest(req, res);
    }
  });
}

async function handleDeleteThread(req, res) {
  if (req.method !== 'POST') {
    util.handleBadRequest(req, res);
    return;
  }

  if (req.user !== 'admin' && req.user !== 'guest') {
    util.handleBadRequest(req, res);
    return;
  }

  const cookies = new Cookies(req, res);
  const trackingId = cookies.get(config.COOKIE_KEY);
  const threadId = req.threadId;

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  }).on('end', async () => {
    const params = new URLSearchParams(body);
    const requestedCsrfToken = params.get('csrfToken');

    if (csrfTokenMap.get(trackingId) !== requestedCsrfToken) {
      util.handleBadRequest(req, res);
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId }
    });

    if (!thread) {
      util.handleNotFound(req, res);
      return;
    }

    if (req.user === 'admin' || (req.user === 'guest' && thread.username === 'guest')) {
      await prisma.thread.delete({
        where: { id: threadId }
      });
      res.writeHead(303, {
        'Location': '/threads'
      });
      res.end();
    } else {
      util.handleBadRequest(req, res);
    }
  });
}


function handleChangeTheme(req, res) {
  const cookies = new Cookies(req, res);
  const currentTheme = cookies.get(config.THEME_KEY) || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  cookies.set(config.THEME_KEY, newTheme);
  
  // 元のページに戻る（リファラがあれば）
  const referer = req.headers.referer || '/threads';
  res.writeHead(303, {
    'Location': referer
  });
  res.end();
}

/**
 * Cookieに含まれるトラッキングIDに異常がなければその値を返し、
 * 存在しないか異常であれば、新たにトラッキングIDを作成しCookieに設定して返す。
 *
 * @param {Cookies} cookies
 * @return {string} トラッキングID
 */
function addTrackingCookie(cookies) {
  let trackingId = cookies.get(config.COOKIE_KEY);
  if (!trackingId) {
    const originalId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
    trackingId = originalId + '_' + crypto.randomBytes(8).toString('hex');
    cookies.set(config.COOKIE_KEY, trackingId, { expires: tomorrow });
  }
  return trackingId;
}

module.exports = {
  handleThreads,
  handle,
  handleDelete,
  handleDeleteThread,
  handleChangeTheme
};
