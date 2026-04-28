# medium-stats-getter

A browser console script that pulls your real Medium stats — views, reads, read ratio, and earnings — directly from Medium's internal GraphQL API and downloads them as a CSV.

Medium gives you a data export, but it doesn't include stats. This fills that gap.

---

## Background

Medium's data export contains your posts, claps, highlights, and partner program earnings — but not your actual performance stats (views, reads, read ratio). Those live behind a login wall on `medium.com/me/stats` and aren't included in any official export.

This script runs in your browser console while you're logged in, calls the same GraphQL endpoint Medium's stats page uses, paginates through all your articles, and downloads the results as a CSV you can analyze however you want.

It took three attempts to get working. The full story is in [this Medium article](#) *(link coming)*.

---

## What You Get

A CSV file (`medium_stats.csv`) with one row per published article:

| Column | Description |
|--------|-------------|
| `title` | Article title |
| `published` | Publish date (YYYY-MM-DD) |
| `views` | Lifetime view count |
| `reads` | Lifetime read count |
| `read_ratio` | reads ÷ views, as a percentage |
| `claps` | Clap count (returns 0 — see Known Limitations) |
| `recommends` | Recommend count |
| `earnings_usd` | Partner Program earnings in USD |
| `url` | Article URL |

---

## Usage

**Step 1** — Go to your Medium stats page:
```
https://medium.com/me/stats
```

**Step 2** — Wait for the page to fully load. You should see actual article titles in the table, not gray loading bars. If you see loading bars, wait a few seconds and reload.

**Step 3** — Open your browser's developer tools:
- Chrome / Edge: `F12` or `Ctrl+Shift+I` (Mac: `Cmd+Option+I`)
- Firefox: `F12` or `Ctrl+Shift+I`
- Safari: Enable developer tools first via Preferences → Advanced → Show Develop menu, then `Cmd+Option+I`

**Step 4** — Click the **Console** tab.

**Step 5** — Copy the entire contents of `medium_stats_scraper_v3.js` and paste it into the console. Press Enter.

**Step 6** — Watch the console output. It will log progress as it paginates through your articles. When it's done, `medium_stats.csv` downloads automatically.

Depending on how many articles you have, this takes 5–30 seconds.

---

## What It Does (and Doesn't Do)

**Does:**
- Run entirely in your browser using your existing session
- Call `medium.com/_/graphql` — the same endpoint Medium's own stats page uses
- Paginate automatically through all your published articles
- Download a CSV to your local machine

**Does not:**
- Store, transmit, or log your data anywhere
- Require an API key, OAuth, or any external service
- Modify your account or posts in any way
- Scrape the DOM (that was v1, it didn't work — see below)

---

## Why Three Versions

**v1** tried to scrape the rendered HTML table on `medium.com/me/stats`. This failed because Medium's stats page lazy-loads via React — the table shows skeleton loading placeholders until the JavaScript populates it, and by the time you paste a script into the console, the DOM may or may not be fully populated. Unreliable.

**v2** switched to querying the GraphQL API directly, which is the right approach. But it had two bugs: the `after` pagination argument is required (not optional) and must be an empty string on the first page, not `null` — Medium returns a 400 error otherwise. Also used a field name (`fans`) that doesn't exist in the schema.

**v3** fixed both issues and added a probe query that checks which fields the API actually returns before running the full paginated query. This makes it more resilient to future schema changes.

---

## Known Limitations

**Claps received** — The GraphQL API returns a `virtuals.totalClapCount` field, but it appears to return 0 for all articles in the stats context. Claps you've given to others are in your data export. Claps you've received don't seem to be accessible via this method.

**Earnings accuracy** — Earnings figures come from a separate query sorted by lifetime earnings. Only the top earners may be captured if you have more than 25 articles with earnings. For a complete earnings picture, use your Partner Program export files.

**API stability** — This uses an undocumented internal API. Medium can change their GraphQL schema at any time without notice, which would break this script. If you get errors, check the console output and open an issue.

**Non-published content** — The script only returns published articles. Drafts, responses, and short posts that don't appear in the Stats view are not included.

---

## Analyzing the Output

Once you have the CSV, you can open it in Excel, Google Sheets, or feed it into anything that reads CSVs.

A few metrics worth paying attention to beyond raw views:

**Read ratio** is Medium's primary quality signal. A high read ratio tells the algorithm that people who open your article actually finish it, which drives distribution. Views without read ratio context is close to meaningless for understanding how an article is actually performing.

**Earnings per 100 views** reveal which topics convert to Partner Program revenue. Calculate it as `(earnings / views) * 100`. The spread between categories is often surprising.

---

## Requirements

- A Medium account
- A modern browser (Chrome, Firefox, Edge, Safari)
- Published articles on Medium

No installs. No dependencies. No API keys.

---

## License

CREATIVE COMMONS. Do what you want with it.

---

## Author

[@billfordx](https://billford.io) on Medium  
