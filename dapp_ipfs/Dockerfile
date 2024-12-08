FROM node:18-alpine

WORKDIR /app
COPY public/ /app/public
COPY src/ /app/src
COPY package*.json /app/

RUN npm install

# Expone el puerto que usa la aplicación en modo de desarrollo
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]
