/**
 * MEDIUM STATS SCRAPER v3 — @billfordx
 * ─────────────────────────────────────────────────────────────────
 * HOW TO USE:
 * 1. Go to: https://medium.com/me/stats
 * 2. Wait for the page to fully load (actual article titles visible)
 * 3. Open Dev Tools: F12 → Console tab
 * 4. Paste this entire script and press Enter
 * 5. Watch the console for progress. CSV downloads automatically.
 * ─────────────────────────────────────────────────────────────────
 */

(async function () {
  'use strict';

  const xsrf   = window.__PRELOADED_STATE__?.session?.xsrf;
  const userId = window.__APOLLO_STATE__?.['ROOT_QUERY']?.viewer?.__ref?.replace('User:', '');

  if (!xsrf || !userId) {
    alert('Could not find session. Make sure you are on medium.com/me/stats while logged in.');
    return;
  }

  console.log(`✓ Session OK. User: ${userId}`);

  // ── Step 1: Probe which fields actually exist ─────────────────
  // We use a minimal query first to discover the schema
  const probeQuery = `
    query Probe($userId: ID!) {
      user(id: $userId) {
        postsConnection(first: 1, after: "", orderBy: { publishedAt: DESC }, filter: { published: true }) {
          edges {
            node {
              id
              title
              firstPublishedAt
              virtuals {
                totalClapCount
                recommendsCount
                readingTime
              }
              totalStats {
                views
                reads
                upvotes
              }
              mediumUrl
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const gql = async (query, variables = {}) => {
    const r = await fetch('https://medium.com/_/graphql', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Xsrf-Token': xsrf,
        'Apollo-Require-Preflight': 'true',
      },
      body: JSON.stringify({ query, variables }),
    });
    return r.json();
  };

  // Probe to see what fields are available
  console.log('Probing API schema...');
  const probe = await gql(probeQuery, { userId });

  if (probe.errors) {
    console.log('Probe errors (expected — learning schema):', probe.errors.map(e => e.message));
  }
  if (probe.data?.user?.postsConnection?.edges?.[0]) {
    console.log('Probe node sample:', JSON.stringify(probe.data.user.postsConnection.edges[0].node, null, 2));
  }

  // ── Step 2: Build working query from probe results ────────────
  // Strip any fields that errored, keep what worked
  const probeErrors = new Set((probe.errors || []).map(e => {
    const m = e.message.match(/field "(\w+)"/i);
    return m ? m[1].toLowerCase() : '';
  }));

  const hasVirtuals   = !probeErrors.has('virtuals');
  const hasTotalStats = !probeErrors.has('totalstats');
  const hasMediumUrl  = !probeErrors.has('mediumurl');

  console.log(`Schema probe: virtuals=${hasVirtuals}, totalStats=${hasTotalStats}, mediumUrl=${hasMediumUrl}`);

  const fullQuery = `
    query Stats($userId: ID!, $after: String!) {
      user(id: $userId) {
        postsConnection(first: 25, after: $after, orderBy: { publishedAt: DESC }, filter: { published: true }) {
          edges {
            node {
              id
              title
              firstPublishedAt
              ${hasTotalStats ? `totalStats { views reads }` : ''}
              ${hasVirtuals ? `virtuals { totalClapCount recommendsCount }` : ''}
              ${hasMediumUrl ? `mediumUrl` : ''}
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  // ── Step 3: Paginate through all posts ───────────────────────
  const allPosts = [];
  let cursor = '';
  let page   = 1;

  while (true) {
    console.log(`  Page ${page} (cursor: "${cursor.slice(0, 20)}...")...`);

    const json = await gql(fullQuery, { userId, after: cursor });

    if (json.errors) {
      console.error('Query errors:', json.errors);
      // Log full field list from error for debugging
      json.errors.forEach(e => console.error(' →', e.message));
      break;
    }

    const conn = json?.data?.user?.postsConnection;
    if (!conn) {
      console.error('Unexpected shape:', JSON.stringify(json).slice(0, 400));
      break;
    }

    for (const { node } of (conn.edges || [])) {
      if (!node) continue;
      allPosts.push({
        title:      node.title || '(no title)',
        published:  node.firstPublishedAt
                      ? new Date(node.firstPublishedAt).toISOString().slice(0, 10)
                      : '',
        views:      node.totalStats?.views      ?? '',
        reads:      node.totalStats?.reads      ?? '',
        read_ratio: (node.totalStats?.views && node.totalStats?.reads)
                      ? ((node.totalStats.reads / node.totalStats.views) * 100).toFixed(1) + '%'
                      : '',
        claps:      node.virtuals?.totalClapCount   ?? '',
        recommends: node.virtuals?.recommendsCount  ?? '',
        url:        node.mediumUrl || `https://medium.com/p/${node.id}`,
        post_id:    node.id,
      });
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    page++;
    await new Promise(r => setTimeout(r, 350));
  }

  if (allPosts.length === 0) {
    console.error('No posts retrieved. Check errors above.');
    alert('No data retrieved — check the browser console and share the output with Claude.');
    return;
  }

  // ── Step 4: Fetch earnings separately (different query) ──────
  // Medium tracks earnings via the partner program endpoint
  console.log(`\nFetching earnings data...`);
  const earningsQuery = `
    query Earnings($userId: ID!) {
      user(id: $userId) {
        postsConnection(first: 25, after: "", orderBy: { lifetimeEarnings: DESC }, filter: { published: true }) {
          edges {
            node {
              id
              earnings {
                total { units nanos currencyCode }
              }
            }
          }
        }
      }
    }
  `;

  const earningsMap = {};
  try {
    const eJson = await gql(earningsQuery, { userId });
    if (!eJson.errors) {
      for (const { node } of (eJson?.data?.user?.postsConnection?.edges || [])) {
        if (node?.earnings?.total) {
          const { units = 0, nanos = 0 } = node.earnings.total;
          earningsMap[node.id] = (units + nanos / 1e9).toFixed(2);
        }
      }
      console.log(`  Got earnings for ${Object.keys(earningsMap).length} posts`);
    } else {
      console.warn('Earnings query errors:', eJson.errors.map(e => e.message));
    }
  } catch (e) {
    console.warn('Earnings fetch failed (non-fatal):', e.message);
  }

  // Merge earnings into posts
  allPosts.forEach(p => {
    p.earnings_usd = earningsMap[p.post_id] ?? '0.00';
  });

  // ── Step 5: CSV download ──────────────────────────────────────
  const escape = v => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ['title', 'published', 'views', 'reads', 'read_ratio', 'claps', 'recommends', 'earnings_usd', 'url'];

  const csv = [
    headers.join(','),
    ...allPosts.map(p => headers.map(h => escape(p[h])).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'medium_stats.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ── Summary ───────────────────────────────────────────────────
  const totalViews = allPosts.reduce((s, p) => s + (Number(p.views) || 0), 0);
  const top5 = [...allPosts].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 5);

  console.log(`\n✅ Done! ${allPosts.length} articles → medium_stats.csv`);
  console.log(`📊 Total lifetime views: ${totalViews.toLocaleString()}`);
  console.log('🏆 Top 5 by views:');
  top5.forEach((p, i) => console.log(`  ${i+1}. ${(Number(p.views)||0).toLocaleString()} views — ${p.title}`));
  console.log('\nUpload medium_stats.csv to Claude.');

})();
