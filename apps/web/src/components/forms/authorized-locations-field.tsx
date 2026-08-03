'use client';

import { MapPin } from 'lucide-react';

interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  locations?: LocationOption[];
  /** The employee's base location. Always authorized, so it cannot be unticked. */
  primaryLocationId: string;
  /** Extra authorized locations, excluding the primary. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Picks the locations an employee may punch attendance at.
 *
 * The primary location is shown ticked and locked: it is always authorized, so
 * offering to untick it would suggest a state the server does not allow.
 */
export function AuthorizedLocationsField({
  locations,
  primaryLocationId,
  value,
  onChange,
}: Props) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  if (!locations?.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-faint">
        No locations configured yet — add them in Settings → Locations.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-line">
      <div className="max-h-44 overflow-y-auto p-1">
        {locations.map((location) => {
          const isPrimary = location.id === primaryLocationId;
          return (
            <label
              key={location.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                isPrimary ? 'text-ink-muted' : 'cursor-pointer hover:bg-surface-muted'
              }`}
            >
              <input
                type="checkbox"
                checked={isPrimary || value.includes(location.id)}
                disabled={isPrimary}
                onChange={() => toggle(location.id)}
              />
              <MapPin className="h-3.5 w-3.5 text-ink-faint" />
              <span>{location.name}</span>
              {isPrimary && (
                <span className="ml-auto text-[11px] uppercase tracking-wide text-ink-faint">
                  Primary
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-faint">
        Employees can check in and out at any ticked location during the day.
      </p>
    </div>
  );
}
