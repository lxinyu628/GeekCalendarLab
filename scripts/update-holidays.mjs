import fs from "node:fs/promises";
import path from "node:path";
import ICAL from "ical.js";
import ical from "ical-generator";

const root = new URL("..", import.meta.url);
const sourcesPath = new URL("../data/sources.json", import.meta.url);
const outputDataPath = new URL("../data/holidays.json", import.meta.url);
const outputOverseasDataPath = new URL("../data/holidays-overseas.json", import.meta.url);
const outputChinaIcsPath = new URL("../public/calendar.ics", import.meta.url);
const outputOverseasIcsPath = new URL("../public/calendar-overseas.ics", import.meta.url);
const outputOtherIcsPath = new URL("../public/calendar-other.ics", import.meta.url);

const readSources = async () => {
  const raw = await fs.readFile(sourcesPath, "utf-8");
  const { sources } = JSON.parse(raw);
  return sources.map((source) => ({
    ...source,
    region: source.region === "overseas" ? "overseas" : "china"
  }));
};

const normalizeDate = (icalTime) => {
  if (!icalTime) return undefined;
  if (icalTime.isDate) {
    return icalTime.toString();
  }
  return icalTime.toJSDate().toISOString();
};

const isWeekend = (value) => {
  if (!value) return false;
  const date = typeof value === "string" ? new Date(value) : value;
  const day = date.getDay();
  return day === 0 || day === 6;
};

const detectType = (summary, description, start) => {
  const summaryText = summary ?? "";
  const summaryLower = summaryText.toLowerCase();
  const descriptionText = description ?? "";
  const descriptionLower = descriptionText.toLowerCase();

  const hasHolidayText =
    summaryText.includes("假期") ||
    summaryText.includes("休") ||
    summaryText.includes("放假") ||
    summaryLower.includes("holiday") ||
    summaryLower.includes("day off") ||
    summaryLower.includes("vacation") ||
    descriptionText.includes("假期") ||
    descriptionText.includes("休") ||
    descriptionText.includes("放假") ||
    descriptionLower.includes("holiday") ||
    descriptionLower.includes("day off") ||
    descriptionLower.includes("vacation");

  const hasWorkdayText =
    summaryText.includes("补班") ||
    summaryText.includes("调休") ||
    summaryText.includes("上班") ||
    summaryText.includes("(班)") ||
    summaryText.includes("（班）") ||
    summaryLower.includes("workday") ||
    summaryLower.includes("working day") ||
    summaryLower.includes("make-up") ||
    summaryLower.includes("makeup") ||
    summaryLower.includes("compensatory") ||
    descriptionText.includes("补班") ||
    descriptionText.includes("调休") ||
    descriptionText.includes("上班") ||
    descriptionLower.includes("workday") ||
    descriptionLower.includes("working day") ||
    descriptionLower.includes("make-up") ||
    descriptionLower.includes("makeup") ||
    descriptionLower.includes("compensatory");

  if (hasHolidayText && !hasWorkdayText) {
    return "holiday";
  }
  if (hasWorkdayText && !hasHolidayText) {
    return isWeekend(start) ? "workday" : "other";
  }
  if (hasHolidayText) {
    return "holiday";
  }
  return "other";
};

const cleanTitle = (value) => {
  if (!value) return "未命名事件";
  return value
    .replace(/第\d+天\s*\/\s*共\d+天/g, "")
    .replace(/[「」『』]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const addUtcDays = (date, amount) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

const expandAllDayEvents = (items) => {
  const expanded = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (const item of items) {
    if (!item.allDay || !item.end) {
      expanded.push(item);
      continue;
    }
    const startDate = new Date(item.start);
    const endDate = new Date(item.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      expanded.push(item);
      continue;
    }
    const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / dayMs);
    if (dayCount <= 1) {
      expanded.push(item);
      continue;
    }
    for (let offset = 0; offset < dayCount; offset += 1) {
      const dayStart = addUtcDays(startDate, offset);
      const dayEnd = addUtcDays(startDate, offset + 1);
      expanded.push({
        ...item,
        start: dayStart.toISOString(),
        end: dayEnd.toISOString()
      });
    }
  }
  return expanded;
};

const fetchIcs = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
};

