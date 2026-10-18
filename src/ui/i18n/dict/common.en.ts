/** Texts used by shared code (dates, greetings, "x min ago", the language switch). Area texts live in their own files. */
export const common = {
  /** browser tab titles and the site description */
  meta: {
    description: "Finova: personal finance, market and news information, and informational investment ideas in one place.",
    personalFinance: "Personal Finance",
    market: "Market & News",
    news: "News",
    invest: "Investment Recommendation",
    history: "Recommendation History",
    settings: "Settings / Profile",
    assistant: "AI Assistant",
    auth: "Log in or sign up",
  },
  language: {
    label: "Language",
    switchTo: "Switch language",
    en: "English",
    hy: "Հայերեն",
    shortEn: "EN",
    shortHy: "ՀԱՅ",
  },
  greeting: {
    night: "Good night",
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },
  ago: {
    justNow: "just now",
    minutes: "{n} min ago",
    hours: "{n} h ago",
    days: "{n} d ago",
  },
  /** short month names, as in "21 Sep 2026" */
  monthShort: { m01: "Jan", m02: "Feb", m03: "Mar", m04: "Apr", m05: "May", m06: "Jun", m07: "Jul", m08: "Aug", m09: "Sep", m10: "Oct", m11: "Nov", m12: "Dec" },
  /** month names on their own, as in "September 2026" */
  monthLong: { m01: "January", m02: "February", m03: "March", m04: "April", m05: "May", m06: "June", m07: "July", m08: "August", m09: "September", m10: "October", m11: "November", m12: "December" },
  /** month names inside a date, as in "September 21, 2026" (Armenian declines the month: "21 սեպտեմբերի 2026") */
  monthInDate: { m01: "January", m02: "February", m03: "March", m04: "April", m05: "May", m06: "June", m07: "July", m08: "August", m09: "September", m10: "October", m11: "November", m12: "December" },
  /** how a date reads: {d} day, {m} month name, {y} year */
  dateShort: "{d} {m} {y}",
  dateDayMonth: "{d} {m}",
  dateMonthYear: "{m} {y}",
  dateLong: "{m} {d}, {y}",
  dateTime: "{d} {m} {y}, {time}",
} as const;
