export * from "./types";
export * from "./storage";
export * from "./queue";
export * from "./cache";
export * from "./sync";

import { migrateToSQLite } from "./migrate";

/**
 * Initialize the offline service.
 * Should be called at app startup.
 */
export async function initOffline() {
  await migrateToSQLite();
}

export { migrateToSQLite };

// Re-export specific storage keys for convenience if needed by consumers
import { STORAGE_KEYS } from "./types";
export { STORAGE_KEYS };
