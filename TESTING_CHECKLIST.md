# PathPilo QA Checklist — Daily-Admin Roleplay Scenarios

Use against the **RouteTest Field Services** stress-test company
(`/routetest-field`, login `admin@routetest.co.uk` / `demo1234`), seeded with
a full year of 2026: 6 employees, ~1,800 clients, ~6,000 jobs, ~1,340 routes,
90 subscriptions, 180 random employee leave days, and 8 bank holidays. Re-seed
any time with `node route-stress-seed.js`.

Each scenario is written as something that would actually happen to an admin
running this business — play the role, don't just click through. Tick a box,
note anything broken/confusing next to it, move on.

## Core scenarios (10) — the daily basics

- [ ] **1. "Can you move me to Thursday?"** — A client calls to push their job from
      today to later in the week. Find the job, reschedule it, confirm it
      shows up correctly on the new day's route and disappears from the old one.
- [ ] **2. "James is swamped, give it to Sarah."** — Reassign a job from one
      employee to another mid-week. Confirm the route/map for both employees
      updates, and travel time/order recalculates sensibly.
- [ ] **3. "Cancel it, they've moved house."** — Cancel a scheduled job. Decide
      what should happen to it on the route (removed vs. shown greyed out) and
      confirm it doesn't get invoiced.
- [ ] **4. New customer signs up.** — Add a brand-new client from scratch
      (via the map search or client list) and book their first job.
- [ ] **5. "Can you squeeze me in today?"** — Add a same-day ad-hoc job onto an
      employee's already-planned route and see how it slots in.
- [ ] **6. Set up a regular customer.** — Create a recurring subscription
      (e.g. every 2 weeks) and confirm future occurrences appear on the
      calendar/route on the right dates automatically.
- [ ] **7. End of a job.** — Mark a completed job as done, then generate and
      send the invoice for it.
- [ ] **8. "This route is all over the place."** — After adding a couple of
      jobs, use reorder/drag and the optimize (AI or draw) tool to tidy up an
      employee's route, then save it.
- [ ] **9. Employee books a week off.** — Add annual leave for an employee and
      confirm the system stops you from double-booking them that week.
- [ ] **10. "Where's Mrs. Patel's next appointment?"** — Search for a client by
      name from the global search, open their card, and check their upcoming
      and past job history is right.

## Edge cases (20) — the stuff that actually breaks systems

- [ ] **1. Double-booked by accident.** Manually schedule two jobs for the same
      employee with overlapping times. Does anything warn you before you save?
- [ ] **2. "Just this once, not every time."** Reschedule a single occurrence
      of a recurring subscription without changing the whole series — confirm
      it detaches cleanly and the series keeps going for future dates.
- [ ] **3. Cancel a job that's already been invoiced.** What happens to the
      invoice — does it warn you, orphan it, or auto-void it?
- [ ] **4. Reassign a job to someone who's on leave that exact day.** Does the
      system flag the conflict, or silently let you create it?
- [ ] **5. Schedule a job on a bank holiday or a weekend.** Is that allowed,
      blocked, or just quietly wrong?
- [ ] **6. Two nearly-identical clients.** Search a common name/postcode that
      matches multiple similar clients — can you tell them apart, and is
      there a way to merge/flag a duplicate?
- [ ] **7. Delete a client who has future jobs booked.** What happens to those
      jobs — deleted, orphaned, or blocked with a warning?
- [ ] **8. Change a job's address mid-route.** Edit the address on a job
      that's already part of a planned/optimized route — does the map/ETA
      refresh, or does it show stale directions until you reopen it?
- [ ] **9. A "flexible" job finally gets placed.** Find a job marked flexible/
      fixed-weekday scheduling and confirm the optimizer actually respects
      that constraint when it slots it into a day.
- [ ] **10. Two people editing the same route at once.** Open the same day's
      route as two different admins/tabs, edit in both, save both — who wins,
      and does anyone lose their change silently?
- [ ] **11. Field vs. office live sync.** Have an employee mark a job complete
      (or imagine doing so on mobile) while you're viewing that same route as
      admin — does your screen catch up without a manual refresh?
- [ ] **12. Employee calls in sick — this morning.** Employee is already
      scheduled for today with a full route; mark them off sick and bulk-move
      or reassign the rest of today's jobs before they're due on-site.
- [ ] **13. "Actually, in an hour instead."** A client asks to move a job
      that's scheduled for later today to a different time slot, same day —
      confirm the route re-sequences and travel time still makes sense.
- [ ] **14. Very early or very late job.** Try scheduling a job right at the
      edge of (or slightly outside) an employee's configured work hours —
      does it warn you or just accept it silently?
- [ ] **15. One-off job on top of a subscription day.** A subscription client
      also books a separate one-off extra job on the same day as their
      recurring visit — confirm the week board shows **one merged visit card**
      (combined duration/tasks), and opening it lists both sources with
      dividers (subscription vs one-off / round) without losing either job.
- [ ] **16. Custom price override.** Create a job where you override one
      service's price/duration from its default, complete it, and confirm the
      invoice reflects the override, not the service's normal price.
- [ ] **17. Search by the "wrong" thing.** Find a client using only their
      phone number or postcode instead of their name — confirm search still
      finds them.
- [ ] **18. Undo a mistaken cancellation.** Cancel a job, then change your
      mind and restore it to scheduled — confirm it's back on the route and
      still invoiceable, with no leftover "ghost" state.
- [ ] **19. Left the tab open overnight.** Leave the Jobs page (or map) open
      and idle overnight, come back the next morning, and try to reschedule
      something — confirm you're not hit with an "invalid or expired token"
      error before you can act.
- [ ] **20. A very full day.** Open one of the busiest generated route-days
      (an employee with 10+ jobs) and confirm the day view, map, and
      optimizer all stay usable and don't lag or visually collapse under the
      load.
