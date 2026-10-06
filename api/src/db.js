import oracledb from 'oracledb';
import { config } from './config.js';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Oracle DATE columns are sent to clients as 'YYYY-MM-DD' strings. The driver builds a JS Date at local
// midnight, so local getters give back the stored calendar day (no time-zone shift reaches the UI).
const two = (n) => String(n).padStart(2, '0');
oracledb.fetchTypeHandler = (metaData) => {
  if (metaData.dbType === oracledb.DB_TYPE_DATE) {
    return {
      converter: (v) => (v instanceof Date ? `${v.getFullYear()}-${two(v.getMonth() + 1)}-${two(v.getDate())}` : v),
    };
  }
  return undefined;
};

let pool;

export async function initPool() {
  pool = await oracledb.createPool({
    ...config.db,
    poolMin: 1,
    poolMax: 8,
  });
  return pool;
}

export async function closePool() {
  if (pool) await pool.close(10);
}

/** NUMBER bind that may be null */
export const num = (v) => ({ val: v ?? null, type: oracledb.NUMBER });
/** VARCHAR2 bind that may be null */
export const str = (v) => ({ val: v ?? null, type: oracledb.STRING });
export const outNum = () => ({ dir: oracledb.BIND_OUT, type: oracledb.NUMBER });

const lowerKeys = (rows) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));

/**
 * One request = one connection: get -> set_actor -> fn -> commit (rollback on error) -> release.
 * The PL/SQL packages commit their own units of work; the commit here only closes anything left open.
 */
export async function withConn(userId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.execute('BEGIN newborn_vaccination_pkg.set_actor(:id); END;', { id: num(userId) });
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* connection may already be gone */
    }
    throw err;
  } finally {
    await conn.close();
  }
}

/** SELECT with bind variables; rows come back with lower-case keys */
export async function query(conn, sql, binds = {}) {
  const result = await conn.execute(sql, binds);
  return lowerKeys(result.rows ?? []);
}

/** Call a PL/SQL procedure whose last parameter is `:cur`, an OUT SYS_REFCURSOR */
export async function callCursor(conn, plsql, binds = {}) {
  const result = await conn.execute(plsql, {
    ...binds,
    cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR },
  });
  const rs = result.outBinds.cur;
  try {
    return lowerKeys(await rs.getRows());
  } finally {
    await rs.close();
  }
}

/** Call a PL/SQL statement that has no result set */
export async function call(conn, plsql, binds = {}) {
  return conn.execute(plsql, binds);
}
