const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { exec } = require('child_process');

const app = express();
const CONFIG_FILE = path.join(__dirname, 'config.json');
const AUTH_FILE = path.join(__dirname, 'panel_auth.json');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

let passwordHash = null;

if (!fs.existsSync(AUTH_FILE)) {
  const tempPassword = Math.random().toString(36).slice(-10);
  bcrypt.hash(tempPassword, 10, (err, hash) => {
    if (err) throw err;
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ hash, firstTimeShown: false, tempPassword }, null, 2));
    passwordHash = hash;
  });
} else {
  const data = JSON.parse(fs.readFileSync(AUTH_FILE));
  passwordHash = data.hash;
}

app.get('/', (req, res) => {
  if (req.cookies.auth === '1') {
    const config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
    return res.render('settings', config);
  }

  if (fs.existsSync(AUTH_FILE)) {
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE));
    if (!authData.firstTimeShown && authData.tempPassword) {
      res.render('first_password', { password: authData.tempPassword });
      authData.firstTimeShown = true;
      delete authData.tempPassword;
      fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
      return;
    }
  }

  res.render('login');
});

app.post('/login', (req, res) => {
  const input = req.body.password;
  bcrypt.compare(input, passwordHash, (err, result) => {
    if (result) {
      res.cookie('auth', '1', { maxAge: 30 * 24 * 60 * 60 * 1000 });
      const config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
      res.render('settings', config);
    } else {
      res.send('⛔ Wrong password');
    }
  });
});

app.post('/save', (req, res) => {
  const { target, port } = req.body;
  if (!target || !port) return res.send('❌ Invalid input.');
  const config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
  config.target = target;
  config.port = port;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.render('settings', {
    target,
    port,
    message: '✅ Settings saved successfully!',
    type: 'success'
  });
});

app.get('/certbot', (req, res) => {
  if (req.cookies.auth === '1') {
    res.render('certbot', {
      message: req.query.message || '',
      type: req.query.type || ''
    });
  } else {
    res.redirect('/');
  }
});

app.post('/certbot', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.redirect(`/certbot?message=❌ Invalid domain.&type=error`);

  exec(`certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email -d ${domain}`, (err, stdout, stderr) => {
    if (err) return res.redirect(`/certbot?message=❌ Certbot failed: ${stderr}&type=error`);

    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

    const config = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
    config.certPath = certPath;
    config.keyPath = keyPath;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    res.redirect(`/certbot?message=✅ SSL certificate created for ${domain}&type=success`);
  });
});

app.listen(3001, () => {
  console.log('🛠️ Panel running at http://localhost:3001');
});
