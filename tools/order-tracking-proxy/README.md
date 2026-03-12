# Order Tracking Proxy (Cloudflare Worker)

## Deploy
1. Install Wrangler: `npm i -g wrangler`
2. Login: `wrangler login`
3. In this folder run: `wrangler init`
4. Replace generated `src` with `worker.js` (or point entry to this file)
5. Optional secret token: `wrangler secret put TRACKING_PROXY_TOKEN`
6. Deploy: `wrangler deploy`

## Frontend config
In `order-tracking-config.js` set:

```js
window.ORDER_TRACKING_CONFIG = {
  enabled: true,
  proxyUrl: "https://<your-worker-subdomain>.workers.dev",
  proxyToken: "<same-token-or-empty>"
};
```

## Notes
- Admin sets per-order tracking URL in the **Tracking URL** column.
- Customers can click **Refresh live status** in **My orders**.
- Response is proxied from `futtransfer.top/getOrderStatus.php`.
