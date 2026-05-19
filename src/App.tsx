import { useEffect, useMemo, useRef, useState } from "react";
import chinaHolidayDataUrl from "../data/holidays.json?url";
import overseasHolidayDataUrl from "../data/holidays-overseas.json?url";
import type { LunarInfo } from "./lib/lunar";
import type { HolidayEvent, HolidayType } from "./lib/types";
import type { DailyForecast } from "./lib/weather";
import {
  formatDateISOToLocal,
  formatLocationLabel,
  geocode,
  getForecast,
  getWeatherIconType,
  reverseGeocode,
  wmoText
} from "./lib/weather";
import {
  addDays,
  formatMonthTitle,
  formatShortWeekday,
  getMonthGrid,
  startOfMonth,
  toISODate
} from "./lib/date";

type FilterKey = "holiday" | "workday" | "other";

type WeatherState = {
  cityInput: string;
  timezone: string;
  label: string;
  daily: DailyForecast | null;
  status: string;
  loading: boolean;
  showFull: boolean;
};

type PersonalEvent = {
  id: string;
  title: string;
  date: string;
};

type SubscriptionLinks = {
  china: { httpsLink: string; webcalLink: string };
  overseas: { httpsLink: string; webcalLink: string };
  other: { httpsLink: string; webcalLink: string };
};

type SubscriptionKey = "china" | "overseas" | "other";

const subscriptionLabels: Record<SubscriptionKey, string> = {
  china: "中国节假日/调休",
  overseas: "海外节假日",
  other: "其他节日/纪念日"
};

const subscriptionStyles: Record<SubscriptionKey, string> = {
  china: "source-china",
  overseas: "source-overseas",
  other: "source-other"
};

const getSubscriptionKey = (
  event: HolidayEvent,
  overseasIds: ReadonlySet<string>
): SubscriptionKey => {
  if (overseasIds.has(event.id)) {
    return "overseas";
  }
  if (event.type === "other") {
    return "other";
  }
  return "china";
};

const matchesSourceFilters = (
  event: HolidayEvent,
  filters: Record<SubscriptionKey, boolean>,
  overseasIds: ReadonlySet<string>
) => filters[getSubscriptionKey(event, overseasIds)];

const getSourceStyle = (event: HolidayEvent, overseasIds: ReadonlySet<string>) =>
  subscriptionStyles[getSubscriptionKey(event, overseasIds)];

const loadHolidayEvents = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load holiday data: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Holiday data must be an array");
  }
  return data as HolidayEvent[];
};

const getEventBounds = (event: HolidayEvent) => {
  const start = new Date(event.start);
  const fallback = { start, end: start };
  if (!event.end) {
    return fallback;
  }
  const end = new Date(event.end);
  if (Number.isNaN(end.getTime())) {
    return fallback;
  }
  if (event.allDay) {
    const inclusiveEnd = addDays(end, -1);
    if (inclusiveEnd < start) {
      return fallback;
    }
    return { start, end: inclusiveEnd };
  }
  return { start, end };
};

const buildEventMap = (items: HolidayEvent[]) => {
  const map = new Map<string, HolidayEvent[]>();
  for (const item of items) {
    const { start, end } = getEventBounds(item);
    for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
      const dateKey = toISODate(date);
      const current = map.get(dateKey) ?? [];
      current.push(item);
      map.set(dateKey, current);
    }
  }
  return map;
};

const getUpcoming = (items: HolidayEvent[], now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addDays(start, 45);
  return items
    .filter((item) => {
      const bounds = getEventBounds(item);
      return bounds.end >= start && bounds.start <= end;
    })
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 8);
};

