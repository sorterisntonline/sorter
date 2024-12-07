FROM clojure:openjdk-17-tools-deps

WORKDIR /app

# Install any additional tools if necessary
RUN apt-get update && apt-get install -y nodejs npm

# Copy borter project files
COPY deps.edn .
COPY src ./src
COPY resources ./resources
COPY database ./database

# Copy the entrypoint script
COPY entrypoint.sh ./

# Make the entrypoint script executable
RUN chmod +x ./entrypoint.sh

# Install Clojure dependencies
RUN clojure -P

# Expose port 8000
EXPOSE 8000

# Set the entrypoint
ENTRYPOINT ["./entrypoint.sh"]