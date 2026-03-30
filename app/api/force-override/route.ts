/**
 * Backward-compatibility proxy.
 * All logic now lives in /api/override — this file simply re-exports it.
 */
export { GET, POST, DELETE } from "../override/route";