const getSourceLinks = () => {
  const configuredBase = import.meta.env.VITE_PUBLIC_BASE_URL?.trim();
  const baseUrl = (configuredBase || window.location.origin).replace(/\/$/, "");
  const buildLinks = (path: string) => ({
    httpsLink: `${baseUrl}${path}`,
    webcalLink: `${baseUrl}${path}`.replace(/^https?:\/\//, "webcal://")
  });
  return {
    china: buildLinks("/subscribe/china"),
    overseas: buildLinks("/subscribe/overseas"),
    other: buildLinks("/subscribe/other")
  };
};

const getMonthBounds = (date: Date) => {
  const start = startOfMonth(date);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
};

const formatEventRange = (event: HolidayEvent) => {
  const bounds = getEventBounds(event);
  const start = toISODate(bounds.start);
  const end = toISODate(bounds.end);
  if (end !== start) {
    return `${start} - ${end}`;
  }
  return start;
};

const getTypeLabel = (type: HolidayType) => {
  if (type === "workday") {
    return "调休工作日";
  }
  if (type === "holiday") {
    return "法定节假日";
  }
  return "其他";
};

const parseLocalEvents = () => {
  if (typeof window === "undefined") {
    return [] as PersonalEvent[];
  }
  const raw = window.localStorage.getItem("personalEvents");
  if (!raw) {
    return [] as PersonalEvent[];
  }
  try {
    const parsed = JSON.parse(raw) as PersonalEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as PersonalEvent[];
  }
};

const persistLocalEvents = (items: PersonalEvent[]) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("personalEvents", JSON.stringify(items));
};

