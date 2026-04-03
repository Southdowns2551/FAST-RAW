# Material Hub PWA - static files served by nginx
# Build: docker build -t material-hub-pwa -f Dockerfile .
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html manifest.json sw.js auth.js app.js rawIn.js rawOut.js reworkOut.js reworkIn.js settings.js portal.js config.js styles.css /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
