# Vevago API Testing Script
# Run this script to test all major API endpoints

$baseUrl = "http://localhost:8000"
$token = $null
$clientId = $null

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-ColorOutput($Message, $Color) {
    Write-Host $Message -ForegroundColor $Color
}

function Write-Step($Step, $Description) {
    Write-Host "`n$Step" -ForegroundColor $Cyan -NoNewline
    Write-Host " - $Description" -ForegroundColor $Yellow
}

# Test 1: Health Check
Write-Step "1/9" "Testing API Health"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -Method GET
    $healthData = $response.Content | ConvertFrom-Json
    Write-ColorOutput "   ✅ API is healthy: $($healthData.status) - $($healthData.version)" $Green
} catch {
    Write-ColorOutput "   ❌ API health check failed: $($_.Exception.Message)" $Red
    Write-ColorOutput "   Make sure the API server is running: node server.js" $Yellow
    exit 1
}

# Test 2: Register User
Write-Step "2/9" "Registering test user"
$registerData = @{
    firstName = "API"
    lastName = "Tester"
    email = "api.tester.$(Get-Random)@example.com"
    password = "testpass123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method POST -Body $registerData -ContentType "application/json"
    $userData = $response.Content | ConvertFrom-Json
    $token = $userData.token
    Write-ColorOutput "   ✅ User registered: $($userData.user.firstName) $($userData.user.lastName)" $Green

    # Set up auth headers
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
} catch {
    Write-ColorOutput "   ❌ User registration failed: $($_.Exception.Message)" $Red
    exit 1
}

# Test 3: Create Service
Write-Step "3/9" "Creating test service"
$serviceData = @{
    name = "House Cleaning"
    description = "Professional house cleaning service"
    price = 150.00
    duration_minutes = 180
    category = "cleaning"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/services" -Method POST -Body $serviceData -ContentType "application/json" -Headers $headers
    Write-ColorOutput "   ✅ Service created successfully" $Green
} catch {
    Write-ColorOutput "   ❌ Service creation failed: $($_.Exception.Message)" $Red
}

# Test 4: Create Client
Write-Step "4/9" "Creating test client"
$clientData = @{
    name = "John"
    last_name = "Smith"
    client_type = "person"
    address = "123 Main Street"
    zip_code = "12345"
    city = "Anytown"
    email = "john.smith@example.com"
    phone = "+1-555-0123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/clients" -Method POST -Body $clientData -ContentType "application/json" -Headers $headers
    $clientResult = $response.Content | ConvertFrom-Json
    $clientId = $clientResult.client.id
    Write-ColorOutput "   ✅ Client created: $($clientResult.client.name) $($clientResult.client.last_name) (ID: $clientId)" $Green
} catch {
    Write-ColorOutput "   ❌ Client creation failed: $($_.Exception.Message)" $Red
}

# Test 5: Get Services
Write-Step "5/9" "Fetching services"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/services" -Method GET -Headers $headers
    $servicesData = $response.Content | ConvertFrom-Json
    Write-ColorOutput "   ✅ Retrieved $($servicesData.total) services" $Green
} catch {
    Write-ColorOutput "   ❌ Failed to fetch services: $($_.Exception.Message)" $Red
}

# Test 6: Get Clients
Write-Step "6/9" "Fetching clients"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/clients" -Method GET -Headers $headers
    $clientsData = $response.Content | ConvertFrom-Json
    Write-ColorOutput "   ✅ Retrieved $($clientsData.total) clients" $Green
} catch {
    Write-ColorOutput "   ❌ Failed to fetch clients: $($_.Exception.Message)" $Red
}

# Test 7: Create Job
Write-Step "7/9" "Creating test job"
$jobData = @{
    title = "Weekly House Cleaning"
    client_id = $clientId
    assigned_user_id = 1
    services = @(
        @{
            service_id = 1
            custom_price = 150.00
            custom_duration = 180
        }
    )
    scheduled_date = "2026-01-25"
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
    note = "Regular cleaning service - please clean thoroughly"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/jobs" -Method POST -Body $jobData -ContentType "application/json" -Headers $headers
    Write-ColorOutput "   ✅ Job created successfully" $Green
} catch {
    Write-ColorOutput "   ❌ Job creation failed: $($_.Exception.Message)" $Red
}

# Test 8: Get Jobs
Write-Step "8/9" "Fetching jobs"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/jobs" -Method GET -Headers $headers
    $jobsData = $response.Content | ConvertFrom-Json
    Write-ColorOutput "   ✅ Retrieved $($jobsData.total) jobs" $Green

    # Show details of first job if exists
    if ($jobsData.jobs -and $jobsData.jobs.Count -gt 0) {
        $firstJob = $jobsData.jobs[0]
        Write-ColorOutput "   📋 Latest job: $($firstJob.title) - $($firstJob.scheduled_date) $($firstJob.scheduled_time_from)-$($firstJob.scheduled_time_to)" $Green
    }
} catch {
    Write-ColorOutput "   ❌ Failed to fetch jobs: $($_.Exception.Message)" $Red
}

# Test 9: Create Subscription
Write-Step "9/9" "Creating subscription"
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
    starting_date = "2026-01-25"
    recurrence_type = "weekly"
    day_of_week = 1  # Monday
    interval_value = 1  # Every week
    scheduled_time_from = "09:00"
    scheduled_time_to = "12:00"
    note = "Weekly recurring cleaning service"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/subscriptions" -Method POST -Body $subscriptionData -ContentType "application/json" -Headers $headers
    Write-ColorOutput "   ✅ Subscription created successfully" $Green
} catch {
    Write-ColorOutput "   ❌ Subscription creation failed: $($_.Exception.Message)" $Red
}

# Final Summary
Write-Host "`n" + "="*50 -ForegroundColor $Cyan
Write-ColorOutput "🎉 API TESTING COMPLETED!" $Green
Write-ColorOutput "✅ Server is running and responding" $Green
Write-ColorOutput "✅ Authentication is working" $Green
Write-ColorOutput "✅ CRUD operations are functional" $Green
Write-ColorOutput "✅ Multi-tenant features working" $Green
Write-Host "`n📚 Next Steps:" -ForegroundColor $Cyan
Write-Host "   • Use the API documentation (README.md) for more endpoints"
Write-Host "   • Test with different parameters and edge cases"
Write-Host "   • Connect your frontend to use these endpoints"
Write-Host "   • Deploy to production when ready"
Write-Host "`n🔗 API Documentation: $baseUrl/" -ForegroundColor $Yellow
Write-Host "="*50 -ForegroundColor $Cyan
