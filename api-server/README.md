# PathPilo API Server - Complete Documentation

A comprehensive REST API for the PathPilo job management platform, designed to support multiple client applications (web, mobile, future platforms).

## 🚀 Quick Start & Testing Guide

### 1. Start the API Server
```bash
cd api-server
npm install
node server.js
```
**Server will run on:** `http://localhost:8000`

### 2. Verify Server is Running
```powershell
Invoke-WebRequest -Uri http://localhost:8000/api/health -Method GET
# Should return: {"status":"ok","timestamp":"2026-01-14T...","version":"1.0.0"}
```

### 3. Get API Documentation
```powershell
Invoke-WebRequest -Uri http://localhost:8000/ -Method GET
# Shows all available endpoints
```

## 🔐 Authentication Flow

### Step 1: Register a New User
```powershell
$registerData = @{
    firstName = "John"
    lastName = "Doe"
    email = "john.doe@example.com"
    password = "password123"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $registerData -ContentType "application/json"
$userData = $response.Content | ConvertFrom-Json
$token = $userData.token
Write-Host "JWT Token: $token"
```

**Response:**
```json
{
  "message": "User and company created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "role": "owner",
    "companyId": 1,
    "companyName": "John's Company"
  }
}
```

### Step 2: Use JWT Token for Authenticated Requests
```powershell
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
```

## 📋 Complete API Endpoint Guide

### Core Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Multi-tenant**: Company-based data isolation
- **Jobs Management**: Create, update, schedule, and track jobs
- **Client Management**: Customer relationship management
- **Services**: Service catalog and pricing
- **Subscriptions**: Recurring job automation
- **Lead Generation**: Public forms and lead management
- **Company Management**: Multi-company support with invitations

## 📚 Complete API Endpoint Documentation

### 🔐 Authentication Endpoints

#### POST /api/auth/register
Register a new user and create their company.

**Request:**
```powershell
$registerData = @{
    firstName = "John"
    lastName = "Doe"
    email = "john.doe@example.com"
    password = "password123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $registerData -ContentType "application/json"
```

**Response:**
```json
{
  "message": "User and company created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "role": "owner",
    "companyId": 1,
    "companyName": "John's Company"
  }
}
```

#### POST /api/auth/login
Login with existing credentials.

**Request:**
```powershell
$loginData = @{
    email = "john.doe@example.com"
    password = "password123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/auth/login" -Method POST -Body $loginData -ContentType "application/json"
```

### 🏢 Company Management

#### POST /api/companies/switch
Switch active company (if user belongs to multiple companies).

**Request:**
```powershell
$switchData = @{
    companyId = 2
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/companies/switch" -Method POST -Body $switchData -ContentType "application/json" -Headers $headers
```

### 👥 Client Management

#### GET /api/clients
Get all clients for your company.

