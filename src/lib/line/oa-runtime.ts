const environmentKeyPattern = /^[A-Z][A-Z0-9_]{2,127}$/;

export function readServerSecret(environmentKey: string | null | undefined, label: string) {
  if (!environmentKey || !environmentKeyPattern.test(environmentKey)) {
    throw new Error(`${label} environment key is invalid.`);
  }

  const value = process.env[environmentKey]?.trim();
  if (!value) {
    throw new Error(`${label} is not configured.`);
  }

  return value;
}