const WeatherIcon = ({ type }: { type: string }) => {
  if (type === "sun") {
    return (
      <svg viewBox="0 0 48 48" role="presentation">
        <circle cx="24" cy="24" r="9" fill="#f59e0b" />
        <g stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
          <line x1="24" y1="6" x2="24" y2="12" />
          <line x1="24" y1="36" x2="24" y2="42" />
          <line x1="6" y1="24" x2="12" y2="24" />
          <line x1="36" y1="24" x2="42" y2="24" />
          <line x1="11" y1="11" x2="15" y2="15" />
          <line x1="33" y1="33" x2="37" y2="37" />
          <line x1="33" y1="15" x2="37" y2="11" />
          <line x1="11" y1="37" x2="15" y2="33" />
        </g>
      </svg>
    );
  }

  if (type === "rain") {
    return (
      <svg viewBox="0 0 48 48" role="presentation">
        <path
          d="M15 30h18a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-1 17z"
          fill="#9ec5f5"
        />
        <g stroke="#4f8dd9" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="34" x2="16" y2="40" />
          <line x1="24" y1="34" x2="22" y2="40" />
          <line x1="30" y1="34" x2="28" y2="40" />
        </g>
      </svg>
    );
  }

  if (type === "snow") {
    return (
      <svg viewBox="0 0 48 48" role="presentation">
        <path
          d="M15 30h18a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-1 17z"
          fill="#dbe9ff"
        />
        <g fill="#8db2e5">
          <circle cx="18" cy="37" r="2" />
          <circle cx="24" cy="39" r="2" />
          <circle cx="30" cy="37" r="2" />
        </g>
      </svg>
    );
  }

  if (type === "fog") {
    return (
      <svg viewBox="0 0 48 48" role="presentation">
        <path
          d="M14 30h20a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-1 17z"
          fill="#d7dde6"
        />
        <g stroke="#94a0ad" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="36" x2="36" y2="36" />
          <line x1="14" y1="40" x2="34" y2="40" />
        </g>
      </svg>
    );
  }

  if (type === "thunder") {
    return (
      <svg viewBox="0 0 48 48" role="presentation">
        <path
          d="M15 30h18a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-1 17z"
          fill="#f7d28b"
        />
        <path d="M24 32l-5 8h5l-3 6 8-10h-5l3-4z" fill="#f2a93b" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" role="presentation">
      <path
        d="M15 30h18a7 7 0 0 0 0-14 9 9 0 0 0-17-3 7 7 0 0 0-1 17z"
        fill="#b7c4d6"
      />
    </svg>
  );
};

export default function App() {
  const [chinaEvents, setChinaEvents] = useState<HolidayEvent[]>([]);
  const [overseasEvents, setOverseasEvents] = useState<HolidayEvent[]>([]);
  const [holidayStatus, setHolidayStatus] = useState("正在加载节假日数据…");
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [links, setLinks] = useState<SubscriptionLinks | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>(() => ({
    holiday: true,
    workday: true,
    other: false
  }));
  const [sourceFilters, setSourceFilters] = useState<Record<SubscriptionKey, boolean>>(() => ({
    china: true,
    overseas: true,
    other: true
  }));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherState>(() => ({
    cityInput: "北京",
    timezone: "auto",
    label: "",
    daily: null,
    status: "点击按钮获取天气。",
    loading: false,
    showFull: false
  }));
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>(() => parseLocalEvents());
  const [newEventTitle, setNewEventTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    date: string;
    visible: boolean;
  } | null>(null);
  const [personalModal, setPersonalModal] = useState<{ date: string } | null>(null);
  const [previewModal, setPreviewModal] = useState<{ date: string } | null>(null);
  const [lunarMap, setLunarMap] = useState<Map<string, LunarInfo>>(() => new Map());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const overseasLoadStartedRef = useRef(false);

  const overseasIdSet = useMemo(
    () => new Set(overseasEvents.map((event) => event.id)),
    [overseasEvents]
  );
  const events = useMemo(
    () => [...chinaEvents, ...overseasEvents],
    [chinaEvents, overseasEvents]
  );

  const sourceOptions = useMemo(
    () =>
      (Object.keys(subscriptionLabels) as SubscriptionKey[]).map((key) => ({
        id: key,
        label: subscriptionLabels[key]
      })),
    []
  );

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          filters[event.type] && matchesSourceFilters(event, sourceFilters, overseasIdSet)
      ),
    [events, filters, overseasIdSet, sourceFilters]
  );
  const gridDays = useMemo(() => getMonthGrid(viewDate), [viewDate]);
  const eventMap = useMemo(() => buildEventMap(filteredEvents), [filteredEvents]);
  const upcomingEvents = useMemo(() => getUpcoming(filteredEvents), [filteredEvents]);
  const personalEventMap = useMemo(() => {
    const mapped = personalEvents.map((event) => ({
      id: event.id,
      title: event.title,
      start: `${event.date}T00:00:00.000Z`,
      allDay: true,
      type: "other" as HolidayType
    }));
    return buildEventMap(mapped);
  }, [personalEvents]);
  const monthEvents = useMemo(() => {
    const { start, end } = getMonthBounds(viewDate);
    return filteredEvents
      .filter((event) => {
        const bounds = getEventBounds(event);
        return bounds.end >= start && bounds.start < end;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [filteredEvents, viewDate]);

  const currentMonth = viewDate.getMonth();
  const todayKey = toISODate(new Date());

  useEffect(() => {
    let cancelled = false;
    loadHolidayEvents(chinaHolidayDataUrl)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setChinaEvents(items);
        setHolidayStatus("节假日与调休工作日以颜色区分");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "加载失败";
        if (!cancelled) {
          setHolidayStatus(`节假日数据加载失败：${message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceFilters.overseas || overseasLoadStartedRef.current) {
      return;
    }
    overseasLoadStartedRef.current = true;
    let cancelled = false;
    loadHolidayEvents(overseasHolidayDataUrl)
      .then((items) => {
        if (!cancelled) {
          setOverseasEvents(items);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load overseas holiday data", error);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceFilters.overseas]);

  useEffect(() => {
    let cancelled = false;
    import("./lib/lunar")
      .then(({ getLunarInfo }) => {
        if (cancelled) {
          return;
        }
        const next = new Map<string, LunarInfo>();
        gridDays.forEach((day) => {
          const key = toISODate(day);
          next.set(key, getLunarInfo(day));
        });
        setLunarMap(next);
      })
      .catch((error: unknown) => {
        console.error("Failed to load lunar calendar data", error);
        if (!cancelled) {
          setLunarMap(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gridDays]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLinks(getSourceLinks());
      const storedCity = window.localStorage.getItem("weatherCity");
      const storedTz = window.localStorage.getItem("weatherTimezone");
      setWeather((prev) => ({
        ...prev,
        cityInput: storedCity || prev.cityInput,
        timezone: storedTz || prev.timezone
      }));
    }
  }, []);

  useEffect(() => {
    if (!personalModal && !previewModal) {
      return;
    }
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPersonalModal(null);
        setPreviewModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      lastFocusedElementRef.current?.focus();
    };
  }, [personalModal, previewModal]);

  useEffect(() => {
    persistLocalEvents(personalEvents);
  }, [personalEvents]);

  useEffect(() => {
    if (!contextMenu?.visible) {
      return;
    }
    const handleDismiss = (event: Event) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu((prev) => (prev ? { ...prev, visible: false } : prev));
      }
    };
    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
    };
  }, [contextMenu]);

  const requestWeather = async (mode: "geo" | "city") => {
    if (typeof window === "undefined") {
      return;
    }
    setWeather((prev) => ({ ...prev, loading: true, status: "正在获取天气…" }));
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let timezone = weather.timezone;
      let locationLabel = "";

      if (mode === "geo") {
        const location = await new Promise<GeolocationPosition | null>((resolve) => {
          if (!navigator.geolocation) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            () => resolve(null),
            { timeout: 8000 }
          );
        });

        if (!location) {
          throw new Error("未获得定位权限");
        }
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
        const reversed = await reverseGeocode(latitude, longitude);
        locationLabel = formatLocationLabel(reversed, weather.cityInput);
        timezone = weather.timezone === "auto" ? reversed?.timezone || "auto" : weather.timezone;
      } else {
        const geo = await geocode(weather.cityInput || "北京");
        latitude = geo.latitude;
        longitude = geo.longitude;
        locationLabel = formatLocationLabel(geo, weather.cityInput || "北京");
        timezone = weather.timezone === "auto" ? geo.timezone || "auto" : weather.timezone;
      }

      if (latitude === null || longitude === null) {
        throw new Error("无法获取位置");
      }

      const forecast = await getForecast(latitude, longitude, timezone);
      window.localStorage.setItem("weatherCity", weather.cityInput || "北京");
      window.localStorage.setItem("weatherTimezone", weather.timezone);

      setWeather((prev) => ({
        ...prev,
        label: forecast.locationLabel || locationLabel,
        daily: forecast.daily,
        status: `已更新：${forecast.locationLabel || locationLabel}（来源：${forecast.provider}）`,
        loading: false
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取失败";
      setWeather((prev) => ({
        ...prev,
        status: `获取失败：${message}`,
        loading: false
      }));
    }
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewDate);
    next.setMonth(next.getMonth() + delta, 1);
    setViewDate(next);
  };

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleSourceFilter = (key: SubscriptionKey) => {
    setSourceFilters((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const setAllSources = (enabled: boolean) => {
    setSourceFilters({
      china: enabled,
      overseas: enabled,
      other: enabled
    });
  };

  const copyLink = async (text: string, key: string) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch (error) {
      console.error("Failed to copy link", error);
    }
  };

  const addPersonalEvent = (date = selectedDate) => {
    const title = newEventTitle.trim();
    if (!title) {
      return;
    }
    setPersonalEvents((prev) => [
      ...prev,
      {
        id: `${date}-${Date.now()}`,
        title,
        date
      }
    ]);
    setNewEventTitle("");
  };

  const removePersonalEvent = (id: string) => {
    setPersonalEvents((prev) => prev.filter((event) => event.id !== id));
  };

  return (
    <div className="app">
      {contextMenu?.visible ? (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedDate(contextMenu.date);
              setContextMenu((prev) => (prev ? { ...prev, visible: false } : prev));
              setNewEventTitle("");
              setPreviewModal({ date: contextMenu.date });
            }}
          >
            查看当天
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedDate(contextMenu.date);
              setContextMenu((prev) => (prev ? { ...prev, visible: false } : prev));
              setPersonalModal({ date: contextMenu.date });
              setNewEventTitle("");
            }}
          >
            添加日程
          </button>
        </div>
      ) : null}
      {personalModal ? (
        <div className="modal-overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="personal-modal-title"
          >
            <div className="modal-header">
              <h3 id="personal-modal-title">添加日程</h3>
              <button
                type="button"
                className="close"
                onClick={() => setPersonalModal(null)}
              >
                关闭
              </button>
            </div>
            <p className="modal-date">{personalModal.date}</p>
            <input
              type="text"
              placeholder="请输入日程内容"
              value={newEventTitle}
              onChange={(event) => setNewEventTitle(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setPersonalModal(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  addPersonalEvent(personalModal.date);
                  setPersonalModal(null);
                }}
              >
                保存
              </button>
            </div>
            <p className="hint">仅保存在本地浏览器，不上传云端。</p>
          </div>
        </div>
      ) : null}
      {previewModal ? (
        <div className="modal-overlay">
          <div
            className="modal preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-modal-title"
          >
            <div className="modal-header">
              <h3 id="preview-modal-title">当天预览</h3>
              <button
                type="button"
                className="close"
                onClick={() => setPreviewModal(null)}
              >
                关闭
              </button>
            </div>
            <p className="modal-date">{previewModal.date}</p>
            <div className="preview-section">
              <strong>节假日/调休</strong>
              <ul>
                {(eventMap.get(previewModal.date) ?? []).map((event) => (
                  <li key={event.id}>
                    <span className={`badge ${event.type}`}>
                      {event.type === "workday" ? "补" : event.type === "holiday" ? "休" : "其"}
                    </span>
                    <span>{event.title}</span>
                  </li>
                ))}
                {(eventMap.get(previewModal.date) ?? []).length === 0 ? (
                  <li className="empty">暂无节假日事件</li>
                ) : null}
              </ul>
            </div>
            <div className="preview-section">
              <div className="preview-header">
                <strong>个人日程</strong>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setPreviewModal(null);
                    setPersonalModal({ date: previewModal.date });
                  }}
                >
                  添加
                </button>
              </div>
              <ul>
                {personalEvents
                  .filter((event) => event.date === previewModal.date)
                  .map((event) => (
                    <li key={event.id}>
                      <span className="badge personal">私</span>
                      <span>{event.title}</span>
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => removePersonalEvent(event.id)}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                {personalEvents.filter((event) => event.date === previewModal.date).length ===
                0 ? (
                  <li className="empty">暂无个人日程</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      <header className="hero">
        <div>
          <p className="eyebrow">GeekCalendarLab</p>
          <h1>极客日历实验室</h1>
          <p className="subtitle">极客式节假日订阅与日历视图，一站式管理。</p>
          <div className="actions">
            <a className="button primary" href="#calendar">查看日历</a>
            <a className="button ghost" href="#subscribe">订阅地址</a>
          </div>
        </div>
        <div className="hero-card">
          <p className="label">最近更新</p>
          <h2>{formatMonthTitle(new Date())}</h2>
          <ul>
            {upcomingEvents.map((event) => (
              <li key={event.id}>
                <span className={`dot ${event.type}`} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.start.slice(0, 10)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section className="weather" id="weather">
        <div className="weather-header">
          <div>
            <h2>天气预报</h2>
            <p>选择定位或输入城市，查看未来一周天气</p>
          </div>
          <div className="weather-actions">
            <div>
              <label htmlFor="city">城市 / 地点</label>
              <input
                id="city"
                value={weather.cityInput}
                onChange={(event) =>
                  setWeather((prev) => ({
                    ...prev,
                    cityInput: event.target.value
                  }))
                }
                placeholder="例如：北京 / Shanghai"
              />
            </div>
            <div>
              <label htmlFor="tz">时区</label>
              <select
                id="tz"
                value={weather.timezone}
                onChange={(event) =>
                  setWeather((prev) => ({
                    ...prev,
                    timezone: event.target.value
                  }))
                }
              >
                <option value="auto">自动</option>
                <option value="Asia/Shanghai">Asia/Shanghai</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <button
              className="refresh"
              type="button"
              onClick={() => requestWeather("city")}
              disabled={weather.loading}
            >
              {weather.loading ? "更新中" : "城市查询"}
            </button>
            <button
              className="locate"
              type="button"
              onClick={() => requestWeather("geo")}
              disabled={weather.loading}
            >
              定位获取
            </button>
          </div>
        </div>


        {weather.daily ? (
          <div className="weather-body">
            {(() => {
              const daily = weather.daily;
              if (!daily) {
                return null;
              }
              return (
                <>
                  <div className="weather-panel">
                    <div className="today-summary">
                      <div>
                        <span className="label">今天</span>
                        <strong>{formatDateISOToLocal(daily.time[0]).slice(0, 5)}</strong>
                        <p>{wmoText(daily.weathercode[0])}</p>
                      </div>
                      <div className="temp-stack">
                        <span className="temp-high">
                          {Math.round(daily.temperature_2m_max[0])}°
                        </span>
                        <span className="temp-low">
                          {Math.round(daily.temperature_2m_min[0])}°
                        </span>
                      </div>
                      <div className="meta">
                        <span>降水 {daily.precipitation_probability_max[0] ?? 0}%</span>
                        <span>风速 {Math.round(daily.windspeed_10m_max[0])} km/h</span>
                      </div>
                    </div>

                    <div className="forecast-strip">
                      <div className="forecast-cards">
                        {daily.time.slice(0, 7).map((date, index) => {
                          const iconType = getWeatherIconType(daily.weathercode[index]);
                          return (
                            <div
                              key={date}
                              className={`forecast-card ${index === 0 ? "active" : ""}`}
                            >
                              <span className="day">
                                {index === 0 ? "今天" : formatDateISOToLocal(date)}
                              </span>
                                    <span className={`icon ${iconType}`} aria-hidden="true">
                                      <WeatherIcon type={iconType} />
                                    </span>

                              <span className="desc">{wmoText(daily.weathercode[index])}</span>
                              <span className="temp">
                                {Math.round(daily.temperature_2m_max[index])}°
                              </span>
                              <span className="temp low">
                                {Math.round(daily.temperature_2m_min[index])}°
                              </span>
                              <span className="wind">
                                风 {Math.round(daily.windspeed_10m_max[index])} km/h
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <details
                    className="forecast-full"
                    open={weather.showFull}
                    onToggle={(event) =>
                      setWeather((prev) => ({
                        ...prev,
                        showFull: (event.target as HTMLDetailsElement).open
                      }))
                    }
                  >
                    <summary>查看未来 {daily.time.length} 天详情</summary>
                    <table>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>概况</th>
                          <th>最高 / 最低</th>
                          <th>降水</th>
                          <th>风速</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daily.time.map((date, index) => (
                          <tr key={date}>
                            <td>{formatDateISOToLocal(date)}</td>
                            <td>{wmoText(daily.weathercode[index])}</td>
                            <td>
                              {Math.round(daily.temperature_2m_max[index])} / {Math.round(
                                daily.temperature_2m_min[index]
                              )}°C
                            </td>
                            <td>{daily.precipitation_probability_max[index] ?? 0}%</td>
                            <td>{Math.round(daily.windspeed_10m_max[index])} km/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              );
            })()}
          </div>
        ) : null}

        <div className="weather-status">
          <span>{weather.status}</span>
          {weather.label ? <span>当前城市：{weather.label}</span> : null}
          <span className="weather-source">数据来源：心知天气 / OpenWeather / Open‑Meteo</span>
        </div>
      </section>

      <section className="calendar" id="calendar">
        <div className="calendar-header">
          <div>
            <h2>{formatMonthTitle(viewDate)}</h2>
            <p>{holidayStatus}</p>
            <div className="source-filters">
              <div className="source-header">
                <span className="label">订阅源</span>
                <div className="source-actions">
                  <button type="button" onClick={() => setAllSources(true)}>
                    全选
                  </button>
                  <button type="button" onClick={() => setAllSources(false)}>
                    全不选
                  </button>
                </div>
              </div>
              <div className="source-list">
                {sourceOptions.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`source-item ${sourceFilters[source.id] ? "active" : ""}`}
                    aria-pressed={sourceFilters[source.id]}
                    onClick={() => toggleSourceFilter(source.id)}
                  >
                    <span className="source-checkbox" aria-hidden="true" />
                    <span
                      className={`source-shape ${subscriptionStyles[source.id] ?? ""}`}
                      aria-hidden="true"
                    />
                    <span className="source-label">{source.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="calendar-controls">
            <div className="view-toggle">
              <button
                type="button"
                className={viewMode === "month" ? "active" : ""}
                aria-pressed={viewMode === "month"}
                onClick={() => setViewMode("month")}
              >
                月视图
              </button>
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                列表
              </button>
            </div>
            <div className="filters">
              <button
                type="button"
                className={`filter ${filters.holiday ? "active" : ""}`}
                aria-pressed={filters.holiday}
                onClick={() => toggleFilter("holiday")}
              >
                节假日
              </button>
              <button
                type="button"
                className={`filter ${filters.workday ? "active" : ""}`}
                aria-pressed={filters.workday}
                onClick={() => toggleFilter("workday")}
              >
                调休
              </button>
              <button
                type="button"
                className={`filter ${filters.other ? "active" : ""}`}
                aria-pressed={filters.other}
                onClick={() => toggleFilter("other")}
              >
                其他
              </button>
            </div>
            <div className="nav">
              <button onClick={() => shiftMonth(-1)} type="button">上个月</button>
              <button onClick={() => setViewDate(startOfMonth(new Date()))} type="button">
                今天
              </button>
              <button onClick={() => shiftMonth(1)} type="button">下个月</button>
            </div>
          </div>
        </div>

        {viewMode === "month" ? (
          <>
            <div className="weekdays">
              {gridDays.slice(0, 7).map((day) => (
                <span key={day.toISOString()}>{formatShortWeekday(day)}</span>
              ))}
            </div>

            <div className="grid">
              {gridDays.map((day) => {
                const key = toISODate(day);
                const dayEvents = eventMap.get(key) ?? [];
                const inMonth = day.getMonth() === currentMonth;
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;
                const lunarInfo = lunarMap.get(key);

                return (
                    <button
                      key={key}
                      className={`cell ${inMonth ? "" : "muted"} ${isToday ? "today" : ""} ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => setSelectedDate(key)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedDate(key);
                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          date: key,
                          visible: true
                        });
                      }}
                      type="button"
                    >

                    <span className="date">{day.getDate()}</span>
                    {lunarInfo?.display ? (
                      <span className="lunar-text">{lunarInfo.display}</span>
                    ) : null}
                    <div className="markers">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span key={event.id} className="marker">
                          <span className={`badge ${event.type}`}>
                            {event.type === "workday" ? "补" : event.type === "holiday" ? "休" : "其"}
                          </span>
                          <span
                            className={`source-shape ${getSourceStyle(event, overseasIdSet)}`}
                            aria-hidden="true"
                          />
                        </span>
                      ))}
                      {(personalEventMap.get(key) ?? []).slice(0, 2).map((event) => (
                        <span key={event.id} className="badge personal">私</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <aside className="detail">
              <h3>{selectedDate}</h3>
              <div className="lunar-panel">
                {(() => {
                  const info = lunarMap.get(selectedDate);
                  if (!info) {
                    return null;
                  }
                  return (
                    <div className="lunar-info">
                      <span className="label">农历</span>
                      <div>
                        <strong>{info.lunarText}</strong>
                        <span>
                          {[info.festival, info.solarTerm].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <ul>
                {(eventMap.get(selectedDate) ?? []).map((event) => (
                  <li key={event.id} className={event.type}>
                    <div className="detail-row">
                      <strong>{event.title}</strong>
                      <span className={`type-tag ${event.type}`}>{getTypeLabel(event.type)}</span>
                    </div>
                    <span className="detail-date">{formatEventRange(event)}</span>
                    {event.description ? <p>{event.description}</p> : null}
                  </li>
                ))}
                {(personalEventMap.get(selectedDate) ?? []).map((event) => (
                  <li key={event.id} className="personal">
                    <div className="detail-row">
                      <strong>{event.title}</strong>
                      <span className="type-tag personal">个人日程</span>
                    </div>
                    <span className="detail-date">{selectedDate}</span>
                    <button
                      type="button"
                      className="remove-event"
                      onClick={() => removePersonalEvent(event.id)}
                    >
                      删除
                    </button>
                  </li>
                ))}
                {(eventMap.get(selectedDate) ?? []).length === 0 &&
                (personalEventMap.get(selectedDate) ?? []).length === 0 ? (
                  <li className="empty">没有特别事件</li>
                ) : null}
              </ul>
              <div className="personal-form">
                <input
                  type="text"
                  placeholder="添加个人日程"
                  value={newEventTitle}
                  onChange={(event) => setNewEventTitle(event.target.value)}
                />
                <button type="button" onClick={() => addPersonalEvent()}>
                  添加
                </button>
                <p className="hint">仅保存在本地浏览器，不上传云端。</p>
              </div>
            </aside>
          </>
        ) : (
          <div className="list-view">
            {monthEvents.length ? (
              <ul className="event-list">
                {monthEvents.map((event) => {
                  const eventDate = new Date(event.start);
                  const lunarInfo = lunarMap.get(toISODate(eventDate));

                  return (
                    <li key={event.id} className={`event-item ${event.type}`}>
                      <div>
                        <strong>{event.title}</strong>
                        <span>{formatEventRange(event)}</span>
                      </div>
                      <div className="meta">
                        <span className={`badge ${event.type}`}>
                          {event.type === "workday" ? "补" : event.type === "holiday" ? "休" : "其"}
                        </span>
                        <span
                          className={`source-shape ${getSourceStyle(event, overseasIdSet)}`}
                          aria-hidden="true"
                        />
                        <span className="type-label">{getTypeLabel(event.type)}</span>
                        {lunarInfo?.display ? (
                          <span className="lunar-badge">{lunarInfo.display}</span>
                        ) : null}
                      </div>
                      {event.description ? <p>{event.description}</p> : null}
                    </li>
                  );
                })}
              {personalEvents
                .filter((event) => event.date.startsWith(viewDate.toISOString().slice(0, 7)))
                .map((event) => (
                  <li key={event.id} className="event-item personal">
                    <div>
                      <strong>{event.title}</strong>
                      <span>{event.date}</span>
                    </div>
                    <div className="meta">
                      <span className="badge personal">私</span>
                      <span className="type-label">个人日程</span>
                    </div>
                  </li>
                ))}

              </ul>
            ) : (
              <p className="empty">本月没有匹配的事件</p>
            )}
          </div>
        )}
      </section>

      <section className="subscribe" id="subscribe">
        <h2>订阅方式</h2>
        <p>提供中国节假日/调休、海外节假日，以及其他节日/纪念日三种订阅。</p>
        <div className="link-grid">
          <div className="link-card">
            <h3>中国节假日 / 调休</h3>
            <div className="link-row">
              <span>WebCal</span>
              <code>{links?.china.webcalLink ?? "webcal://your-domain/calendar.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.china.webcalLink, "china-webcal");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "china-webcal" ? <em className="copied">已复制</em> : null}
            </div>
            <div className="link-row">
              <span>HTTPS</span>
              <code>{links?.china.httpsLink ?? "https://your-domain/calendar.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.china.httpsLink, "china-https");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "china-https" ? <em className="copied">已复制</em> : null}
            </div>
          </div>
          <div className="link-card">
            <h3>海外节假日（多国合并）</h3>
            <div className="link-row">
              <span>WebCal</span>
              <code>{links?.overseas.webcalLink ?? "webcal://your-domain/calendar-overseas.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.overseas.webcalLink, "overseas-webcal");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "overseas-webcal" ? <em className="copied">已复制</em> : null}
            </div>
            <div className="link-row">
              <span>HTTPS</span>
              <code>{links?.overseas.httpsLink ?? "https://your-domain/calendar-overseas.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.overseas.httpsLink, "overseas-https");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "overseas-https" ? <em className="copied">已复制</em> : null}
            </div>
          </div>
          <div className="link-card">
            <h3>其他节日 / 纪念日</h3>
            <div className="link-row">
              <span>WebCal</span>
              <code>{links?.other.webcalLink ?? "webcal://your-domain/calendar-other.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.other.webcalLink, "other-webcal");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "other-webcal" ? <em className="copied">已复制</em> : null}
            </div>
            <div className="link-row">
              <span>HTTPS</span>
              <code>{links?.other.httpsLink ?? "https://your-domain/calendar-other.ics"}</code>
              <button
                className="copy"
                type="button"
                disabled={!links}
                onClick={() => {
                  if (links) {
                    copyLink(links.other.httpsLink, "other-https");
                  }
                }}
              >
                复制链接
              </button>
              {copiedKey === "other-https" ? <em className="copied">已复制</em> : null}
            </div>
          </div>
        </div>
        <ol className="subscribe-steps">
          <li>选择你需要的订阅类型（中国、海外或其他节日）。</li>
          <li>在系统日历或 Outlook/Google Calendar 中粘贴订阅。</li>
          <li>保持订阅自动刷新，节假日变更会及时同步。</li>
        </ol>
        <p className="note">建议在 iOS/macOS/Outlook 等客户端使用 WebCal 订阅。</p>
      </section>

      <footer>
        <p>GeekCalendarLab 极客日历实验室，让订阅更轻松。</p>
      </footer>
    </div>
  );
}
