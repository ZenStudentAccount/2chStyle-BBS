#!/usr/bin/env bash
npx prisma migrate deploy
node index.js
