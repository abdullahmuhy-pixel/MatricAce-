
// ══════════════════════════════════════════════════════════════════
//  Netlify Serverless Function: flw-webhook
//  Receives ALL Flutterwave payment events and syncs to Supabase
//
//  Set this URL in Flutterwave Dashboard → Settings → Webhooks:
//  https://matricace.netlify.app/.netlify/functions/flw-webhook
//
//  Required env vars in Netlify:
//    FLW_WEBHOOK_HASH   — your secret hash (set in FLW dashboard too)
//    FLW_SECRET_KEY     — your Flutterwave secret key
//    SUPABASE_URL       — https://xdwexkmbhzkjivpayyrp.supabase.co
//    SUPABASE_SERVICE_KEY — from Supabase → Settings → API → service_role key
// ══════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseUpsert(table, data, matchCol = 'uid') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        `resolution=merge-duplicates`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert failed on ${table}: ${err}`);
  }
  return res;
}

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

async function supabasePatch(table, matchCol, matchVal, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase patch failed on ${table}: ${err}`);
  }
  return res;
}

async function updateProgressField(uid, fields) {
  const row = await supabaseSelect('progress', 'uid', uid);
  const existing = (row && row.data) ? row.data : {};
  const merged = Object.assign({}, existing, fields, { lastSaved: Date.now() });
  await supabaseUpsert('progress', { uid, data: merged }, 'uid');
  console.log(`[Webhook] Progress updated for uid=${uid}:`, JSON.stringify(fields));
}

async function logSubscriptionEvent(event, data) {
  try {
    await supabaseUpsert('subscriptions', {
      tx_ref:          data.tx_ref || data.txRef || null,
      subscription_id: String(data.id || data.subscriptionId || ''),
      uid:             data.meta?.uid || data.customer?.email || 'unknown',
      event_type:      event,
      amount:          data.amount || 0,
      currency:        data.currency || 'ZAR',
      plan:            data.payment_plan || data.plan || null,
      customer_email:  data.customer?.email || null,
      customer_name:   data.customer?.name || null,
      status:          data.status || 'unknown',
      raw:             JSON.stringify(data).slice(0, 2000),
      created_at:      new Date().toISOString(),
    }, 'tx_ref');
  } catch(e) {
    console.warn('[Webhook] Could not log to subscriptions table:', e.message);
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secretHash = process.env.FLW_WEBHOOK_HASH;
  const signature  = event.headers['verif-hash'];
  if (secretHash && signature !== secretHash) {
    console.warn('[Webhook] Invalid signature. Expected:', secretHash, 'Got:', signature);
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { event: eventType, data } = payload;
  console.log(`[Webhook] Event: ${eventType}`, JSON.stringify(data || {}).slice(0, 300));

  async function resolveUid(data) {
    if (data?.meta?.uid) return data.meta.uid;
    if (data?.customer?.email) {
      const user = await supabaseSelect('users', 'email', data.customer.email);
      return user ? user.uid : null;
    }
    return null;
  }

  try {
    switch(eventType) {

      case 'charge.completed': {
        const uid = await resolveUid(data);
        await logSubscriptionEvent('charge.completed', data);
        if (uid) {
          const isAnnual = data.amount >= 200;
          const nextBillTs = Date.now() + (isAnnual ? 365 : 30) * 86400000;
          const nextBillDate = new Date(nextBillTs).toLocaleDateString('en-ZA');
          await updateProgressField(uid, {
            isPremium:      true,
            cancelPending:  false,
            cancelledAt:    null,
            lastRenewalAt:  Date.now(),
            nextBillTs,
            nextBillDate,
            flwTxId:        data.id || null,
            flwTxRef:       data.tx_ref || null,
            subscriptionId: String(data.subscription_id || data.id || ''),
          });
          console.log(`[Webhook] Premium renewed for uid=${uid}, next bill: ${nextBillDate}`);
        }
        break;
      }

      case 'subscription.cancelled': {
        const uid = await resolveUid(data);
        await logSubscriptionEvent('subscription.cancelled', data);
        if (uid) {
          const row = await supabaseSelect('progress', 'uid', uid);
          const existing = (row && row.data) ? row.data : {};
          const premiumEndsAt = existing.premiumEndsAt || existing.nextBillTs || Date.now();
          await updateProgressField(uid, {
            cancelPending:   true,
            cancelledAt:     Date.now(),
            apiCancelled:    true,
            premiumEndsAt,
          });
          console.log(`[Webhook] Subscription cancellation confirmed for uid=${uid}`);
        }
        break;
      }

      case 'subscription.activated': {
        const uid = await resolveUid(data);
        await logSubscriptionEvent('subscription.activated', data);
        if (uid) {
          await updateProgressField(uid, {
            isPremium:      true,
            cancelPending:  false,
            subscribedAt:   Date.now(),
            subscriptionId: String(data.id || ''),
            planLabel:      data.plan || 'Monthly — R30/month',
          });
          console.log(`[Webhook] Subscription activated for uid=${uid}`);
        }
        break;
      }

      case 'charge.failed': {
        const uid = await resolveUid(data);
        await logSubscriptionEvent('charge.failed', data);
        if (uid) {
          await updateProgressField(uid, {
            lastPaymentFailed:   Date.now(),
            lastPaymentFailedTx: data.tx_ref || null,
            paymentFailCount:    1,
          });
          console.log(`[Webhook] Payment failed for uid=${uid}, tx_ref=${data?.tx_ref}`);
        }
        break;
      }

      case 'charge.refunded': {
        await logSubscriptionEvent('charge.refunded', data);
        console.log(`[Webhook] Refund issued: tx_ref=${data?.tx_ref}, amount=${data?.amount}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${eventType}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, event: eventType }),
    };

  } catch(err) {
    console.error('[Webhook] Processing error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, error: err.message }),
    };
  }
};
