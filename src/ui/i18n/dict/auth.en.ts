/** English texts of the "auth" area (the source of truth): sign-in, sign-up, password reset, and the sign-up page's information sections. */
export const auth = {
  /** heading and lead of the four states of the one auth page */
  mode: {
    signup: { title: "Create your account", lead: "Start tracking your money and the markets in one calm place." },
    login: { title: "Welcome back", lead: "Log in to continue to Finova." },
    forgot: { title: "Forgot your password?", lead: "Enter your email and we'll send you a link to reset it." },
    reset: { title: "Choose a new password", lead: "Pick a strong password you haven't used before." },
  },
  fields: {
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    emailAddress: "Email address",
    password: "Password",
    newPassword: "New password",
  },
  signup: {
    submit: "Create account",
    haveAccount: "Already have an account?",
    logIn: "Log in",
  },
  login: {
    forgot: "Forgot password?",
    submit: "Log in",
    noAccount: "Don't have an account yet?",
    signUp: "Sign up",
  },
  forgot: {
    submit: "Send reset link",
    sent: "If an account exists, we've sent an email with a link to reset your password.",
    backToLogin: "Back to log in",
  },
  reset: {
    submit: "Reset password",
    backToLogin: "Back to log in",
    tokenMissing: "This reset link is missing its token. Request a new link to continue.",
    requestNew: "Request a new link",
    done: "Your password has been changed. You can log in with the new password.",
    logIn: "Log in",
    linkInvalid: "This reset link is invalid or has expired. Request a new one.",
    newLink: "New link",
  },
  /** messages for API error codes (the server's English text is the fallback for any other code) */
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Can't reach Finova. Check your connection and try again.",
    rateLimited: "Too many attempts. Please try again later.",
    emailTaken: "We couldn't create an account with these details. Try logging in or resetting your password.",
    invalidCredentials: "Email or password is incorrect.",
  },
  /** field validation messages (validate.ts) */
  validation: {
    required: "This field is required.",
    invalidEmail: "Enter a valid email address",
    passwordMismatch: "Passwords don't match.",
  },
  /** full-screen message while the app opens after signing up or in */
  transition: {
    signup: "Setting up your account",
    login: "Signing you in",
  },
  /** left panel of the sign-up, forgot and reset states */
  aside: {
    heroLead: "Your money, ",
    heroMuted: "in one clear view.",
    point1: "Plan income and expenses period by period, with charts that follow your numbers.",
    point2: "Follow exchange rates, big-tech stocks and trusted financial news.",
    point3: "Explore informational investment ideas that match your risk and horizon.",
    disclaimer: "Informational tool. Not investment advice.",
  },
  /** the password checklist (also shown in Settings > Change password) */
  passwordRules: {
    label: "Password requirements",
    met: " (met)",
    notMet: " (not met yet)",
    minLength: "8+ characters",
    uppercase: "Uppercase",
    lowercase: "Lowercase",
    number: "Number",
    symbol: "Symbol",
  },
  /** "Source: {name}" under statistics, facts and ideas (the source's name itself is not translated) */
  source: {
    label: "Source: {name}",
    newTab: " (opens in a new tab)",
  },
  /** left panel of the log-in state */
  loginRules: {
    title: "Money rules of thumb",
    then: "then…",
    save: {
      lead: "If I save, ",
      payFirst: {
        title: "I pay myself first.",
        body: "I split take-home pay 50% needs, 30% wants, 20% savings and debts, and move the 20% before I spend.",
      },
      automate: {
        title: "I automate it and grow it with every raise.",
        body: "Savers who committed part of each pay rise went from 3.5% to 13.6% of income in 40 months.",
      },
      safetyNet: {
        title: "I start a safety net today, even a small one.",
        body: "I look at past surprises, like a repair or a medical bill, and save enough to cover one.",
      },
    },
    stocks: {
      lead: "If I buy stocks, ",
      diversify: {
        title: "I diversify.",
        body: "I spread my money across many investments, which may limit losses without giving up much potential gain.",
      },
      noTiming: {
        title: "I invest regularly instead of timing the market.",
        body: "In a 20-year Schwab study, buying at the worst moment every year still ended with $151,343, against $47,357 in cash.",
      },
      moneyNotNeeded: {
        title: "I only invest money I won't need soon.",
        body: "The SEC calls a stock-heavy portfolio inappropriate for a short-term goal, like saving for a summer holiday.",
      },
    },
  },
  /** "The stock market in numbers" (sign-up page) */
  marketFacts: {
    eyebrow: "Before you start",
    title: "The stock market in numbers",
    lead: "A few things worth knowing about the markets Finova helps you follow.",
    note: "Figures are historical and sourced as noted. For general information only, not investment advice.",
    /** abbreviations after a figure: $148.5T, ≈ $587B */
    trillionSuffix: "T",
    billionSuffix: "B",
    stats: {
      annual: { label: "Traded on world stock exchanges in a year", caption: "Total value of shares traded in 2024" },
      daily: { label: "Traded on an average trading day", caption: "Our calculation: the yearly figure divided by about {days} trading days" },
      high: { label: "Highest price ever for a single share", caption: "Berkshire Hathaway Class A, intraday high on 2 May 2025" },
      crash: { label: "Biggest one-day crash on record", caption: "Dow Jones, 19 October 1987, known as Black Monday (508 points)" },
    },
    facts: {
      voc: {
        tag: "1602 · Amsterdam",
        title: "The first stock market IPO",
        body: "The Dutch East India Company (VOC) was the first company to sell shares to the general public, with a minimum buy-in of 3,000 guilders. At its peak it is estimated to have been worth about $7.9 trillion in today's money, though inflation-adjusted figures like this are debated.",
      },
      nvidia: {
        tag: "October 2025",
        title: "$4 trillion to $5 trillion in 79 trading days",
        body: "On 29 October 2025 Nvidia became the first public company ever to be worth $5 trillion. Its climb from $4 trillion took just 79 trading days.",
      },
      growth: {
        tag: "2025",
        title: "$23 trillion added in one year",
        body: "World stock markets grew 18.5% in 2025, adding over $23 trillion in value and ending the year worth $151.94 trillion in total.",
      },
      ipos: {
        tag: "2025",
        title: "1,471 companies went public",
        body: "That is 8.7% more than in 2024, or roughly four new listings every day. Each one followed the path the VOC started in 1602: offering shares to ordinary investors.",
      },
    },
  },
  /** "The psychology of spending" (sign-up page) */
  spending: {
    eyebrow: "Know your habits",
    title: "The psychology of spending",
    lead: "Four ideas from behavioural economics that explain why money so often leaves our hands faster than we planned.",
    note: "Summaries of published research and popular ideas, with sources. Some, like the Latte Factor, are debated. For general information only, not financial advice.",
    painOfPaying: {
      tag: "Behavioural economics · 1998",
      title: "The pain of paying",
      body: "Paying hurts, and how much depends on how you pay. Handing over cash makes the cost feel real, while a card or a tap delays and softens that feeling. Drazen Prelec and George Loewenstein described this tug-of-war between the pleasure of buying and the pain of paying in 1998.",
      exampleLabel: "In an experiment",
      exampleText: "People bidding for Boston Celtics tickets bid more than twice as much when they could pay by credit card as when they had to pay in cash.",
    },
    diderotEffect: {
      tag: "Paris · 1769",
      title: "The Diderot Effect",
      body: "One new purchase makes everything you already own feel out of date, so you keep upgrading to match it. The philosopher Denis Diderot received a scarlet dressing gown, then replaced his chair, desk and prints to live up to it, and ended up in debt. The anthropologist Grant McCracken named the effect in 1986.",
      exampleLabel: "In his words",
      exampleText: "“I was absolute master of my old dressing gown, but I have become a slave to my new one.”",
    },
    latteFactor: {
      tag: "1995 · A debated idea",
      title: "The Latte Factor",
      body: "Financial author David Bach coined it in 1995: small daily purchases, like a $5 coffee, add up, and if invested instead they could grow into a fortune. It became hugely popular after his 1999 book Smart Women Finish Rich.",
      exampleLabel: "The criticism",
      exampleText: "His projection of over $2 million assumed an 11% yearly return, above the historical Dow Jones average of about 9.7%. Critics add that big shocks like job loss, divorce or medical bills hurt savings far more than small treats do.",
    },
    mentalAccounting: {
      tag: "Nobel Prize · 2017",
      title: "Mental accounting",
      body: "We sort money into separate mental accounts, such as bills, holidays or fun money, and judge each choice by its effect on that account rather than on our total wealth. Richard Thaler's work on it was part of his 2017 Nobel Prize in Economics.",
      exampleLabel: "In practice",
      exampleText: "Many households keep one pot for bills and another for holidays, with rules against using one to pay for the other, even though it is all the same money.",
    },
  },
  /** closing call to action of the sign-up page */
  getStarted: {
    title: "Ready to start?",
    lead: "Create your account and start tracking your money and the markets in one calm place.",
    button: "Get started",
    buttonHint: " (goes to the sign-up form)",
  },
} as const;
