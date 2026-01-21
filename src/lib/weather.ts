export type WeatherLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  admin1?: string;
  country?: string;
  timezone?: string;
};

export type DailyForecast = {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  windspeed_10m_max: number[];
};

export type ForecastResponse = {
  daily: DailyForecast;
};

export type ProxyForecastResponse = {
  daily: DailyForecast;
  provider: "seniverse" | "openweather" | "openmeteo";
  locationLabel?: string;
  timezone?: string;
};

export const wmoText = (code: number) => {
  const map: Record<number, string> = {
    0: "晴朗",
    1: "大部晴朗",
    2: "局部多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "中毛毛雨",
    55: "大毛毛雨",
    56: "小冻毛毛雨",
    57: "大冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "小冻雨",
    67: "大冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "小阵雨",
    81: "中阵雨",
    82: "强阵雨",
    85: "小阵雪",
    86: "强阵雪",
    95: "雷暴",
    96: "雷暴伴小冰雹",
    99: "雷暴伴大冰雹"
  };
  return map[code] ?? `天气代码 ${code}`;
};

export const formatDateISOToLocal = (iso: string, locale = "zh-CN") => {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit", weekday: "short" });
};

export const geocode = async (name: string) => {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("地理编码请求失败");
  }
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("找不到该地点");
  }
  return data.results[0] as WeatherLocation;
};

export const reverseGeocode = async (latitude: number, longitude: number) => {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", latitude.toString());
  url.searchParams.set("longitude", longitude.toString());
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("反向地理编码失败");
  }
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    return null;
  }
  return data.results[0] as WeatherLocation;
};

const getOpenMeteoFallback = async (latitude: number, longitude: number) => {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toString());
  url.searchParams.set("longitude", longitude.toString());
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
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("天气请求失败");
  }
  const data = (await response.json()) as ForecastResponse;
  return {
    daily: data.daily,
    provider: "openmeteo" as const,
    locationLabel: undefined,
    timezone: "auto"
  };
};

export const getForecast = async (latitude: number, longitude: number) => {
  const url = new URL("/weather", window.location.origin);
  url.searchParams.set("lat", latitude.toString());
  url.searchParams.set("lon", longitude.toString());

  try {
    const response = await fetch(url.toString());
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      throw new Error("proxy_failed");
    }
    if (!contentType.includes("application/json")) {
      throw new Error("proxy_not_json");
    }
    return (await response.json()) as ProxyForecastResponse;
  } catch {
    return getOpenMeteoFallback(latitude, longitude);
  }
};

export const getWeatherIconType = (code: number) => {
  if (code === 0 || code === 1) return "sun";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "thunder";
  return "cloud";
};

export const formatLocationLabel = (location: WeatherLocation | null, fallback: string) => {
  if (!location) {
    return fallback;
  }
  const parts = [location.name, location.admin1, location.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
};
