/** One documented legacy correction, reconstructed byte-for-byte against the
 * production ledger. No arbitrary checksum overrides or history writes. */
export function migrationHistoryMatch(applied, migration, index) {
  if (!migration || Number(applied.created_at) !== migration.folderMillis) return false;
  if (applied.hash === migration.hash) return 'exact';
  if (index === 5 && migration.folderMillis === 1783884567616
      && applied.hash === '715dde5bb016ceeb3264fe79e14334cb9a9487dcd6b8abd65c0ed1ea445d60b5'
      && migration.hash === '8fd4aefc5bedea21b3b6fe88c904ce3b0f31a5176458916aa7d3fbb0fead0565') {
    return 'legacy-national-stats-nullability';
  }
  return false;
}
