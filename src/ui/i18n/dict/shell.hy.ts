import type { DeepPartial } from "../translate";
import type { shell as En } from "./shell.en";

/** Armenian texts of the "shell" area. */
export const shell: DeepPartial<typeof En> = {
  nav: {
    personalFinance: "Իմ ֆինանսները",
    market: "Շուկա և նորություններ",
    invest: "Ներդրումային առաջարկ",
    assistant: "AI օգնական",
    settings: "Կարգավորումներ / Պրոֆիլ",
  },
  topbar: {
    skip: "Անցնել բովանդակությանը",
    home: "Finova՝ գլխավոր էջ",
    mainNav: "Հիմնական",
    openMenu: "Բացել ընտրացանկը",
    closeMenu: "Փակել ընտրացանկը",
    profileMenu: "Պրոֆիլի ընտրացանկ՝ {name}",
    profile: "Պրոֆիլ",
    logOut: "Դուրս գալ",
    hello: "Բարև, {name}",
    greetLine: "{greeting}, {name}",
  },
  splash: {
    loading: "Բեռնվում է",
    preparing: "Պատրաստվում է ձեր աշխատանքային էջը",
  },
  session: {
    errorTitle: "Չհաջողվեց բեռնել ձեր սեսիան",
    errorMessage: "Ստուգեք ինտերնետ կապը և կրկին փորձեք։",
  },
  error: {
    title: "Ինչ-որ բան այնպես չգնաց",
    message: "Այս էջը ցուցադրելիս անսպասելի սխալ տեղի ունեցավ։",
  },
  notFound: {
    title: "Այս էջը գոյություն չունի",
    message: "Հղումը կարող է սխալ լինել, կամ էջը տեղափոխված լինի։",
    action: "Անցնել Finova",
  },
  ui: {
    loading: "Բեռնվում է",
    retry: "Կրկին փորձել",
    somethingWentWrong: "Ինչ-որ բան այնպես չգնաց",
    demoData: "Օրինակելի տվյալներ",
    demoTitle: "Այս բաժինն օգտագործում է օրինակելի տվյալներ, քանի որ դրա սերվերային մասը դեռ չի գործարկվել։",
    noChangeData: "Փոփոխության տվյալներ չկան",
    up: "աճ",
    down: "նվազում",
    unchanged: "առանց փոփոխության",
    show: "Ցույց տալ",
    hide: "Թաքցնել",
    showPassword: "Ցույց տալ գաղտնաբառը",
    hidePassword: "Թաքցնել գաղտնաբառը",
    dismiss: "Փակել ծանուցումը",
    whatIs: "Ի՞նչ է՝ {title}",
    closeExplanation: "Փակել բացատրությունը",
    viewTable: "Տեսնել տվյալները աղյուսակով",
  },
};
