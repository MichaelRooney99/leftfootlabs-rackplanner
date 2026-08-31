FROM node:22-slim
WORKDIR /app

# better-sqlite3 needs build tools for its native binding
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN mkdir -p /data
ENV RACKPLANNER_DB_PATH=/data/rackplanner.db

EXPOSE 3002
CMD ["npm", "start"]
