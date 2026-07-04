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

# Copy built frontend to backend
COPY frontend/dist ./backend/frontend/dist

# Copy backend code (excluding .env due to .dockerignore)
COPY backend/ ./backend/

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
