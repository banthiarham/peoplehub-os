/**
 * Shape-tolerant selectors for shared dropdown option queries.
 *
 * `['employees', 'options']` is a React Query cache key several pages share, and
 * they do not agree on what they store under it: most cache the whole
 * `/employees/meta/options` object, one used to cache only `data.managers`.
 * Whichever page mounts first wins the cache entry, so a consumer can be handed
 * either shape and `.map()` throws on the wrong one. These selectors pick the
 * employee array out of whatever is cached, and never return a non-array.
 */

export interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string | null;
}

/** Narrows any cached value to an array, so callers can always `.map()`. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * The employee list from `/employees/meta/options`, whether the cache holds the
 * full options object or just the `managers` array.
 */
export function employeeOptionsFrom(value: unknown): EmployeeOption[] {
  if (Array.isArray(value)) return value as EmployeeOption[];
  const managers = (value as { managers?: unknown } | null | undefined)?.managers;
  return asArray<EmployeeOption>(managers);
}

/** "Rohan Kapoor (EMP-0008)", falling back to the name when no code is set. */
export function employeeLabel(employee: EmployeeOption): string {
  const name = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
  return employee.employeeCode ? `${name} (${employee.employeeCode})` : name;
}
