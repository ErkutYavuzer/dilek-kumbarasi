# Multi-stage build for Node.js
# Stage 1: Build
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Stage 2: Final Image
FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# Copy only the necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Create persistent storage directories (already handled in server.js but good to specify)
RUN mkdir -p uploads data && chown -R node:node /app

# Use non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
