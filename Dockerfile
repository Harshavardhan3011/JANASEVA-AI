FROM node:22-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./backend/
COPY mock-portal/package*.json ./mock-portal/
RUN npm ci --prefix backend && npm ci --omit=dev --prefix mock-portal
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN cd backend && npx playwright install --with-deps chromium
COPY backend ./backend
COPY mock-portal ./mock-portal
COPY database ./database
RUN npm --prefix backend run build && mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node","backend/dist/server.js"]
