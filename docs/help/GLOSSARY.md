# Glossary (Use Exact Terms)

Use these terms consistently in help articles. Avoid mixing synonyms unless listed.

## Product + Navigation

- **PathPilo**: Public product name shown to customers
- **Jobs page**: Main operational page for planning and scheduling
- **Day view**: Single-day route planning mode
- **Week view**: Weekly schedule context

## Planning + Routing

- **Route planner**: Map + route panel workflow for planning stops
- **Route**: Ordered list of jobs for one user on one day
- **Stop**: A single visit/job in a route
- **Draw route**: Manual click-to-sequence mode for stop ordering
- **Optimize route**: Automatic reordering for better driving efficiency
- **Drive minutes**: Estimated travel time for route or route legs
- **ETA**: Estimated time to reach a stop based on route sequence
- **Cancelled job**: Job excluded from active route geometry/metrics

## Scheduling + Recurrence

- **Subscription**: Recurring job template/configuration
- **Virtual/Projected job**: Not yet fully materialized into a standard job row
- **Materialize**: Convert recurring/projection into a real job entry

## Location + Coordinates

- **Job coordinates**: Latitude/longitude stored directly on a job
- **Client coordinates**: Location stored on client record (fallback source)
- **Geocoding**: Turning an address into coordinates
- **Start (home) / End (home)**: Optional route location anchors

## People + Permissions

- **Admin**: Full system access
- **Dispatcher**: Operational planning access
- **Team member**: Assigned-work execution role

## Writing Rules

- Use UI-facing terms first
- Use one term per concept (do not alternate between "task", "stop", and "visit" randomly)
- If backend/internal terms are needed, explain once and return to user-facing wording
