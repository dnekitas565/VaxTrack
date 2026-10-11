/** An error whose message is safe to show to the client */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ORA-20xxx codes from the PL/SQL packages (see the table in db/04_pkg_newborn.sql)
const STATUS_BY_ORA = {
  20001: 404, // baby not found
  20002: 404, // vaccine not found
  20003: 422, // DOB in the future
  20004: 404, // dose record not found
  20005: 409, // dose already administered
  20006: 422, // administered date before DOB
  20007: 422, // administered date in the future
  20008: 422, // baby too young for the dose
  20009: 409, // no usable stock
  20010: 409, // cannot reschedule a DONE dose
  20011: 422, // reschedule date in the past
  20012: 422, // reschedule date outside the age window
  20013: 409, // DONE cannot go back to PENDING
  20014: 400, // invalid input
  20015: 404, // clinic not found
  20016: 400, // user not found
  20017: 409, // guardian already has a login
  20018: 409, // username already taken
  20019: 400, // invalid account data
  20020: 409, // date of birth conflicts with a dose already given
  20021: 403, // only an administrator may change or delete a newborn
};

// ORA-0184x / 0185x / 0190x: malformed date or time value
const DATE_FORMAT_ERRORS = new Set([1830, 1839, 1843, 1847, 1861, 1858]);

/** "ORA-20005: message\nORA-06512: at ..." -> "message" */
function oraMessage(err) {
  const first = String(err.message || '').split('\n')[0];
  return first.replace(/^ORA-\d{5}:\s*/, '').trim();
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  const num = err?.errorNum;
  if (num >= 20001 && num <= 20098) {
    return res.status(STATUS_BY_ORA[num] ?? 400).json({ error: oraMessage(err), code: `ORA-${num}` });
  }
  if (DATE_FORMAT_ERRORS.has(num)) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  // anything else (including -20099): log the detail, tell the client nothing internal
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
}
