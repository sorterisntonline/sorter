FROM node:18

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Install a simple static file server
RUN npm install -g serve

# Expose port 3000
EXPOSE 3000

# Start the server to serve built assets
CMD ["serve", "-s", "dist", "-l", "3000"]
