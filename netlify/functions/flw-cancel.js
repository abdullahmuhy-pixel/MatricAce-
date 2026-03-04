// ══════════════════════════════════════════════════════════════════
//  Netlify Serverless Function: flw-cancel
//  Called by the MatricAce app when a student cancels subscription
//  Calls Flutterwave API to stop recurring charge, then syncs Supabase
//
//  Required env vars:
//    FLW_SECRET_KEY       — Flutterwave secret key
//    SUPABASE_URL         — https://xdwexkmbhzkjivpayyrp.supabase.co
//    SUPABASE_SERVICE_KEY — Supabase service_role key
// ══════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseSelect(table, col, val) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&select=*`,
    {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length > 0 ? rows[0] : null;
}

async function updateProgressField(uid, fields) {
  const row = await supabaseSelect('progress', 'uid', uid);
  const existing = (row && row.data) ? row.data : {};
  const merged = Object.assign({}, existing, fields, { lastSaved: Date.now() });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/progress`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify({ uid, data: merged }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase update failed: ${err}`);
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { subscriptionId, uid, txRef, premiumEndsAt } = body;

  if (!subscriptionId) {
    console.warn('[Cancel] No subscriptionId provided for uid:', uid);
    if (uid && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        await updateProgressField(uid, {
          cancelPending:  true,
          cancelledAt:    Date.now(),
          apiCancelled:   false,
          premiumEndsAt:  premiumEndsAt || (Date.now() + 30*86400000),
        });
      } catch(e) {
        console.warn('[Cancel] Supabase update failed:', e.message);
      }
    }
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        warning: 'No subscription ID — Flutterwave billing not stopped automatically. Please cancel manually in your Flutterwave dashboard.',
      }),
    };
  }

  const FLW_SECRET = process.env.FLW_SECRET_KEY;
  if (!FLW_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'FLW_SECRET_KEY not configured' }) };
  }

  console.log(`[Cancel] Cancelling subscription ${subscriptionId} for uid=${uid}`);

  try {
    const cancelRes = await fetch(
      `https://api.flutterwave.com/v3/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${FLW_SECRET}`,
          'Content-Type':  'application/json',
        },
      }
    );

    const cancelData = await cancelRes.json();
    console.log('[Cancel] FLW response:', JSON.stringify(cancelData));

    const flwSuccess = cancelRes.ok &&
      (cancelData.status === 'success' || cancelData.data?.status === 'cancelled');

    if (uid && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        await updateProgressField(uid, {
          cancelPending:  true,
          cancelledAt:    Date.now(),
          apiCancelled:   flwSuccess,
          premiumEndsAt:  premiumEndsAt || (Date.now() + 30*86400000),
        });
        console.log(`[Cancel] Supabase updated for uid=${uid}`);
      } catch(e) {
        console.warn('[Cancel] Supabase update failed (non-fatal):', e.message);
      }
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: {
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            tx_ref:          txRef || null,
            subscription_id: String(subscriptionId),
            uid:             uid || 'unknown',
            event_type:      flwSuccess ? 'cancelled_via_api' : 'cancel_attempted',
            status:          flwSuccess ? 'cancelled' : 'cancel_failed',
            raw:             JSON.stringify(cancelData).slice(0, 1000),
            created_at:      new Date().toISOString(),
          }),
        });
      } catch(e) {
        console.warn('[Cancel] Could not log to subscriptions table:', e.message);
      }
    }

    if (flwSuccess) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          success: true,
          message: 'Subscription cancelled successfully on Flutterwave and synced to database.',
          flutterwaveStatus: cancelData.data?.status || 'cancelled',
        }),
      };
    } else {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          success: false,
          warning: 'Flutterwave cancellation may not have completed. Cancellation recorded locally.',
          error:   cancelData.message || 'Unknown Flutterwave error',
          details: cancelData,
        }),
      };
    }

  } catch(err) {
    console.error('[Cancel] Unexpected error:', err);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Internal error', details: err.message }),
    };
  }
};
