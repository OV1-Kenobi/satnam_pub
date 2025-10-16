// Direct NWCClient smoke test via @getalby/sdk/nwc
import { NWCClient } from '@getalby/sdk/nwc';
import 'websocket-polyfill';

const NWC_URI = process.env.NWC_URI;
if (!NWC_URI) {
  console.error(
    JSON.stringify(
      { ok: false, error: 'NWC_URI environment variable is required' },
      null,
      2
    )
  );
  process.exit(1);
}

const client = new NWCClient({ nostrWalletConnectUrl: NWC_URI });

try {
  try {
    const info = await client.getInfo();
    console.log(JSON.stringify({ ok: true, step: 'get_info', info }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, step: 'get_info', error: e?.message || String(e) }, null, 2));
    process.exit(2);
  }

  try {
    const bal = await client.getBalance();
    console.log(JSON.stringify({ ok: true, step: 'get_balance', balance: bal }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, step: 'get_balance', error: e?.message || String(e) }, null, 2));
    process.exit(2);
  }
} finally {
  client.close();
}

