type Env = {
  SENIVERSE_PUBLIC_KEY?: string;
  SENIVERSE_PRIVATE_KEY?: string;
  OPENWEATHER_KEY?: string;
};

type NormalizedDaily = {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  windspeed_10m_max: number[];
};

type NormalizedForecast = {
  daily: NormalizedDaily;
  provider: "seniverse" | "openweather" | "openmeteo";
  locationLabel?: string;
  timezone?: string;
};

const isChinaLocation = (lat: number, lon: number) => lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135;

const mapSeniverseCodeToWmo = (code: string) => {
  const numeric = Number(code);
  if ([0, 1, 2].includes(numeric)) return 0;
  if ([3].includes(numeric)) return 2;
  if ([4, 5, 6, 7, 8].includes(numeric)) return 3;
  if ([9, 10].includes(numeric)) return 45;
  if ([11, 12, 19].includes(numeric)) return 61;
  if ([13, 14].includes(numeric)) return 63;
  if ([15, 16].includes(numeric)) return 65;
  if ([17, 18].includes(numeric)) return 67;
  if ([20, 21, 22].includes(numeric)) return 71;
  if ([23, 24].includes(numeric)) return 73;
  if ([25].includes(numeric)) return 75;
  if ([26, 27].includes(numeric)) return 77;
  if ([28].includes(numeric)) return 95;
  return 2;
};

const mapOpenWeatherCodeToWmo = (code: number) => {
  if (code === 800) return 0;
  if (code === 801) return 1;
  if (code === 802) return 2;
  if (code === 803 || code === 804) return 3;
  if (code >= 200 && code < 300) return 95;
  if (code >= 300 && code < 400) return 61;
  if (code >= 500 && code < 600) return code >= 520 ? 81 : 63;
  if (code >= 600 && code < 700) return 71;
  if (code >= 700 && code < 800) return 45;
  return 2;
};

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`request_failed:${response.status}:${text}`);
  }
  return response.json();
};

const getSeniverseForecast = async (lat: number, lon: number, env: Env) => {
  if (!env.SENIVERSE_PUBLIC_KEY) {
    throw new Error("seniverse_key_missing");
  }
  const location = `${lat}:${lon}`;
  const url = new URL("https://api.seniverse.com/v3/weather/daily.json");
  url.searchParams.set("key", env.SENIVERSE_PUBLIC_KEY);
  url.searchParams.set("location", location);
  url.searchParams.set("language", "zh-Hans");
  url.searchParams.set("unit", "c");
  url.searchParams.set("start", "0");
  url.searchParams.set("days", "3");

  const data = await fetchJson(url.toString());
  const result = data.results?.[0];
  if (!result?.daily) {
    throw new Error("seniverse_no_data");
  }
  const daily = result.daily;
  return {
    daily: {
      time: daily.map((item: { date: string }) => item.date),
      weathercode: daily.map((item: { code_day: string }) => mapSeniverseCodeToWmo(item.code_day)),
      temperature_2m_max: daily.map((item: { high: string }) => Number(item.high)),
      temperature_2m_min: daily.map((item: { low: string }) => Number(item.low)),
      precipitation_probability_max: daily.map((item: { precip: string }) => Number(item.precip ?? 0)),
      windspeed_10m_max: daily.map((item: { wind_speed: string }) => Number(item.wind_speed ?? 0))
    },
    provider: "seniverse" as const,
    locationLabel: result.location?.path || result.location?.name,
    timezone: result.location?.timezone
  };
};

const getOpenWeatherForecast = async (lat: number, lon: number, env: Env) => {
  if (!env.OPENWEATHER_KEY) {
    throw new Error("openweather_key_missing");
  }
  const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("appid", env.OPENWEATHER_KEY);
  url.searchParams.set("units", "metric");
  url.searchParams.set("exclude", "minutely,hourly,alerts,current");

  const data = await fetchJson(url.toString());
  const daily = data.daily;
  if (!Array.isArray(daily) || daily.length === 0) {
    throw new Error("openweather_no_data");
  }

  return {
    daily: {
      time: daily.slice(0, 7).map((item: { dt: number }) => {
        const date = new Date(item.dt * 1000);
        return date.toISOString().slice(0, 10);
      }),
      weathercode: daily.slice(0, 7).map((item: { weather: { id: number }[] }) =>
        mapOpenWeatherCodeToWmo(item.weather?.[0]?.id ?? 802)
      ),
      temperature_2m_max: daily.slice(0, 7).map((item: { temp: { max: number } }) => item.temp.max),
      temperature_2m_min: daily.slice(0, 7).map((item: { temp: { min: number } }) => item.temp.min),
      precipitation_probability_max: daily.slice(0, 7).map((item: { pop?: number }) =>
        Math.round((item.pop ?? 0) * 100)
      ),
      windspeed_10m_max: daily.slice(0, 7).map((item: { wind_speed: number }) => item.wind_speed)
    },
    provider: "openweather" as const
  };
};

const getOpenMeteoForecast = async (lat: number, lon: number) => {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set(
    "daily",
    [
      "weathercode",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "windspeed_10m_max"
    ].join(",")
  );
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", "auto");

  const data = await fetchJson(url.toString());
  if (!data.daily) {
    throw new Error("openmeteo_no_data");
  }
  return {
    daily: data.daily as NormalizedDaily,
    provider: "openmeteo" as const
  };
};

const buildResponse = (data: NormalizedForecast) =>
  new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=900"
    }
  });

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return new Response(JSON.stringify({ error: "invalid_location" }), { status: 400 });
  }

  const inChina = isChinaLocation(lat, lon);
  const providers = inChina
    ? [
        () => getSeniverseForecast(lat, lon, env),
        () => getOpenMeteoForecast(lat, lon)
      ]
    : [
        () => getOpenWeatherForecast(lat, lon, env),
        () => getOpenMeteoForecast(lat, lon)
      ];

  let lastError = "unknown";
  for (const provider of providers) {
    try {
      const data = await provider();
      return buildResponse(data);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown";
    }
  }

  return new Response(JSON.stringify({ error: lastError }), { status: 502 });
};
