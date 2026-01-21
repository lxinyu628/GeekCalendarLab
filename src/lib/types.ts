export type HolidayType = "holiday" | "workday" | "other";

export type HolidayEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  type: HolidayType;
  description?: string;
  source?: string;
  sources?: string[];
};
