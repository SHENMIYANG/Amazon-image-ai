FROM node:20-alpine

WORKDIR /app

# Copy frontend source code first (needed for build)
COPY frontend/package*.json ./frontend/
COPY frontend/index.html ./frontend/
COPY frontend/src/ ./frontend/src/

# Install frontend dependencies and build
RUN cd frontend && npm install && npm run build

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy backend code (excluding .env due to .dockerignore)
COPY backend/ ./backend/

# Frontend build output is already at /app/frontend/dist (from line 11)
# Backend serves it from there, no need to copy

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
