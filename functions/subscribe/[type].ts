type SubscriptionKey = "china" | "overseas" | "other";

type Env = {
  UMAMI_ENDPOINT?: string;
  UMAMI_WEBSITE_ID?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
  params: {
    type?: string | string[];
  };
  waitUntil(promise: Promise<unknown>): void;
};

const targets: Record<SubscriptionKey, string> = {
  china: "/calendar.ics",
  overseas: "/calendar-overseas.ics",
  other: "/calendar-other.ics"
};

const isSubscriptionKey = (value: string): value is SubscriptionKey => value in targets;

const toResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });

const getLanguage = (request: Request) =>
  (request.headers.get("accept-language") || "en").split(",")[0];

const buildEventPayload = (
  request: Request,
  path: string,
  websiteId: string,
  type: SubscriptionKey,
) => {
  const url = new URL(request.url);
  return {
    payload: {
      website: websiteId,
      url: path,
      hostname: url.hostname,
      title: `Subscription ${path}`,
      referrer: request.headers.get("referer") || "",
      language: getLanguage(request),
      screen: "0x0",
      name: "subscription",
      data: { type }
    },
    type: "event"
  };
};

const buildPageviewPayload = (request: Request, path: string, websiteId: string) => {
  const url = new URL(request.url);
  return {
    payload: {
      website: websiteId,
      url: path,
      hostname: url.hostname,
      title: `Subscription ${path}`,
      referrer: request.headers.get("referer") || "",
      language: getLanguage(request),
      screen: "0x0"
    },
    type: "pageview"
  };
};

const sendUmamiEvent = async (
  request: Request,
  env: Env,
  path: string,
  type: SubscriptionKey,
) => {
  if (!env.UMAMI_ENDPOINT || !env.UMAMI_WEBSITE_ID) {
    return;
  }
  const endpoint = new URL("/api/send", env.UMAMI_ENDPOINT).toString();
  const payload = buildEventPayload(request, path, env.UMAMI_WEBSITE_ID, type);
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
    // Tracking failures must never block calendar subscription redirects.
  }
};

const sendUmamiPageview = async (request: Request, env: Env, path: string) => {
  if (!env.UMAMI_ENDPOINT || !env.UMAMI_WEBSITE_ID) {
    return;
  }
  const endpoint = new URL("/api/collect", env.UMAMI_ENDPOINT).toString();
  const payload = buildPageviewPayload(request, path, env.UMAMI_WEBSITE_ID);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") || "",
        "x-forwarded-for": request.headers.get("cf-connecting-ip") || ""
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Tracking failures must never block calendar subscription redirects.
  }
};

export const onRequestGet = ({ request, env, params, waitUntil }: PagesContext) => {
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  if (!rawType || !isSubscriptionKey(rawType)) {
    return toResponse(404, "Unknown subscription type");
  }

  const url = new URL(request.url);
  const subscribePath = `/subscribe/${rawType}`;
  waitUntil(
    Promise.allSettled([
      sendUmamiPageview(request, env, subscribePath),
      sendUmamiEvent(request, env, subscribePath, rawType)
    ])
  );

  const targetUrl = new URL(targets[rawType], url.origin).toString();
  return Response.redirect(targetUrl, 302);
};
