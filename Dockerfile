# Node.jsの公式イメージを使用
FROM node:22-slim

# SQLiteを使用するため、必要なパッケージをインストール
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# アプリケーションディレクトリを作成
WORKDIR /app

# 依存関係ファイルをコピー
COPY package*.json ./
COPY prisma ./prisma/

# 依存関係をインストール
RUN npm install

# アプリケーションのソースをコピー
COPY . .

# Prismaクライアントの生成とマイグレーションの準備
RUN npx prisma generate

# 実行用スクリプトに権限付与
RUN chmod +x run.sh

# ポートの公開
EXPOSE 8000

# 起動コマンド
CMD ["./run.sh"]
