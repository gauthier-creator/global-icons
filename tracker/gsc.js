const { google } = require('googleapis');

const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:globalicons.io';

function getAuthClient() {
  const rawKey = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!rawKey) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON env var manquante');
  }
  let credentials;
  try {
    credentials = JSON.parse(rawKey);
  } catch (e) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON invalide (JSON parse échoué)');
  }
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchQueries({ rangeDays = 30, rowLimit = 1000 } = {}) {
  const auth = getAuthClient();
  const webmasters = google.webmasters({ version: 'v3', auth });

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - rangeDays);

  const res = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: toISODate(start),
      endDate: toISODate(end),
      dimensions: ['query'],
      rowLimit,
      dataState: 'all'
    }
  });

  const rows = res.data.rows || [];
  return {
    startDate: toISODate(start),
    endDate: toISODate(end),
    rangeDays,
    fetchedAt: new Date().toISOString(),
    keywords: rows.map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position
    }))
  };
}

module.exports = { fetchQueries };
