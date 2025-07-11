sudo apt update && sudo apt install -y curl git && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs && sudo apt install certbot
cd /root/cf-panel && npm i && npm i -g pm2 && pm2 start panel.js
cd /root/cf-reverse-proxy && npm i && pm2 start index.js -i max
