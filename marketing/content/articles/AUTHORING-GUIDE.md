# PathPilo Academy — Article authoring guide (for Claude)

This is the complete instruction set for writing articles for the PathPilo
marketing blog. Follow it exactly and the article will render beautifully, rank
well, and link into the rest of the site automatically.

**One article = one `.mdx` file** in `marketing/content/articles/`. The filename
(without `.mdx`) becomes the URL slug, e.g. `cut-drive-time.mdx` →
`https://pathpilo.com/articles/cut-drive-time`.

---

## 0. The workflow in 4 steps

1. **Read `ARTICLE-INDEX.md`** (in this folder) to see every existing article and
   its URL. You'll link to a few of these. _If it looks stale, it is regenerated
   with `npm run articles:index` and automatically before every build._
2. **Create a new file** `marketing/content/articles/<slug>.mdx`. Use a short,
   keyword-rich, lowercase-dashed slug.
3. **Write the frontmatter + body** using the rules below.
4. Done. The listing page, category page, tag pages, related articles, carousel,
   sitemap, and SEO tags all update on their own.

> Never edit `ARTICLE-INDEX.md` by hand and never invent article URLs — only link
> to slugs that appear in that index.

---

## 1. Frontmatter reference

Frontmatter is the YAML block at the very top of the file between `---` lines.

| Field | Required | What it does |
| --- | --- | --- |
| `title` | ✅ | The H1 + default `<title>`. Clear and specific, ~50–60 chars. |
| `description` | ✅ | Card text + default meta description. 120–160 chars, sells the click. |
| `category` | ✅ | Exactly one category slug (see §2). Controls colour + archive page. |
| `date` | ✅ | `YYYY-MM-DD` publish date. Drives ordering (newest first). |
| `tags` | ⭐ | 2–5 tag slugs (see §3). Powers related articles + tag pages. |
| `author` | ⭐ | Display name, e.g. `"The PathPilo Team"`. |
| `authorRole` | ⭐ | Small label next to the author, e.g. `"Route planning"`. |
| `image` | ⭐ | Cover image path, e.g. `/images/articles/foo.jpg`. Falls back to a branded gradient if missing. |
| `imageAlt` | ⭐ | Alt text for the cover image (accessibility + SEO). |
| `slug` | — | Override the URL. Defaults to the filename. |
| `updated` | — | `YYYY-MM-DD` of last meaningful edit. |
| `featured` | — | `true` pins the article to the big hero slot on `/articles`. Only one article should set this. |
| `draft` | — | `true` hides it from the site and sitemap while you write. |
| `seoTitle` | — | Overrides `title` for search engines only. |
| `seoDescription` | — | Overrides `description` for search engines only. |

✅ = required, ⭐ = strongly recommended.

---

## 2. Categories (pick exactly one)

Use the **slug** in frontmatter (`category: "invoicing"`), not the label.

| Slug | Label | Use it for |
| --- | --- | --- |
| `getting-started` | Getting Started | Onboarding, setup, first-time-user topics |
| `route-planning` | Route Planning | Routing, drive time, fuel, ETAs, dispatch |
| `scheduling` | Scheduling & Jobs | Calendars, recurring jobs, day planning |
| `invoicing` | Invoicing & Payments | Invoices, quotes, payments, tax/VAT, cash flow |
| `leads-marketing` | Leads & Marketing | Lead gen, online booking, reviews, local SEO |
| `team-management` | Team Management | Hiring, scheduling staff, time tracking |
| `business-growth` | Business Growth | Pricing, retention, scaling, operations |
| `product-updates` | Product Updates | New features, release notes |

To add a new category, edit `marketing/app/lib/blog/taxonomy.ts` **and** the
`CATEGORY_LABELS` map in `marketing/scripts/build-article-index.js`.

---

## 3. Tags (pick 2–5)

Tags are lowercase-dashed. You may use any tag you like — unknown tags still work
and render as a title-cased label — but prefer this curated list so related
articles connect well. Having lots of tags is fine.

**Route & scheduling:** `route-optimization`, `fuel-savings`, `gps-tracking`,
`live-eta`, `multi-stop`, `recurring-jobs`, `scheduling`, `calendar-management`,
`time-management`, `seasonal-work`

**Invoicing & money:** `invoicing`, `quotes`, `payment-reminders`, `cash-flow`,
`vat`, `pricing`, `pricing-strategy`

**Leads & marketing:** `lead-generation`, `online-booking`, `google-reviews`,
`local-seo`, `customer-retention`, `follow-up`, `referrals`

