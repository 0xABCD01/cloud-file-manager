"use client";

import { useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth";

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  barColor: string;
}

function evaluatePassword(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: "Too weak", color: "text-gray-400", barColor: "bg-gray-200" },
    { score: 1, label: "Weak", color: "text-red-500", barColor: "bg-red-500" },
    { score: 2, label: "Fair", color: "text-yellow-500", barColor: "bg-yellow-500" },
    { score: 3, label: "Good", color: "text-blue-500", barColor: "bg-blue-500" },
    { score: 4, label: "Strong", color: "text-green-500", barColor: "bg-green-500" },
  ];

  return levels[score];
}

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(pw: string): Requirement[] {
  return [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Upper and lowercase letters", met: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "At least one number", met: /\d/.test(pw) },
    { label: "At least one special character", met: /[^a-zA-Z0-9]/.test(pw) },
  ];
}

export default function RegisterPage() {
  const register = useAuthStore((s) => s.register);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const requirements = useMemo(() => getRequirements(password), [password]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !displayName.trim() || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const reqs = getRequirements(password);
    if (!reqs.every((r) => r.met)) {
      setError("Password does not meet all requirements.");
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
      setSubmitted(true);
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Check your email
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          We sent a verification link to <strong>{email}</strong>. Please verify
          your email to continue.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-blue-600 hover:text-blue-500"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">Create account</h2>
      <p className="mt-1 text-sm text-gray-500">
        Get started with CloudVault
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gray-700"
          >
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm"
            placeholder="Create a strong password"
          />

          {/* Strength indicator */}
          {password.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-8 rounded-full transition-colors ${
                        i < strength.score ? strength.barColor : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${strength.color}`}>
                  {strength.label}
                </span>
              </div>

              {/* Requirements checklist */}
              <ul className="space-y-1" aria-label="Password requirements">
                {requirements.map((req) => (
                  <li
                    key={req.label}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {req.met ? (
                      <svg
                        className="h-3.5 w-3.5 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-3.5 w-3.5 text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    )}
                    <span
                      className={req.met ? "text-green-700" : "text-gray-500"}
                    >
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm"
            placeholder="Re-enter your password"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="mt-1 text-xs text-red-500" role="alert">
              Passwords do not match
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg
                className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
