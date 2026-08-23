/**
 * Employment statuses that put someone outside the attendance population.
 *
 * The attendance module already excluded exactly this set when it built rosters, resolved
 * shifts and finalized a month. It is named here so the same definition also gates the
 * self-service punch routes: an employee the roster does not contain must not be able to
 * punch into it.
 *
 * `EXITED` and `INACTIVE` cover the two ways employment ends - immediate termination and
 * deactivation. `CANDIDATE` and `PREBOARDING` are the two ways it has not started yet.
 * `ON_NOTICE` and `ABSCONDING` are deliberately absent: both are still employed, and
 * whether a given day counts is a question for finalization, not for the punch.
 */
export const NON_WORKING_ATTENDANCE_STATUSES = [
  'EXITED',
  'INACTIVE',
  'CANDIDATE',
  'PREBOARDING',
] as const;
