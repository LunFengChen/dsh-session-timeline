/**
 * Small host-side adapter for reading the locale preference from the settings
 * provider. DSH 0.1.7 exposes live values through describe(), keyed by profile
 * entry id.
 *
 * @module dsh-session-timeline/settings-locale
 */

/** Minimal settings provider face needed by the locale reader. */
export interface SettingsProviderLike {
  /**
   * Read live plugin forms.
   * @returns Forms keyed by unique profile entry ids.
   */
  describe(): Array<{ ns: string; value?: unknown }>
}

/**
 * Read one settings section.
 * @param provider - Settings provider owning the namespace.
 * @param namespace - Profile entry id.
 * @returns The resolved namespace value, when it is registered.
 */
export function readSettingsSection(provider: SettingsProviderLike, namespace: string): unknown {
  if (typeof provider.describe !== 'function') return undefined
  return provider.describe().find(row => row.ns === namespace)?.value
}
