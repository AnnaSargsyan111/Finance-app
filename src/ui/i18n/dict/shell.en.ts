/** English texts of the "shell" area (the source of truth): top bar, session, splash, error pages and the shared components. */
export const shell = {
  /** main menu labels (fixed by the spec) */
  nav: {
    personalFinance: "Personal Finance",
    market: "Market & News",
    invest: "Investment Recommendation",
    assistant: "AI Assistant",
    settings: "Settings / Profile",
  },
  topbar: {
    skip: "Skip to content",
    home: "Finova home",
    mainNav: "Main",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    profileMenu: "Profile menu: {name}",
    profile: "Profile",
    logOut: "Log Out",
    /** shown before the greeting is known (first paint) */
    hello: "Hello, {name}",
    /** "Good morning, Anna" */
    greetLine: "{greeting}, {name}",
  },
  splash: {
    loading: "Loading",
    preparing: "Preparing your workspace",
  },
  session: {
    errorTitle: "We couldn't load your session",
    errorMessage: "Check your connection and try again.",
  },
  error: {
    title: "Something went wrong",
    message: "An unexpected error occurred while showing this page.",
  },
  notFound: {
    title: "This page doesn't exist",
    message: "The link may be broken or the page may have moved.",
    action: "Go to Finova",
  },
  /** built-in texts of the shared components (a text passed in as a prop is translated by the screen that passes it) */
  ui: {
    loading: "Loading",
    retry: "Retry",
    somethingWentWrong: "Something went wrong",
    demoData: "Demo data",
    demoTitle: "This section uses sample data because its backend endpoint is not live yet.",
    noChangeData: "No change data",
    up: "up",
    down: "down",
    unchanged: "unchanged",
    show: "Show",
    hide: "Hide",
    showPassword: "Show password",
    hidePassword: "Hide password",
    dismiss: "Dismiss notification",
    whatIs: "What is {title}?",
    closeExplanation: "Close explanation",
    viewTable: "View data as a table",
  },
} as const;
