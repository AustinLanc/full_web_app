# Use Node.js LTS base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the entire app
COPY . .

# Expose the port your Express app runs on
EXPOSE 3000

# Optional: non-root user for better security
RUN useradd -m appuser
USER appuser

# Run the app
CMD ["node", "index.js"]
