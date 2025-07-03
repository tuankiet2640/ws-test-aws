require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.urlencoded({ extended: false }));

// Home page with links
app.get('/', async (req, res) => {
  try {
    const pool = new Pool({
  connectionString: process.env.PG_URI
});

// Create users table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
  )
`);

    // Instead, render UI without database
    res.send('<h1>Welcome! No database connection avail.</h1>');
  } catch (err) {
    // Catch any exception and render fallback UI
    res.send('<h1>Welcome! (Database unavailable, showing fallback UI.)</h1>');
  }
});

// Show all users
app.get('/users', async (req, res) => {
  const result = await pool.query('SELECT id, username FROM users');
  const users = result.rows.map(
    u => `<li>${u.username} 
      <a href="/users/${u.id}">View</a> 
      <a href="/users/${u.id}/edit">Edit</a> 
      <form action="/users/${u.id}?_method=DELETE" method="post" style="display:inline;">
        <button type="submit">Delete</button>
      </form>
    </li>`
  ).join('');
  res.send(`
    <h2>Users</h2>
    <ul>${users}</ul>
    <a href="/">Home</a> | <a href="/users/new">Register User</a>
    <script>
      // Simple method override for delete
      document.querySelectorAll('form[action*="_method=DELETE"]').forEach(f => {
        f.onsubmit = e => {
          e.preventDefault();
          fetch(f.action.replace('?_method=DELETE',''), {method:'DELETE'})
            .then(()=>location.reload());
        }
      });
    </script>
  `);
});

// Registration form
app.get('/users/new', (req, res) => {
  res.send(`
    <h2>Register User</h2>
    <form method="post" action="/users">
      <input name="username" placeholder="Username" required>
      <input name="password" type="password" placeholder="Password" required>
      <button>Register</button>
    </form>
    <a href="/">Home</a>
  `);
});

// Create user
app.post('/users', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hash]
    );
    res.redirect('/users');
  } catch (err) {
    res.status(400).json({ error: 'User already exists' });
  }
});

// View single user
app.get('/users/:id', async (req, res) => {
  const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).send('User not found');
  const user = result.rows[0];
  res.send(`
    <h2>User: ${user.username}</h2>
    <p>ID: ${user.id}</p>
    <a href="/users/${user.id}/edit">Edit</a>
    <a href="/users">Back to Users</a>
  `);
});

// Edit user form
app.get('/users/:id/edit', async (req, res) => {
  const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).send('User not found');
  const user = result.rows[0];
  res.send(`
    <h2>Edit User</h2>
    <form method="post" action="/users/${user.id}?_method=PUT">
      <input name="username" value="${user.username}" required>
      <input name="password" type="password" placeholder="New Password (optional)">
      <button>Update</button>
    </form>
    <a href="/users">Back to Users</a>
    <script>
      // Simple method override for put
      document.querySelector('form').onsubmit = function(e) {
        e.preventDefault();
        fetch('/users/${user.id}', {
          method: 'PUT',
          headers: {'Content-Type':'application/x-www-form-urlencoded'},
          body: new URLSearchParams(new FormData(this))
        }).then(()=>location.href='/users');
      }
    </script>
  `);
});

// Update user
app.put('/users/:id', async (req, res) => {
  const { username, password } = req.body;
  let query, params;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    query = 'UPDATE users SET username = $1, password = $2 WHERE id = $3 RETURNING id, username';
    params = [username, hash, req.params.id];
  } else {
    query = 'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username';
    params = [username, req.params.id];
  }
  const result = await pool.query(query, params);
  res.sendStatus(200);
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  res.sendStatus(200);
});

// Login form
app.get('/login', (req, res) => {
  res.send(`
    <h2>Login</h2>
    <form method="post" action="/login">
      <input name="username" placeholder="Username" required>
      <input name="password" type="password" placeholder="Password" required>
      <button>Login</button>
    </form>
    <a href="/">Home</a>
  `);
});

// Login (stateless, just checks credentials)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (user && await bcrypt.compare(password, user.password)) {
    res.send(`<h2>Login successful</h2><a href="/">Home</a>`);
  } else {
    res.send(`<h2>Invalid credentials</h2><a href="/login">Try again</a>`);
  }
});

// Logout (stateless, just a placeholder)
app.post('/logout', (req, res) => {
  res.send(`<h2>Logged out</h2><a href="/">Home</a>`);
});

// Add support for PUT/DELETE via query param for forms
const methodOverride = (req, res, next) => {
  if (req.method === 'POST' && req.query._method) {
    req.method = req.query._method.toUpperCase();
  }
  next();
};
app.use(methodOverride);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
