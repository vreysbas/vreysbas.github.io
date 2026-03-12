export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const code = String(url.searchParams.get("code") || "").trim();

    if (!code) {
      return json({ error: "Missing code" }, 400);
    }

    if (env.TRACKING_PROXY_TOKEN) {
      const token = request.headers.get("x-tracking-token");
      if (token !== env.TRACKING_PROXY_TOKEN) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const upstreamUrl = new URL("https://futtransfer.top/getOrderStatus.php");
    upstreamUrl.searchParams.set("uuid", "LOOKUP");
    upstreamUrl.searchParams.set("verify", code);
    upstreamUrl.searchParams.set("code", code);

    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        "accept": "application/json, text/plain, */*"
      }
    });

    if (!upstream.ok) {
      return json({ error: `Upstream ${upstream.status}` }, 502);
    }

    const rawText = await upstream.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      return json({ error: "Invalid upstream response" }, 502);
    }

    return json(data, 200);
  }
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      "cache-control": "no-store"
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,x-tracking-token"
  };
}
