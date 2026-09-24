export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  // LAB-2 demo: an unused variable on purpose, so ESLint fails and the PR is blocked.
  const unusedForDemo = 'this PR must not be mergeable';
  return EMAIL_PATTERN.test(value.trim());
}
