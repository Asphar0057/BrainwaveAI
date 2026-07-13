# Frontend Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY scripts ./scripts

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Set API URL for Docker (nginx will proxy /api to backend)
ENV REACT_APP_API_URL=/api

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
