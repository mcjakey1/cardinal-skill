/**
 * Whether an id names a row the server could actually have.
 *
 * `courses.id`, `skill_nodes.id` and `missions.id` are all `uuid` columns, so a
 * uuid is the only id a progress RPC can accept. Everything the app carries that
 * is not one belongs to a local fixture: the example course is the string
 * `demo` and its missions are slugs like `describing-read`.
 *
 * This guard exists because that distinction was not being made. A signed-in
 * student working through the example course had every completion queued and
 * flushed to `set_mission_completion`, which answered `22P02 invalid input
 * syntax for type uuid` on each one. The failures were caught and discarded, so
 * the screen went on showing XP and a mastered node that no server had agreed
 * to — and the queue could never drain, because nothing in it would ever be
 * accepted.
 *
 * Local progress on a local course is the correct behaviour. Sending it
 * anywhere is not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isServerId(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID.test(id);
}
