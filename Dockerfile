FROM node:20-alpine

WORKDIR /app

# Install frontend dependencies and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install && npm run build

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy built frontend to backend
COPY frontend/dist ./backend/frontend/dist

# Copy backend code
COPY backend/ ./backend/

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