**Team:** `hiring`, `team-scheduling`, `time-tracking`, `field-team`

**Growth & ops:** `business-growth`, `productivity`, `automation`, `crm`,
`mobile-app`, `customer-experience`

**Industries:** `cleaning`, `landscaping`, `lawn-care`, `plumbing`, `hvac`,
`electrical`, `pest-control`, `window-cleaning`, `pool-service`, `handyman`

To give a new tag a nice display name, add it to `BLOG_TAG_LABELS` in
`taxonomy.ts` (optional).

---

## 4. SEO rules (always on)

- **Title**: put the main keyword near the front. ~50–60 chars. Use `seoTitle`
  if the on-page `title` needs to read differently from the search title.
- **Description / seoDescription**: 120–160 chars, includes the keyword, written
  as a benefit. This is the snippet people click in Google.
- **First paragraph**: mention the main keyword naturally in the first 1–2
  sentences.
- **Headings**: one idea per `##`. Use real, descriptive headings (they become
  the table of contents and anchor links).
- **Length**: aim for **900–1,800 words**. Long enough to be useful, not padded.
- **Internal links**: 2–4 per article (see §7). This is the biggest on-site SEO
  lever you control.
- **External links**: 1–2 to authoritative, non-competitor sources when it adds
  credibility. They open in a new tab automatically.
- **Images**: always set `imageAlt` and `<Figure>` `alt` text.
- **Key takeaways**: start with a `<KeyTakeaways>` box — great for featured
  snippets.

---

## 5. Recommended article structure

1. **Intro** (2–3 short paragraphs): the problem + the promise. Keyword in the
   first sentence or two.
2. **`<KeyTakeaways>`**: 3–5 bullets summarising the article.
3. **Body**: 3–6 `##` sections. Mix in components (info boxes, tables, columns)
   so it never reads as a wall of text.
4. **A quote or stat block** for social proof / impact.
5. **Wrap-up**: a clear next step.
6. **`<CTABox />`**: the call to action.

Do **not** write an `# H1` — the page renders `title` as the H1. Start sections
at `##`.

---

## 6. Markdown + component reference

### 6.1 Text basics

```md
## Section heading
### Sub-heading

Normal paragraph with **bold** and a [link](/articles/some-slug).

- Bullet list item
- Another item

1. Numbered step
2. Next step

> A plain blockquote (use the <Quote> component for a styled pull-quote).

`inline code`
```

### 6.2 Tables (GFM syntax)

Tables are styled automatically (rounded border, header shading, zebra rows, and
horizontal scroll on mobile). Use them for comparisons and structured data.

```md
| Column A | Column B | Column C |
| --- | --- | --- |
| Row 1 cell | value | value |
| Row 2 cell | value | value |
```

Rules: the second line (`| --- | --- |`) is required and defines the columns.
Keep cells short. First column is treated as a row label.

### 6.3 `<InfoBox>` — callouts

Use for tips, warnings, and "good to know" asides. `type` is `info` (default),
`tip`, `warning`, or `success`. `title` is optional (each type has a default).

```mdx
<InfoBox type="tip" title="The loop rule">
Start with the cluster furthest out, then work your way back to base.
</InfoBox>
```

**When:** to highlight a single actionable nugget without breaking the flow.

### 6.4 `<KeyTakeaways>` — summary box

```mdx
<KeyTakeaways>
- First takeaway
- Second takeaway
- Third takeaway
</KeyTakeaways>
```

**When:** once, near the top. 3–5 bullets.

### 6.5 `<Quote>` — pull-quote / testimonial

```mdx
<Quote author="Maria" role="Cleaning company owner">
Turning on auto-routing found us a whole extra clean per van, per day.
</Quote>
```

`author` and `role` are optional. **When:** social proof or a punchy line.

### 6.6 `<Columns>` + `<Column>` — side-by-side boxes

```mdx
<Columns>
  <Column title="Do this">
  - Point one
  - Point two
  </Column>
  <Column title="Not this">
  - Point one
  - Point two
  </Column>
</Columns>
```

**When:** two related lists or a do/don't. Stacks on mobile. (For a clear
pros/cons with colour-coding, prefer `<ProsCons>`.)

### 6.7 `<ProsCons>` — colour-coded comparison

Props are arrays of strings. Titles are optional.

```mdx
<ProsCons
  pros={["Free for a few stops", "You stay in control"]}
  cons={["Breaks down past 5–6 stops", "Hard across multiple staff"]}
  prosTitle="Planning by hand"
  consTitle="Where it falls apart"
/>
```

