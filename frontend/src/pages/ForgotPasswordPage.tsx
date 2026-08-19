import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { Card } from "../components/Card";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuth: true,
      });
      // The backend deliberately returns the exact same success response whether or not this
      // email matches an account, so it doesn't leak which emails are registered users -
      // showing that same generic message here, rather than anything more specific, is what
      // keeps that protection intact all the way to the screen.
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setFormError("Please enter a valid email address.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <Card>
        <h1 className="mb-2 text-2xl font-semibold text-text">Forgot password</h1>
        {submitted ? (
          <p role="status" className="mt-4 text-text-muted">
            If that email is registered, a reset link has been sent.
          </p>
        ) : (
          <>
            <p className="mb-6 text-text-muted">
              Enter your account&apos;s email address and we&apos;ll send you a link to reset your
              password.
            </p>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              {formError && (
                <p role="alert" className="text-sm text-danger">
                  {formError}
                </p>
              )}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}
        <p className="mt-4 text-sm text-text-muted">
          <Link to="/login" className="font-medium text-brand hover:underline">
            Back to log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
