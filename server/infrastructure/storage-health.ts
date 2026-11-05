import type pg from "pg";
import {missingStorage,storageMeasurement} from "../../shared/storage-health.js";
export async function databaseStorageHealth(pool:Pick<pg.Pool,"query">){
  try{
    // Keep one measurement per UTC hour. No historical sample or observation is removed.
    await pool.query(`INSERT INTO database_size_samples(sample_hour,measured_at,size_bytes)
      SELECT date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',clock_timestamp(),pg_database_size(current_database())
      WHERE NOT EXISTS(SELECT 1 FROM database_size_samples WHERE sample_hour=date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      ON CONFLICT DO NOTHING`);
    const result=await pool.query(`SELECT latest.size_bytes,latest.measured_at,baseline.size_bytes AS baseline_bytes,baseline.measured_at AS baseline_at
      FROM (SELECT * FROM database_size_samples ORDER BY sample_hour DESC LIMIT 1) latest
      LEFT JOIN LATERAL(SELECT size_bytes,measured_at FROM database_size_samples WHERE measured_at<=latest.measured_at-interval '24 hours' ORDER BY sample_hour DESC LIMIT 1) baseline ON true`);
    const row=result.rows[0];if(!row)return missingStorage();
    const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
    return storageMeasurement(Number(row.size_bytes),iso(row.measured_at),row.baseline_at?{sizeBytes:Number(row.baseline_bytes),measuredAt:iso(row.baseline_at)}:null);
  }catch{return missingStorage();}
}
