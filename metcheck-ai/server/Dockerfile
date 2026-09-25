FROM node:20-slim
WORKDIR /app/server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=5000
EXPOSE 5000
CMD ["node", "server.js"]
