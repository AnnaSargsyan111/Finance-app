import type { DeepPartial } from "../translate";
import type { common as En } from "./common.en";

export const common: DeepPartial<typeof En> = {
  meta: {
    description: "Finova՝ անձնական ֆինանսներ, շուկայի և նորությունների տեղեկատվություն և տեղեկատվական ներդրումային գաղափարներ մեկ վայրում։",
    personalFinance: "Իմ ֆինանսները",
    market: "Շուկա և նորություններ",
    news: "Նորություններ",
    invest: "Ներդրումային առաջարկ",
    history: "Առաջարկների պատմություն",
    settings: "Կարգավորումներ / Պրոֆիլ",
    assistant: "AI օգնական",
    auth: "Մուտք կամ գրանցում",
  },
  language: {
    label: "Լեզու",
    switchTo: "Փոխել լեզուն",
    en: "English",
    hy: "Հայերեն",
    shortEn: "EN",
    shortHy: "ՀԱՅ",
  },
  greeting: {
    night: "Բարի գիշեր",
    morning: "Բարի լույս",
    afternoon: "Բարի օր",
    evening: "Բարի երեկո",
  },
  ago: {
    justNow: "հենց նոր",
    minutes: "{n} րոպե առաջ",
    hours: "{n} ժամ առաջ",
    days: "{n} օր առաջ",
  },
  monthShort: { m01: "հունվ", m02: "փետր", m03: "մարտ", m04: "ապր", m05: "մայիս", m06: "հունիս", m07: "հուլիս", m08: "օգս", m09: "սեպ", m10: "հոկ", m11: "նոյ", m12: "դեկ" },
  monthLong: { m01: "Հունվար", m02: "Փետրվար", m03: "Մարտ", m04: "Ապրիլ", m05: "Մայիս", m06: "Հունիս", m07: "Հուլիս", m08: "Օգոստոս", m09: "Սեպտեմբեր", m10: "Հոկտեմբեր", m11: "Նոյեմբեր", m12: "Դեկտեմբեր" },
  monthInDate: { m01: "հունվարի", m02: "փետրվարի", m03: "մարտի", m04: "ապրիլի", m05: "մայիսի", m06: "հունիսի", m07: "հուլիսի", m08: "օգոստոսի", m09: "սեպտեմբերի", m10: "հոկտեմբերի", m11: "նոյեմբերի", m12: "դեկտեմբերի" },
  dateShort: "{d} {m} {y}",
  dateDayMonth: "{d} {m}",
  dateMonthYear: "{m} {y}",
  dateLong: "{d} {m} {y}",
  dateTime: "{d} {m} {y}, {time}",
};
