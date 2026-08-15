import { Link } from "react-router-dom";
import { Card } from "../components/Card";

export function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <Card>
        <h1 className="text-2xl font-semibold text-text">Forgot password</h1>
        <p className="mt-2 text-text-muted">Coming in a later phase.</p>
        <p className="mt-4 text-sm text-text-muted">
          <Link to="/login" className="font-medium text-brand hover:underline">
            Back to log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
