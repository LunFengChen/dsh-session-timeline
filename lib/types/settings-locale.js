/**
 * Small host-side adapter for reading the locale preference from the settings
 * provider. The current settings API accepts a namespace string directly.
 *
 * @module dsh-session-timeline/settings-locale
 */
/**
 * Read one settings section.
 * @param provider - Settings provider owning the namespace.
 * @param namespace - Registered settings namespace.
 * @returns The resolved namespace value, when it is registered.
 */
export function readSettingsSection(provider, namespace) {
    return provider.get(namespace);
}
//# sourceMappingURL=settings-locale.js.map