const parseIcs = (icsText, sourceName) => {
  const parsed = ICAL.parse(icsText);
  const calendar = new ICAL.Component(parsed);
  const vevents = calendar.getAllSubcomponents("vevent");

  return vevents
    .map((component) => {
      const event = new ICAL.Event(component);
      const summary = cleanTitle(event.summary || "未命名事件");
      const description = event.description || "";
      const start = normalizeDate(event.startDate);
      const end = normalizeDate(event.endDate);
      const allDay = event.startDate?.isDate ?? false;
      const type = detectType(summary, description, start);

      if (!start) {
        return null;
      }

      return {
        id: `${start}-${summary}-${sourceName}`.replace(/\s+/g, "-"),
        title: summary,
        start,
        end,
        allDay,
        type,
        description,
        source: sourceName
      };
    })
    .filter(Boolean);
};

const normalizeTitle = (title) =>
  title
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[【】\[\]]/g, "")
    .replace(/[\s'’"“”.,-]/g, "")
    .trim();

const mergeEvents = (items, options = {}) => {
  const { includeTitleInKey = false } = options;
  const map = new Map();
  for (const item of items) {
    const dateKey = item.start?.slice(0, 10);
    if (!dateKey) {
      continue;
    }
    const normalizedTitle = normalizeTitle(item.title || "未命名事件");
    const key = includeTitleInKey
      ? `${dateKey}-${item.type}-${normalizedTitle}`
      : `${dateKey}-${item.type}`;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
  }

  const merged = [];
  for (const [key, group] of map.entries()) {
    const titleCounts = new Map();
    const titleGroups = new Map();
    const descriptions = new Set();
    const sources = new Set();
    let allDay = false;
    let earliest = null;
    let latest = null;

    group.forEach((item) => {
      const normalized = normalizeTitle(item.title || "未命名事件");
      const count = titleCounts.get(normalized) ?? 0;
      titleCounts.set(normalized, count + 1);
      const titles = titleGroups.get(normalized) ?? [];
      titles.push(item.title || "未命名事件");
      titleGroups.set(normalized, titles);

      if (item.description) {
        descriptions.add(item.description.trim());
      }

      if (Array.isArray(item.sources)) {
        item.sources.forEach((source) => sources.add(source));
      } else if (item.source) {
        sources.add(item.source);
      }

      if (item.allDay) {
        allDay = true;
      }

      const startDate = item.start ? new Date(item.start) : null;
      const endDate = item.end ? new Date(item.end) : null;
      if (startDate && (!earliest || startDate < earliest)) {
        earliest = startDate;
      }
      if (endDate && (!latest || endDate > latest)) {
        latest = endDate;
      }
    });

    let selectedTitle = "未命名事件";
    let maxCount = 0;
    titleCounts.forEach((count, normalized) => {
      if (count > maxCount) {
        maxCount = count;
        const titles = titleGroups.get(normalized) ?? [];
        selectedTitle = titles.sort((a, b) => a.length - b.length)[0] ?? selectedTitle;
      } else if (count === maxCount) {
        const titles = titleGroups.get(normalized) ?? [];
        const candidate = titles.sort((a, b) => a.length - b.length)[0];
        if (candidate && candidate.length < selectedTitle.length) {
          selectedTitle = candidate;
        }
      }
    });

    const mergedDescription = Array.from(descriptions)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .join(" / ");

    const dateKey = group[0]?.start?.slice(0, 10) ?? key.split("-")[0];
    const start = earliest ? earliest.toISOString() : `${dateKey}T00:00:00.000Z`;
    const end = latest ? latest.toISOString() : undefined;

    let resolvedType = group[0].type;
    if (group.length > 1) {
      const hasWorkdayTitle = group.some((item) => /补班|调休|上班|\(班\)|（班）/.test(item.title ?? ""));
      const hasHolidayTitle = group.some((item) => /假期|休|放假/.test(item.title ?? ""));
      const isWeekendDay = isWeekend(group[0]?.start);
      if (hasHolidayTitle) {
        resolvedType = "holiday";
      } else if (hasWorkdayTitle && isWeekendDay) {
        resolvedType = "workday";
      }
    }

    merged.push({
      id: `${dateKey}-${selectedTitle}-${resolvedType}`.replace(/\s+/g, "-"),
      title: selectedTitle,
      start,
      end,
      allDay,
      type: resolvedType,
      description: mergedDescription || undefined,
      sources: Array.from(sources)
    });
  }

  return merged;
};


const writeCalendar = async ({ items, name, timezone, outputPath }) => {
  const calendar = ical({
    name,
    timezone,
    prodId: "-//GeekCalendarLab//CN"
  });

  items.forEach((item) => {
    const event = calendar.createEvent({
      id: item.id,
      summary: item.title,
      description: item.description,
      allDay: item.allDay,
      start: new Date(item.start),
      end: item.end ? new Date(item.end) : undefined
    });

    if (item.type === "workday") {
      event.transparency("OPAQUE");
    } else {
      event.transparency("TRANSPARENT");
    }
  });

  await fs.writeFile(outputPath, calendar.toString());
};

const writeOutputs = async ({ chinaItems, overseasItems }) => {
  const sortedChina = [...chinaItems].sort((a, b) => a.start.localeCompare(b.start));
  await fs.writeFile(outputDataPath, JSON.stringify(sortedChina, null, 2));

  const chinaCalendarItems = sortedChina.filter((item) => item.type !== "other");
  await writeCalendar({
    items: chinaCalendarItems,
    name: "GeekCalendarLab China Holidays + Workdays",
    timezone: "Asia/Shanghai",
    outputPath: outputChinaIcsPath
  });

  const otherCalendarItems = sortedChina.filter((item) => item.type === "other");
  await writeCalendar({
    items: otherCalendarItems,
    name: "GeekCalendarLab China Observances",
    timezone: "Asia/Shanghai",
    outputPath: outputOtherIcsPath
  });

  const overseasCalendarItems = [...overseasItems]
    .filter((item) => item.type === "holiday")
    .sort((a, b) => a.start.localeCompare(b.start));
  await fs.writeFile(outputOverseasDataPath, JSON.stringify(overseasCalendarItems, null, 2));
  await writeCalendar({
    items: overseasCalendarItems,
    name: "GeekCalendarLab Overseas Holidays (Multi-country)",
    timezone: "UTC",
    outputPath: outputOverseasIcsPath
  });
};

const main = async () => {
  const sources = await readSources();
  const eventsByRegion = {
    china: [],
    overseas: []
  };

  for (const source of sources) {
    const text = await fetchIcs(source.url);
    const parsed = parseIcs(text, source.name);
    const expanded = expandAllDayEvents(parsed);
    if (source.region === "overseas") {
      eventsByRegion.overseas.push(...expanded);
    } else {
      eventsByRegion.china.push(...expanded);
    }
  }

  const mergedChina = mergeEvents(eventsByRegion.china);
  const dedupedChina = mergeEvents(mergedChina);
  const mergedOverseas = mergeEvents(eventsByRegion.overseas, { includeTitleInKey: true });
  await writeOutputs({ chinaItems: dedupedChina, overseasItems: mergedOverseas });

  const dataPath = path.relative(process.cwd(), outputDataPath.pathname);
  const chinaPath = path.relative(process.cwd(), outputChinaIcsPath.pathname);
  const overseasPath = path.relative(process.cwd(), outputOverseasIcsPath.pathname);
  const otherPath = path.relative(process.cwd(), outputOtherIcsPath.pathname);
  console.log(`Generated ${dedupedChina.length} China events -> ${dataPath}`);
  console.log(`China calendar -> ${chinaPath}`);
  console.log(`Overseas calendar -> ${overseasPath} (${mergedOverseas.length} events)`);
  console.log(`Other calendar -> ${otherPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
