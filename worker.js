const targets = {
  china: "/calendar.ics",
  overseas: "/calendar-overseas.ics",
  other: "/calendar-other.ics"
};

const toResponse = (status, message) =>
  new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });

const buildPayload = (request, path, websiteId) => {
  const url = new URL(request.url);
  const language = (request.headers.get("accept-language") || "en").split(",")[0];
  return {
    website: websiteId,
    url: path,
    hostname: url.hostname,
    title: `Subscription ${path}`,
    referrer: request.headers.get("referer") || "",
    language
  };
};

const sendUmami = async (request, env, path) => {
  if (!env.UMAMI_ENDPOINT || !env.UMAMI_WEBSITE_ID) {
    return;
  }
  const endpoint = new URL("/api/send", env.UMAMI_ENDPOINT).toString();
  const payload = buildPayload(request, path, env.UMAMI_WEBSITE_ID);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") || ""
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // ignore tracking failures
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, base, type] = url.pathname.split("/");
    if (base !== "subscribe" || !type) {
      return toResponse(404, "Not found");
    }

    const targetPath = targets[type];
    if (!targetPath) {
      return toResponse(404, "Unknown subscription type");
    }

    const subscribePath = `/subscribe/${type}`;
    await sendUmami(request, env, subscribePath);

    const targetUrl = new URL(targetPath, url.origin).toString();
    return Response.redirect(targetUrl, 302);
  }
};
