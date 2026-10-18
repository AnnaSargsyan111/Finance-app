/** English texts of the "settings" area (the source of truth). */
export const settings = {
  title: "Settings / Profile",
  subtitle: "The details you gave when you created your account.",
  profile: {
    title: "Profile",
    eyebrow: "Account details",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    emailFixed: "Email address cannot be changed.",
    save: "Save changes",
    saved: "Your changes have been saved.",
    saveFailed: "We couldn't save your changes. Please try again.",
  },
  security: {
    title: "Security",
    eyebrow: "Password & session",
    changeText: "Change the password you use to log in. This won't sign you out of this device.",
    changeButton: "Change Password",
    signOutText: "Signing out ends your session on this device. You'll need to log in again to see your data.",
    signOut: "Sign out",
    changed: "Password changed. Your other sessions have been signed out.",
  },
  password: {
    title: "Change password",
    newPassword: "New Password",
    confirmPassword: "Confirm Password",
    cancel: "Cancel",
    save: "Save",
    tooManyAttempts: "Too many attempts. Please wait a few minutes and try again.",
  },
} as const;
