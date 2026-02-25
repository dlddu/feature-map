FROM node:22-alpine
WORKDIR /app

# 빌드 컨텍스트: 프로젝트 루트 (docker-compose.test.yml 기준)
COPY test/mock-servers/llm/package.json ./
COPY test/mock-servers/llm/server.mjs ./
COPY test/fixtures/llm /app/fixtures/llm

EXPOSE 3102
CMD ["node", "server.mjs"]
