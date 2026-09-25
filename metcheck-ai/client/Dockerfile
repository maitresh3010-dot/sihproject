FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bake the backend URL in at build time. Leave empty to use same-origin /api (Vercel setup).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback: /api/* goes to backend, everything else to index.html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location /api/ { proxy_pass http://server:5000; }\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
