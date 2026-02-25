FROM node:22-alpine
WORKDIR /app

# 빌드 컨텍스트: 프로젝트 루트 (docker-compose.test.yml 기준)
COPY test/mock-servers/github/package.json ./
COPY test/mock-servers/github/server.mjs ./
COPY test/fixtures/github /app/fixtures/github

EXPOSE 3101
CMD ["node", "server.mjs"]
