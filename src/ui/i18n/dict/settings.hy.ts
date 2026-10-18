import type { DeepPartial } from "../translate";
import type { settings as En } from "./settings.en";

/** Armenian texts of the "settings" area. */
export const settings: DeepPartial<typeof En> = {
  title: "Կարգավորումներ / Պրոֆիլ",
  subtitle: "Տվյալները, որ նշել եք հաշիվ ստեղծելիս։",
  profile: {
    title: "Պրոֆիլ",
    eyebrow: "Հաշվի տվյալներ",
    firstName: "Անուն",
    lastName: "Ազգանուն",
    email: "Էլ. փոստ",
    emailFixed: "Էլ. փոստի հասցեն հնարավոր չէ փոխել։",
    save: "Պահպանել փոփոխությունները",
    saved: "Ձեր փոփոխությունները պահպանվեցին։",
    saveFailed: "Չհաջողվեց պահպանել փոփոխությունները։ Խնդրում ենք կրկին փորձել։",
  },
  security: {
    title: "Անվտանգություն",
    eyebrow: "Գաղտնաբառ և սեսիա",
    changeText: "Փոխեք գաղտնաբառը։ Գաղտնաբառը փոխելով դուք համակարգից դուրս չեք գա։",
    changeButton: "Փոխել գաղտնաբառը",
    signOutText: "Դուրս գալով՝ կկատարեք ելք համակարգից։ Տվյալները տեսնելու համար նորից պետք է մուտք գործեք։",
    signOut: "Դուրս գալ",
    changed: "Գաղտնաբառը փոխվեց։ Ձեր մյուս սեսիաներից դուրս եք բերվել։",
  },
  password: {
    title: "Գաղտնաբառի փոփոխություն",
    newPassword: "Նոր գաղտնաբառ",
    confirmPassword: "Կրկնեք գաղտնաբառը",
    cancel: "Չեղարկել",
    save: "Պահպանել",
    tooManyAttempts: "Չափազանց շատ փորձեր։ Խնդրում ենք մի քանի րոպե սպասել և կրկին փորձել։",
  },
};
