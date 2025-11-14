-- Run this in pgAdmin (right-click on "PostgreSQL" server → Query Tool)

-- Step 1: Create the database
CREATE DATABASE vevago_local;

-- Step 2: Connect to the new database (you may need to open a new query window and select vevago_local)

-- Step 3: Create the user (run this while connected to vevago_local or any database)
CREATE USER "vevago.app" WITH PASSWORD 'your_local_password_here';

-- Step 4: Grant privileges
GRANT ALL PRIVILEGES ON DATABASE vevago_local TO "vevago.app";

-- Step 5: Connect to vevago_local and grant schema privileges
\c vevago_local
GRANT ALL ON SCHEMA public TO "vevago.app";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "vevago.app";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "vevago.app";

