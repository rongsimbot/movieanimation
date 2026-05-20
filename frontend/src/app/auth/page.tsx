"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser, loginUser, storeAuth, RegisterParams, LoginParams } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (mode === "register" && form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match" });
      return;
    }

    setLoading(true);

    try {
      if (mode === "register") {
        const result = await registerUser({
          name: form.name,
          email: form.email,
          password: form.password,
        } as RegisterParams);

        if (result.ok && result.data) {
          storeAuth(result.data);
          router.push("/dashboard");
        } else {
          if (result.details) {
            const fe: Record<string, string> = {};
            result.details.forEach((d) => {
              fe[d.field] = d.message;
            });
            setFieldErrors(fe);
          }
          setError(result.error || "Registration failed");
        }
      } else {
        const result = await loginUser({
          email: form.email,
          password: form.password,
        } as LoginParams);

        if (result.ok && result.data) {
          storeAuth(result.data);
          router.push("/dashboard");
        } else {
          if (result.details) {
            const fe: Record<string, string> = {};
            result.details.forEach((d) => {
              fe[d.field] = d.message;
            });
            setFieldErrors(fe);
          }
          setError(result.error || "Login failed");
        }
      }
    } catch (err: any) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError("");
    setFieldErrors({});
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            🎬 MovieAnimation
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {mode === "login"
              ? "Sign in to your account"
              : "Create your account"}
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Global Error */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Name (Register only) */}
            {mode === "register" && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-zinc-300 mb-1.5"
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className={`w-full rounded-lg border bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 ${
                    fieldErrors.name
                      ? "border-red-500/50 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-700"
                  }`}
                  placeholder="Your name"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-400">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={`w-full rounded-lg border bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 ${
                  fieldErrors.email
                    ? "border-red-500/50 focus:border-red-500 focus:ring-red-500"
                    : "border-zinc-700"
                }`}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                className={`w-full rounded-lg border bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 ${
                  fieldErrors.password
                    ? "border-red-500/50 focus:border-red-500 focus:ring-red-500"
                    : "border-zinc-700"
                }`}
                placeholder={
                  mode === "register"
                    ? "Min. 8 chars, 1 uppercase, 1 number"
                    : "Your password"
                }
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-400">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Confirm Password (Register only) */}
            {mode === "register" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-zinc-300 mb-1.5"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    updateField("confirmPassword", e.target.value)
                  }
                  className={`w-full rounded-lg border bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 ${
                    fieldErrors.confirmPassword
                      ? "border-red-500/50 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-700"
                  }`}
                  placeholder="Repeat your password"
                />
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-semibold"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-6 text-center text-sm text-zinc-400">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-white hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-white hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-600">
          SimRobotics Corp &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
