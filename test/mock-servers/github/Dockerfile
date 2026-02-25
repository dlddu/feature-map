FROM node:22-alpine
WORKDIR /app

# 빌드 컨텍스트: 프로젝트 루트
COPY test/mock-servers/github/package.json /app/package.json
COPY test/mock-servers/github/server.mjs /app/server.mjs

# server.mjs에서 ../../fixtures/github를 참조
# 경로: __dirname = /app
#       fixturesDir = /app/../../fixtures/github = /fixtures/github
# 따라서 fixtures를 / (루트)에 복사
COPY test/fixtures /fixtures

EXPOSE 3101
CMD ["node", "server.mjs"]
