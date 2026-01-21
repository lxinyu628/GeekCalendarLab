import { Lunar, HolidayUtil } from "lunar-javascript";

type LunarInfo = {
  display: string;
  lunarText: string;
  festival?: string;
  solarTerm?: string;
};

const getFestivalLabel = (date: Date) => {
  const holiday = HolidayUtil.getHoliday(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
  return holiday?.getName() ?? "";
};

export const getLunarInfo = (date: Date): LunarInfo => {
  const lunar = Lunar.fromDate(date);
  const festival = getFestivalLabel(date) || lunar.getFestivals().join(" ") || undefined;
  const solarTerm = lunar.getJieQi() || undefined;
  const lunarText = lunar.getDayInChinese();

  let display = "";
  if (festival) {
    display = festival;
  } else if (solarTerm) {
    display = solarTerm;
  } else {
    display = lunarText;
  }

  return {
    display,
    lunarText,
    festival,
    solarTerm
  };
};
