import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// JSON holds extensible provider-independent fields; frequently queried fields are indexed columns.
export const parcelsTable = sqliteTable('parcels', {
  id: text('id').primaryKey(),
  trackingNumber: text('tracking_number').notNull(),
  carrierCode: text('carrier_code').notNull(),
  status: text('normalized_status').notNull(),
  archivedAt: text('archived_at'),
  nextRefreshAt: text('next_refresh_at'),
  payload: text('payload').notNull(),
  version: integer('version').notNull(),
});
