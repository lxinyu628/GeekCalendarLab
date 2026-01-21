const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" });

export const formatMonthTitle = (date: Date) => monthFormatter.format(date);

export const formatShortWeekday = (date: Date) => weekdayFormatter.format(date);

export const toISODate = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const startOfWeek = (date: Date, weekStartsOn = 1) => {
  const day = date.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  return addDays(date, -diff);
};

export const getMonthGrid = (date: Date) => {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart, 1);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(gridStart, i));
  }
  return days;
};
