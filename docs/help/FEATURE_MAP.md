# Feature Map (Source of Truth)

Use this file as the primary product context for AI writing (Claude/Cursor).
Only include features that are live for customers.

## Product Snapshot

- **Product name (public):** PathPilo
- **Product type:** Field-service planning + dispatch workflow
- **Primary users:** Admin, dispatcher, office manager, team member
- **Main jobs-to-be-done:** Plan daily work, optimize routes, manage recurring work, keep teams aligned

## Core Areas

### Jobs

- Create, edit, and manage jobs for clients
- Assign jobs to team members
- Set date/time windows and job details
- Track job status (including cancelled jobs)

### Day Route Planner

- Build per-user daily routes from assigned jobs
- View route lines, stop order, ETA/drive minutes
- Reorder stops manually
- Auto-optimize route order
- Compare baseline vs edited route outcome (time impact)

### Draw Route (Manual Sequencing)

- Enter draw mode for a focused user route
- Click pins in desired sequence to set stop order
- Apply order once sequencing is complete

### Route Locations (Start/End)

- Optional start/home and end/home waypoints per user/company defaults
- Used in route planning and directions when enabled

### Subscriptions / Recurring Work

- Create recurring job templates
- Materialize recurring items into real jobs for day planning
- Edit recurring setup without losing scheduling intent

### Clients

- Manage client records
- Use client location as coordinate fallback when job lacks own coordinates

### Geocoding + Directions

- Geocode missing coordinates from address
- Directions engine calculates route geometry and travel metrics
- Coordinate quality directly affects route map quality

### Team + Work Hours

- Manage users/employees
- Configure per-user work-hour/location settings for planning context

## Important Behavior Notes

- Route planner map is intended to stay in top-down road view (no tilt/bird's-eye)
- Route fit should center around route coordinates when valid coords are available
- Jobs may have either job coordinates or client fallback coordinates
- Recurring/virtual jobs can differ from fully materialized jobs

## Role Matrix (Draft)

- **Admin:** Full access (settings, planning, subscriptions, users)
- **Dispatcher:** Planning + assignment + route operations
- **Team member:** Assigned-job visibility and operational updates

> Confirm exact permission boundaries before publishing role-based articles.

## Do-Not-Assume Rules for AI

- Do not invent settings, buttons, filters, or workflows
- Do not claim behavior that is not documented here or in validated UI notes
- If unsure, output a `Needs confirmation` section

## Change Log

- 2026-05-27: Initial draft for KB writing workflow
