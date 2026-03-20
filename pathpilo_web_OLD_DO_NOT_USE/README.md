# PathPilo Web Demo

A simple demonstration of how to connect a web application to the PathPilo API.

## 🚀 Quick Start

### Prerequisites
- PathPilo API server running on `http://localhost:8000`
- Modern web browser

### Run the Demo
1. Make sure your API server is running:
   ```bash
   cd api-server
   node server.js
   ```

2. Open `index.html` in your web browser

3. Login with credentials from your PathPilo system

## 📋 What This Demo Shows

- **API Integration**: How web apps connect to your API
- **Authentication Flow**: Login form → JWT token → Protected requests
- **User Management**: Display user info and company relationships
- **Error Handling**: Proper error messages and loading states
- **Modern UI**: Clean, responsive design

## 🔧 How It Works

### Login Process
1. User enters email/password
2. Form submits to `/api/auth/login`
3. Receives JWT token on success
4. Stores token for subsequent requests

### User Data Display
1. Uses JWT token to fetch user details
2. Calls `/api/companies` to get user's companies
3. Displays formatted user information

### API Calls Made
```javascript
// Login
POST /api/auth/login

// Get companies (authenticated)
GET /api/companies
```

## 🎯 Next Steps

This is a foundation you can build upon:

1. **Add more features**: Jobs, clients, services
2. **Improve UI**: Add routing, components, styling
3. **Add frameworks**: React, Vue, Angular
4. **Deploy**: Host on Vercel, Netlify, etc.
5. **Connect to API**: Point to your deployed API server

## 📁 File Structure

```
pathpilo_web/
├── index.html    # Complete web application
└── README.md     # This documentation
```

## 🔗 API Connection

The demo connects to your local API at `http://localhost:8000`. To connect to a deployed API, change:

```javascript
const API_BASE = 'https://your-api.railway.app/api'; // Deployed API
```

That's it! One file, complete web application connecting to your API. 🎉
