// Deliberately excludes rows, sequence positions and Prisma's infrastructure table.
// Used to verify a baseline without changing business data.
export async function schemaSnapshot(client) {
 const queries = {
  columns: `SELECT table_name, column_name, (row_number() OVER (PARTITION BY table_name ORDER BY ordinal_position))::int AS ordinal_position, data_type, udt_name, is_nullable, column_default, character_maximum_length, datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position`,
  constraints: `SELECT c.conrelid::regclass::text AS relation, c.conname AS name, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conrelid <> COALESCE(to_regclass('public._prisma_migrations'),0) ORDER BY relation, name`,
  indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename, indexname`,
  triggers: `SELECT t.tgrelid::regclass::text AS relation, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY relation, name`,
  functions: `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY name`,
  enums: `SELECT t.typname AS name, e.enumlabel AS value, e.enumsortorder AS position FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY name, position`,
  sequences: `SELECT sequencename, data_type, start_value, min_value, max_value, increment_by, cycle, cache_size FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`
 };
 const result = {};
 for (const [key, sql] of Object.entries(queries)) result[key] = (await client.query(sql)).rows;
 // PostgreSQL rewrites these four expressions when dumping/restoring old columns
 // that previously changed type. These checks contain only AND comparisons or
 // text-list membership; parentheses and varchar/text casts are equivalent here.
 const restoredChecks = new Set(['employee_settings_display_language_check','employee_social_links_platform_check','it_asset_credentials_type_check','work_calendars_scheduled_work_minutes_per_day_check']);
 for (const item of result.constraints) if (restoredChecks.has(item.name)) {
  item.definition = item.definition.split(/('(?:[^']|'')*')/).map((part,index) => index%2 ? part : part.replace(/::character varying|::text\[\]|::text/g,'').replace(/[()]/g,'')).join('');
 }
 for (const item of result.functions) item.definition = item.definition.replaceAll('\r\n','\n');
 return result;
}
