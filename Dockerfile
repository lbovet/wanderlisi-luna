FROM oven/bun:1.4.2-alpine

WORKDIR /app

COPY index.js ./index.js
COPY package.json ./package.json

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "index.js"]
