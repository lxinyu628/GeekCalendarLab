declare module "lunar-javascript" {
  export const Lunar: {
    fromDate(date: Date): {
      getDayInChinese(): string;
      getFestivals(): string[];
      getJieQi(): string;
    };
  };

  export const HolidayUtil: {
    getHoliday(
      year: number,
      month: number,
      day: number
    ): {
      getName(): string;
    } | null;
  };
}
