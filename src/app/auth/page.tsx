import { signupEnabled } from "~/server/better-auth/auth";
import { AuthForm } from "./AuthForm";

/**
 * Server shell so the form knows whether registration is open without a
 * round trip: `ALLOW_SIGNUP` is a server-side switch and must not be read in
 * the browser.
 */
export default function AuthPage() {
  return <AuthForm signupEnabled={signupEnabled} />;
}
