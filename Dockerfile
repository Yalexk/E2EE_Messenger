# One container: the Express API + Socket.io, which also serves the built React app.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts
COPY shared shared
COPY frontend frontend
RUN npm run build -w frontend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts -w backend -w shared && npm cache clean --force
COPY shared shared
COPY backend/src backend/src
COPY --from=build /app/frontend/dist frontend/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "backend/src/index.js"]
