FROM node:22-alpine
WORKDIR /app

# 빌드 컨텍스트: 프로젝트 루트 (docker-compose.test.yml 기준)
COPY test/mock-servers/github/package.json ./
COPY test/mock-servers/github/server.mjs ./
# server.mjs에서 ../../fixtures/github를 참조하므로, 같은 구조 유지
COPY test/ ./test/

EXPOSE 3101
CMD ["node", "server.mjs"]
