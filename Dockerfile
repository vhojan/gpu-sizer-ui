# ---- Stage 1: Build ----
    FROM node:18-alpine AS builder
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY . .
    RUN npm run build
    
    # ---- Stage 2: Serve ----
    FROM node:18-alpine
    WORKDIR /app
    RUN npm install -g serve
    COPY --from=builder /app/dist ./dist
    EXPOSE 3000
    CMD ["serve", "-s", "dist", "-l", "3000"]