# Test Data Generation Script

This script generates comprehensive test data for PathPilo to make the platform look "alive" with realistic data for screenshots and demos.

## What It Creates

- **500 Clients**: Mix of individuals (60%) and companies (40%) with realistic Danish names, addresses, and contact information
- **500 Subscriptions**: Each client gets a subscription with varying recurrence patterns:
  - Every week
  - Every 2 weeks
  - Every 4 weeks
  - Every 8 weeks
  - Every month
  - Every 2 months
  - Every 3 months
- **Thousands of Jobs**: 
  - Jobs generated from subscriptions (past year + 3 months future)
  - 200 additional manual jobs
  - All past jobs marked as **completed**
  - All future jobs marked as **scheduled**
- **3 Employees**: Jobs distributed across 3 test users
- **10 Services**: Pre-defined service types (cleaning, maintenance, etc.)

## How to Run

```bash
# Make sure your database is set up and .env is configured
node generate-test-data.js
```

## Requirements

- PostgreSQL database must be running
- `.env` file with database credentials:
  ```
  DB_HOST=localhost
  DB_PORT=5432
  DB_NAME=vevago_local
  DB_USER=vevago_local
  DB_PASSWORD=password123
  ```

## What Happens

1. The script finds or creates a test company
2. Creates/finds 3 employee users
3. Creates 10 services if they don't exist
4. Generates 500 clients with realistic data
5. Creates 500 subscriptions with varying patterns
6. Generates jobs from subscriptions (past = completed, future = scheduled)
7. Creates 200 additional manual jobs
8. All jobs are distributed across the 3 employees

## Notes

- The script is **idempotent** - it won't duplicate data if run multiple times
- Past jobs (before today) are marked as `completed`
- Future jobs (after today) are marked as `scheduled`
- Jobs are distributed evenly across the 3 test users
- All data uses realistic Danish names, addresses, and phone numbers

## Time to Complete

Depending on your database performance, this script takes approximately:
- 2-5 minutes to complete
- Generates ~5000-10000+ jobs total

## After Running

Your platform will be populated with:
- ✅ 500 active clients
- ✅ 500 active subscriptions
- ✅ Thousands of completed jobs (past)
- ✅ Hundreds of scheduled jobs (future)
- ✅ Realistic distribution across 3 employees
- ✅ Ready for screenshots and demos!

## User Credentials

The script creates 3 test users:
- `employee1@test.com` / `password123`
- `employee2@test.com` / `password123`
- `employee3@test.com` / `password123`

You can log in with any of these accounts to see the generated data.