**When:** weighing two options or showing trade-offs.

### 6.8 `<StatGrid>` + `<Stat>` — impact numbers

```mdx
<StatGrid>
  <Stat value="20–30%" label="Drive time cut by reordering stops" />
  <Stat value="+1 job" label="Extra paid job most teams gain per day" />
  <Stat value="2–3 hrs" label="Daily drive time for an 8-stop day" />
</StatGrid>
```

**When:** to make impact concrete. Best with 3 stats.

### 6.9 `<Figure>` — image with caption

```mdx
<Figure
  src="/images/articles/route-map.jpg"
  alt="A route map with ordered stops"
  caption="Optional caption shown below the image."
/>
```

`src` can be a local path (file in `marketing/public/...`) or a full external URL.
**Always** write meaningful `alt` text. **When:** screenshots and diagrams.

### 6.10 `<CTABox>` — call to action

Defaults to a "Try PathPilo free" CTA. Override any prop.

```mdx
<CTABox
  title="Turn finished jobs into paid invoices"
  text="PathPilo creates invoices from completed jobs and chases late payers for you."
  buttonLabel="Try PathPilo free"
  href="https://app.pathpilo.com/register"
/>
```

**When:** once, at the end. You can use the bare `<CTABox />` for the default.

### 6.11 `<ButtonLink>` — inline button

```mdx
<ButtonLink href="/articles/get-paid-faster-service-invoices">Read the invoicing guide</ButtonLink>
```

**When:** a prominent mid-article link. Use sparingly — normal text links are
better for flow and SEO.

---

## 7. Internal & external linking (the smart part)

Internal links keep readers on the site and are a major ranking signal. We make
this easy:

1. **Before writing**, open `ARTICLE-INDEX.md` (this folder). It lists every
   published article with its title, URL, category, and tags.
2. While writing, **link to 2–4** genuinely relevant articles using their exact
   URL, e.g. `[recurring jobs](/articles/recurring-jobs-predictable-revenue)`.
   Prefer same-category or shared-tag articles — those also surface in the
   "Read next" box, reinforcing the cluster.
3. You can also link to product/feature pages: `/features/routeplanning`,
   `/features/subscriptions`, `/features/team`, `/pricing`.
4. **External links**: add 1–2 to credible, non-competitor sources when it helps
   (a statistic, a standards body, gov guidance). Any link starting with `http`
   that isn't `pathpilo.com` automatically opens in a new tab with
   `rel="noopener noreferrer"`.

> Tip for the human: paste the contents of `ARTICLE-INDEX.md` into the chat when
> you ask Claude to write a new article. That's all Claude needs to link
> correctly.

Don't over-link. 2–4 internal links spread naturally through the body is the
sweet spot — the same as Jobber Academy and Shipmondo do.

---

## 8. Images

**Cover images are auto-generated.** Set `image: "/images/articles/<your-slug>.svg"`
and a branded, route-themed cover with your title is created automatically by
`npm run articles:covers` (also run before every build). You don't need to make
artwork — just match the filename to your slug.

To use a real photo instead:

- Put the file in `marketing/public/images/articles/` and point `image:` at it,
  e.g. `/images/articles/my-photo.jpg`. The generated `.svg` is then ignored.
- Recommended cover ratio: **16:9**, ~1200×675px, JPG/PNG/WebP.
- If you omit `image` entirely, cards and the hero fall back to a branded gradient.
- External image URLs work too (e.g. in `<Figure>`), useful for stock photos.

---

## 9. Pre-publish checklist

- [ ] Frontmatter has `title`, `description`, `category`, `date`.
- [ ] `category` is a valid slug from §2.
- [ ] 2–5 sensible `tags`.
- [ ] Keyword appears in the title, first paragraph, and description.
- [ ] Starts with `<KeyTakeaways>`; no manual `# H1`.
- [ ] 2–4 internal links to real slugs from `ARTICLE-INDEX.md`.
- [ ] At least one rich component (table, InfoBox, Columns, ProsCons, or Stats).
- [ ] Ends with a `<CTABox>`.
- [ ] `imageAlt` and all `<Figure>` `alt` text written.
- [ ] 900–1,800 words.

---

## 10. Minimal starting point

Copy `_TEMPLATE.mdx` in this folder, rename it to your slug, and fill it in.
Look at the four example articles (`cut-drive-time-route-planning.mdx`,
`get-paid-faster-service-invoices.mdx`, `recurring-jobs-predictable-revenue.mdx`,
`organise-service-business-weekend.mdx`) for complete, real examples of every
component and the linking style.
