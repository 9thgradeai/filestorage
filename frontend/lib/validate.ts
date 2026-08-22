// Client-side mirrors of the backend's Joi validation (services/validation.ts).
// Purely advisory — the server remains the source of truth; these checks just
// save users a round-trip and keep empty forms off the network.

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Returns null when the password satisfies the OWASP-aligned policy
// (min 8, max 128, lower + upper + number + special), else a human hint.
export function passwordIssue(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character';
  return null;
}
