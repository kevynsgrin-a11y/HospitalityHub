# Layer B hand-inspection (Batch 0, in progress)

Robots.txt fetched 2026-08-20. "Permitted" below means listing pages are not disallowed for a
generic well-behaved crawler (`User-agent: *`); AI-training-specific agents (GPTBot, ClaudeBot,
CCBot, Google-Extended, Bytespider, etc.) are separately blocked on several hosts, which does not
affect a job-ingestion crawler with its own UA but is noted.

| Domain | robots.txt status | Crawl-delay | Notes |
| --- | --- | --- | --- |
| harri.com | Permitted (only a few specific employer paths disallowed) | none | Sitemap present |
| poachedjobs.com | Permitted (`/netx-assets/` only); many SEO/AI bots blocked wholesale | none | Search URL 302s for plain curl — needs session/JS; listing detail pages to be inspected in-browser |
| culinaryagents.com | Permitted for `User-agent: *` with content-signal `search=yes, ai-train=no` | none | Search page serves `SearchResultsPage` JSON-LD; detail pages to be checked for `JobPosting` |
| careers.toasttab.com (Toast Hiring) | Permitted (API/candidate paths disallowed) | **5s** | Sitemap present; crawler must honor 5s delay |
| www.workstream.us | Permitted (marketing/preview paths disallowed) | none | Job pages live on per-employer subdomains/paths — seed discovery needed |
| www.7shifts.com | Permitted; content-signal `search=yes, ai-input=yes, ai-train=no` | none | Marketing site; actual job boards on separate hosting — seed discovery needed |

Still to record per §Batch 0 task 6 (per domain): JobPosting JSON-LD present on detail pages,
count of visible San Diego FOH listings, and overlap with the Layer A API pull (requires Layer A
data first).
