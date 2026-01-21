import fs from "node:fs/promises";
import path from "node:path";
import ICAL from "ical.js";
import ical from "ical-generator";

const root = new URL("..", import.meta.url);
const sourcesPath = new URL("../data/sources.json", import.meta.url);
const outputDataPath = new URL("../data/holidays.json", import.meta.url);
const outputIcsPath = new URL("../public/calendar.ics", import.meta.url);

const readSources = async () => {
  const raw = await fs.readFile(sourcesPath, "utf-8");
  const { sources } = JSON.parse(raw);
  return sources;
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
  if (summaryText.includes("假期") || summaryText.includes("休") || summaryText.includes("放假")) {
    return "holiday";
  }
  if (
    summaryText.includes("补班") ||
    summaryText.includes("调休") ||
    summaryText.includes("上班") ||
    summaryText.includes("(班)") ||
    summaryText.includes("（班）")
  ) {
    return isWeekend(start) ? "workday" : "other";
  }

  const text = description ?? "";
  const hasHolidayText = text.includes("假期") || text.includes("休") || text.includes("放假");
  const hasWorkdayText = text.includes("补班") || text.includes("调休") || text.includes("上班");

  if (hasWorkdayText && !hasHolidayText) {
    return isWeekend(start) ? "workday" : "other";
  }
  if (hasHolidayText) {
    return "holiday";
  }
  return "other";
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
    const summary = event.summary || "未命名事件";
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
    .replace(/\s+/g, "")
    .trim();

const mergeEvents = (items) => {
  const map = new Map();
  for (const item of items) {
    const dateKey = item.start?.slice(0, 10);
    if (!dateKey) {
      continue;
    }
    const key = `${dateKey}-${item.type}`;
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


const writeOutputs = async (items) => {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  await fs.writeFile(outputDataPath, JSON.stringify(sorted, null, 2));

  const calendar = ical({
    name: "China Holidays + Workdays",
    timezone: "Asia/Shanghai",
    prodId: "-//HoliDayflow//CN"
  });

  sorted.forEach((item) => {
    const event = calendar.createEvent({
      id: item.id,
      summary: item.title,
      description: item.description,
      allDay: item.allDay,
      start: new Date(item.start),
      end: item.end ? new Date(item.end) : undefined
    });

    const category = typeof item.type === "string" && item.type.trim().length > 0 ? item.type : "other";
    if (item.type === "workday") {
      event.transparency("OPAQUE");
    } else {
      event.transparency("TRANSPARENT");
    }
  });

  await fs.writeFile(outputIcsPath, calendar.toString());
};

const main = async () => {
  const sources = await readSources();
  const allEvents = [];

  for (const source of sources) {
    const text = await fetchIcs(source.url);
    allEvents.push(...parseIcs(text, source.name));
  }

  const merged = mergeEvents(allEvents);
  await writeOutputs(merged);
  const countPath = path.relative(process.cwd(), outputDataPath.pathname);
  console.log(`Generated ${merged.length} events -> ${countPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