**Request:**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/clients" -Method GET -Headers $headers
```

**Response:**
```json
{
  "clients": [
    {
      "id": 1,
      "name": "Jane",
      "last_name": "Smith",
      "client_type": "person",
      "address": "123 Main St",
      "zip_code": "12345",
      "city": "Springfield",
      "email": "jane@example.com",
      "phone": "+1-555-0123",
      "job_count": 3
    }
  ],
  "total": 1
}
```

#### POST /api/clients
Create a new client.

**Request:**
```powershell
$clientData = @{
    name = "Jane"
    last_name = "Smith"
    client_type = "person"
    address = "123 Main St"
    zip_code = "12345"
    city = "Springfield"
    email = "jane@example.com"
    phone = "+1-555-0123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/clients" -Method POST -Body $clientData -ContentType "application/json" -Headers $headers
```

**Response:**
```json
{
  "message": "Client created successfully",
  "client": {
    "id": 1,
    "name": "Jane",
    "last_name": "Smith",
    "client_type": "person",
    "address": "123 Main St",
    "zip_code": "12345",
    "city": "Springfield",
    "email": "jane@example.com",
    "phone": "+1-555-0123"
  }
}
```

### 🛠️ Services Management

#### GET /api/services
Get all services for your company.

**Request:**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/services" -Method GET -Headers $headers
```

#### POST /api/services
Create a new service.

**Request:**
```powershell
$serviceData = @{
    name = "House Cleaning"
    description = "Complete house cleaning service"
    price = 150.00
    duration_minutes = 180
    category = "cleaning"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/services" -Method POST -Body $serviceData -ContentType "application/json" -Headers $headers
```

### 💼 Jobs Management

#### GET /api/jobs
Get all jobs with optional date filtering.

**Request:**
```powershell
# Get all jobs
Invoke-WebRequest -Uri "http://localhost:8000/api/jobs" -Method GET -Headers $headers

# Get jobs for specific date range
Invoke-WebRequest -Uri "http://localhost:8000/api/jobs?start_date=2026-01-01&end_date=2026-01-31" -Method GET -Headers $headers
```

**Response:**
```json
{
  "jobs": [
    {
      "id": 1,
      "title": "House Cleaning",
      "scheduled_date": "2026-01-15",
      "scheduled_time_from": "09:00",
      "scheduled_time_to": "12:00",
      "status": "scheduled",
      "name": "Jane",
      "last_name": "Smith",
      "address": "123 Main St",
      "city": "Springfield",
      "service_count": 1,
      "total_price": 150.00,
      "total_duration": 180
    }
  ],
  "total": 1,
  "filters": {
    "start_date": "2026-01-01",
    "end_date": "2026-01-31"
  }
}
```

#### POST /api/jobs
Create a new job.

**Request:**
```powershell
$jobData = @{
    title = "House Cleaning"
    client_id = 1
    assigned_user_id = 1
    services = @(
        @{
            service_id = 1
            custom_price = 150.00
            custom_duration = 180
        }
    )
    scheduled_date = "2026-01-15"
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
    note = "Please clean thoroughly"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/jobs" -Method POST -Body $jobData -ContentType "application/json" -Headers $headers
```

#### PUT /api/jobs/:jobId/status
Update job status.

**Request:**
```powershell
$statusData = @{
    status = "in_progress"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/jobs/1/status" -Method PUT -Body $statusData -ContentType "application/json" -Headers $headers
```

### 🔄 Subscriptions (Recurring Jobs)

#### POST /api/subscriptions
Create a recurring subscription.

**Request:**
```powershell
$subscriptionData = @{
    title = "Weekly House Cleaning"
    client_id = 1
    assigned_user_id = 1
    services = @(
        @{
            service_id = 1
            custom_price = 150.00
            custom_duration = 180
        }
    )
    starting_date = "2026-01-15"
    recurrence_type = "weekly"
    day_of_week = 3  # Wednesday (0=Sunday, 1=Monday, etc.)
    interval_value = 1  # Every week
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
    note = "Weekly cleaning service"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/subscriptions" -Method POST -Body $subscriptionData -ContentType "application/json" -Headers $headers
```

**For Monthly Recurrence:**
```powershell
$monthlySubscription = @{
    title = "Monthly Deep Clean"
    client_id = 1
    assigned_user_id = 1
    services = @(@{ service_id = 1; custom_price = 200.00; custom_duration = 240 })
    starting_date = "2026-01-15"
    recurrence_type = "monthly"
    day_of_month = 15  # 15th of each month
    interval_value = 1  # Every month
    scheduled_time_from = "09:00"
    scheduled_time_to = "13:00"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/subscriptions" -Method POST -Body $monthlySubscription -ContentType "application/json" -Headers $headers
```

#### GET /api/subscriptions
Get all subscriptions.

**Request:**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/subscriptions" -Method GET -Headers $headers
```

### 📊 Admin Endpoints (Admin Only)

#### GET /api/admin/users
Get all users in the system (admin only).

**Request:**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/admin/users" -Method GET -Headers $headers
```

### 📝 Lead Management

#### GET /api/leads/leads
Get all leads for your company.

**Request:**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/leads/leads" -Method GET -Headers $headers
```

### 🚀 Future Features (Ready for Implementation)

#### POST /api/maps/routes/calculate
Calculate optimized routes (requires Google Maps API key).

#### GET /api/maps/jobs/:jobId/location
Get real-time GPS location for mobile workers.

#### POST /api/notifications/push
Send push notifications to mobile devices.

#### POST /api/files/upload
Upload job photos and documents.

#### GET /api/analytics/jobs
Get job analytics and business reports.

#### POST /api/mobile/checkin
Mobile app check-in/check-out functionality.

#### POST /api/integrations/stripe/webhook
Handle Stripe payment webhooks.

## 🔐 Authentication

All protected endpoints require a JWT token in the Authorization header:
```powershell
$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    "Content-Type" = "application/json"
}
```

## 📋 Complete Data Models

### Job Object
```json
{
  "id": "number",
  "company_id": "number",
  "client_id": "number",
  "assigned_user_id": "number",
  "title": "string",
  "note": "string",
  "scheduled_date": "date (YYYY-MM-DD)",
  "scheduled_time_from": "time (HH:MM)",
  "scheduled_time_to": "time (HH:MM)",
  "status": "scheduled|in_progress|completed|cancelled",
  "recurring_job_id": "number (null for one-time jobs)",
  "is_generated": "boolean",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  // Joined data (included in responses)
  "name": "string (client first name)",
  "last_name": "string (client last name)",
  "address": "string (client address)",
  "zip_code": "string (client zip code)",
  "city": "string (client city)",
  "service_count": "number",
  "total_price": "number",
  "total_duration": "number (minutes)"
}
```

### Client Object
```json
{
  "id": "number",
  "company_id": "number",
  "name": "string",
  "last_name": "string",
  "client_type": "person|company",
  "address": "string",
  "zip_code": "string",
  "city": "string",
  "email": "string",
  "phone": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  // Computed fields
  "job_count": "number (total jobs for this client)",
  "last_job_date": "date (most recent job date)"
}
```

### Service Object
```json
{
  "id": "number",
  "company_id": "number",
  "name": "string",
  "description": "string",
  "price": "number",
  "duration_minutes": "number",
  "category": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  // Computed fields
  "usage_count": "number (how many jobs use this service)"
}
```

### Subscription Object
```json
{
  "id": "number",
  "company_id": "number",
  "client_id": "number",
  "assigned_user_id": "number",
  "title": "string",
  "note": "string",
  "starting_date": "date (YYYY-MM-DD)",
  "recurrence_type": "weekly|monthly",
  "day_of_week": "number (0=Sunday, 1=Monday, ..., 6=Saturday)",
  "day_of_month": "number (1-31)",
  "interval_value": "number (every N weeks/months)",
  "scheduled_time_from": "time (HH:MM)",
  "scheduled_time_to": "time (HH:MM)",
  "is_active": "boolean",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  // Joined data
  "name": "string (client first name)",
  "last_name": "string (client last name)",
  "service_count": "number",
  "total_price": "number"
}
```

### User Object
```json
{
  "id": "number",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "role": "owner|admin|user",
  "created_at": "timestamp",
  // Company context
  "company_id": "number (active company)",
  "company_name": "string",
  "company_slug": "string",
  "company_role": "string (role in active company)"
}
```

## 🚨 Error Handling

### Common Error Responses

**Authentication Error:**
```json
{
  "error": "Access token required"
}
```

**Invalid Token:**
```json
{
  "error": "Invalid or expired token"
}
```

**Permission Denied:**
```json
{
  "error": "Admin access required"
}
```

**Validation Error:**
```json
{
  "error": "Client, assigned user, services, and scheduled date are required"
}
```

**Not Found:**
```json
{
  "error": "Client not found or access denied"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## 🧪 Step-by-Step Testing Guide

### Complete Test Scenario

```powershell
# 1. Check server health
Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET

# 2. Register a new user
$registerData = @{
    firstName = "Test"
    lastName = "User"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

$registerResponse = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $registerData -ContentType "application/json"
$userData = $registerResponse.Content | ConvertFrom-Json
$token = $userData.token

# 3. Set up authentication header
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# 4. Create a service
$serviceData = @{
    name = "House Cleaning"
    description = "Complete house cleaning"
    price = 150.00
    duration_minutes = 180
    category = "cleaning"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/services" -Method POST -Body $serviceData -ContentType "application/json" -Headers $headers

# 5. Create a client
$clientData = @{
    name = "John"
    last_name = "Smith"
    client_type = "person"
    address = "123 Main St"
    zip_code = "12345"
    city = "Anytown"
    email = "john@example.com"
    phone = "+1-555-0123"
} | ConvertTo-Json

$clientResponse = Invoke-WebRequest -Uri "http://localhost:8000/api/clients" -Method POST -Body $clientData -ContentType "application/json" -Headers $headers
$clientData = $clientResponse.Content | ConvertFrom-Json
$clientId = ($clientData.client | ConvertFrom-Json).id

# 6. Create a job
$jobData = @{
    title = "Weekly Cleaning"
    client_id = $clientId
    assigned_user_id = 1  # Your user ID
    services = @(
        @{
            service_id = 1
            custom_price = 150.00
            custom_duration = 180
        }
    )
    scheduled_date = "2026-01-20"
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
    note = "Regular cleaning service"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/jobs" -Method POST -Body $jobData -ContentType "application/json" -Headers $headers

# 7. Get all jobs
Invoke-WebRequest -Uri "http://localhost:8000/api/jobs" -Method GET -Headers $headers

# 8. Create a subscription
$subscriptionData = @{
    title = "Weekly Cleaning Service"
    client_id = $clientId
    assigned_user_id = 1
    services = @(
        @{
            service_id = 1
            custom_price = 150.00
            custom_duration = 180
        }
    )
    starting_date = "2026-01-20"
    recurrence_type = "weekly"
    day_of_week = 1  # Monday
    interval_value = 1  # Every week
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/subscriptions" -Method POST -Body $subscriptionData -ContentType "application/json" -Headers $headers

# 9. Get all subscriptions
Invoke-WebRequest -Uri "http://localhost:8000/api/subscriptions" -Method GET -Headers $headers
```

## 🚀 Future-Proof Features

This API is designed to easily support:

- **Mobile Apps**: React Native/Flutter consuming these endpoints
- **Real-time Updates**: WebSocket integration for live job updates
- **Maps Integration**: Google Maps API for route optimization
- **Notifications**: Push notifications and SMS via Firebase/OneSignal
- **File Uploads**: Job photos, documents, signatures (AWS S3/Cloudinary)
- **Reporting**: Analytics and business intelligence dashboards
- **Integrations**: Calendar sync, Stripe payments, accounting software
- **AI Features**: Smart scheduling, route optimization, customer insights

## 🛠️ Development & Testing

### Local Development
```bash
# Install dependencies
npm install

# Start server (already running on port 8000)
node server.js

# Development with auto-restart (when implemented)
npm run dev

# Run tests (when implemented)
npm test

# Lint code (when implemented)
npm run lint
```

### PowerShell Testing Scripts

**Create a test script file (`test-api.ps1`):**
```powershell
# Vevago API Testing Script
$baseUrl = "http://localhost:8000"

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"

function Write-ColorOutput($Message, $Color) {
    Write-Host $Message -ForegroundColor $Color
}

# Test 1: Health Check
Write-ColorOutput "🔍 Testing API Health..." $Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -Method GET
    Write-ColorOutput "✅ API is healthy: $($response.Content)" $Green
} catch {
    Write-ColorOutput "❌ API health check failed: $($_.Exception.Message)" $Red
    exit 1
}

# Test 2: Register User
Write-ColorOutput "👤 Registering test user..." $Yellow
$registerData = @{
    firstName = "API"
    lastName = "Tester"
    email = "api.tester@example.com"
    password = "testpass123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method POST -Body $registerData -ContentType "application/json"
    $userData = $response.Content | ConvertFrom-Json
    $token = $userData.token
    Write-ColorOutput "✅ User registered successfully" $Green

    # Set up auth headers
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
} catch {
    Write-ColorOutput "❌ User registration failed: $($_.Exception.Message)" $Red
    exit 1
}

# Test 3: Create Service
Write-ColorOutput "🛠️ Creating test service..." $Yellow
$serviceData = @{
    name = "Test Cleaning"
    description = "Professional cleaning service"
    price = 100.00
    duration_minutes = 120
    category = "cleaning"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/services" -Method POST -Body $serviceData -ContentType "application/json" -Headers $headers
    Write-ColorOutput "✅ Service created successfully" $Green
} catch {
    Write-ColorOutput "❌ Service creation failed: $($_.Exception.Message)" $Red
}

# Test 4: Create Client
Write-ColorOutput "👥 Creating test client..." $Yellow
$clientData = @{
    name = "Test"
    last_name = "Client"
    client_type = "person"
    address = "123 Test St"
    zip_code = "12345"
    city = "Test City"
    email = "test@example.com"
    phone = "+1-555-TEST"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/clients" -Method POST -Body $clientData -ContentType "application/json" -Headers $headers
    $clientResult = $response.Content | ConvertFrom-Json
    $clientId = $clientResult.client.id
    Write-ColorOutput "✅ Client created with ID: $clientId" $Green
} catch {
    Write-ColorOutput "❌ Client creation failed: $($_.Exception.Message)" $Red
}

# Test 5: Create Job
Write-ColorOutput "💼 Creating test job..." $Yellow
$jobData = @{
    title = "Test Job"
    client_id = $clientId
    assigned_user_id = 1
    services = @(
        @{
            service_id = 1
            custom_price = 100.00
            custom_duration = 120
        }
    )
    scheduled_date = "2026-01-25"
    scheduled_time_from = "10:00"
    scheduled_time_to = "12:00"
    note = "API testing job"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/jobs" -Method POST -Body $jobData -ContentType "application/json" -Headers $headers
    Write-ColorOutput "✅ Job created successfully" $Green
} catch {
    Write-ColorOutput "❌ Job creation failed: $($_.Exception.Message)" $Red
}

# Test 6: Get Jobs
Write-ColorOutput "📋 Fetching jobs..." $Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/jobs" -Method GET -Headers $headers
    $jobsData = $response.Content | ConvertFrom-Json
    Write-ColorOutput "✅ Retrieved $($jobsData.total) jobs" $Green
} catch {
    Write-ColorOutput "❌ Failed to fetch jobs: $($_.Exception.Message)" $Red
}

Write-ColorOutput "🎉 API testing completed!" $Green
```

**Run the test script:**
```powershell
.\test-api.ps1
```

## 🚢 Deployment

The API server can be deployed independently of the frontend:

### Production Deployment Options

**Railway:**
```bash
# Deploy to Railway
railway login
railway link
railway up
```

**Heroku:**
```bash
# Deploy to Heroku
heroku create your-api-name
git push heroku main
```

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8000
CMD ["npm", "start"]
```

**Vercel (Serverless):**
```bash
# Deploy as serverless functions
vercel --prod
```

### Environment Variables for Production

```env
# Database (Production)
DB_HOST=your-prod-db-host
DB_PORT=5432
DB_NAME=vevago_prod
DB_USER=vevago_prod_user
DB_PASSWORD=your-secure-password

# Authentication (Generate a secure secret)
JWT_SECRET=your-super-secure-random-jwt-secret-key

# Email (Production)
RESEND_API_KEY=your-production-resend-key

# Frontend (Production URLs)
FRONTEND_URL=https://yourapp.com
ALLOWED_ORIGINS=https://yourapp.com,https://app.yourapp.com

# Server
API_PORT=8000
NODE_ENV=production

# Future Features
GOOGLE_MAPS_API_KEY=your-google-maps-key
STRIPE_SECRET_KEY=your-stripe-secret
```

## 🔧 API Architecture

### Project Structure
```
api-server/
├── server.js           # Main Express server
├── routes/             # API route handlers
│   ├── auth.js        # Authentication endpoints
│   ├── jobs.js        # Job management
│   ├── clients.js     # Client management
│   ├── services.js    # Service catalog
│   ├── subscriptions.js # Recurring jobs
│   ├── companies.js   # Company management
│   ├── leads.js       # Lead generation
│   ├── users.js       # User management
│   └── future.js      # Future features
├── utils/
│   └── database.js    # Database connection
├── package.json       # Dependencies
├── README.md          # This documentation
└── env.example        # Environment template
```

### Key Design Principles

1. **RESTful API**: Standard HTTP methods and status codes
2. **JWT Authentication**: Stateless authentication
3. **Multi-tenant**: Company-based data isolation
4. **Future-proof**: Extensible for mobile apps and integrations
5. **Error handling**: Consistent error responses
6. **Validation**: Input validation on all endpoints
7. **Documentation**: Self-documenting API with examples

## 🤝 Contributing

1. **Follow existing patterns**: Use the established route structure and error handling
2. **Add comprehensive tests**: Test all new endpoints thoroughly
3. **Update documentation**: Keep this README current with new features
4. **Security first**: Validate all inputs and check permissions
5. **Performance**: Consider database query optimization
6. **Logging**: Add appropriate logging for debugging

## 📄 License

MIT License - See LICENSE file for details

---

## 🎯 Quick Reference

**Base URL:** `http://localhost:8000/api`

**Authentication:** `Authorization: Bearer <token>`

**Content-Type:** `application/json`

**Test User Creation:**
```powershell
# Register and get token
$registerData = @{ firstName="Test"; lastName="User"; email="test@example.com"; password="password123" } | ConvertTo-Json
$userData = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $registerData -ContentType "application/json" | ConvertFrom-Json
$token = $userData.token
```

This API is your foundation for building web apps, mobile apps, and future integrations. Start testing and let me know what features you'd like to add next! 🚀
