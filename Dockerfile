FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8789
ENV PORT=8789
CMD ["npm", "start"]
