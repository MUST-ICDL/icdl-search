/**
 * search.js — Binary search engine for sorted, fixed-width TSV files.
 *
 * The data file must be sorted by zero-padded integer ID (first column).
 * Each row is: ID\tField2\tField3\t...\tFieldN\n
 *
 * Uses HTTP Range requests so only ~20 small fetches are needed for 50,000 rows.
 */

// ===== Configuration =====
const DATA_FILE_PATH = 'data/data.tsv';
const CHUNK_SIZE = 512;         // bytes per Range request
const ID_PAD_LENGTH = 9;        // zero-pad width

// Field names in order of appearance
const FIELD_NAMES = ['id', 'name', 'EGT', 'Last_Date', 'status'];

// ===== Helper Functions =====

/**
 * Left-pad an integer ID with zeros.
 * @param {number|string} id
 * @returns {string} e.g. "00000042"
 */
function padID(id) {
  return String(id).padStart(ID_PAD_LENGTH, '0');
}

/**
 * Get the total size of the data file in bytes via HEAD request.
 * @returns {Promise<number>}
 */
async function getFileSize() {
  const resp = await fetch(DATA_FILE_PATH, { method: 'HEAD' });
  const len = resp.headers.get('Content-Length');
  if (!len) throw new Error('Server did not return Content-Length. Range requests may not be supported.');
  return parseInt(len, 10);
}

/**
 * Fetch a byte range from the data file.
 * @param {number} start - inclusive start byte
 * @param {number} end   - inclusive end byte
 * @returns {Promise<string>} chunk of text
 */
async function fetchChunk(start, end) {
  const resp = await fetch(DATA_FILE_PATH, {
    headers: { 'Range': `bytes=${start}-${end}` }
  });
  return resp.text();
}

/**
 * Given a raw chunk, find the first COMPLETE line within it.
 * If isFileStart is false, we skip the first (likely partial) line.
 * @param {string} text
 * @param {boolean} isFileStart - true if chunk starts at byte 0
 * @returns {string|null} first complete line or null
 */
function extractFirstCompleteLine(text, isFileStart) {
  const lines = text.split('\n');

  if (isFileStart) {
    // First line is complete
    return lines[0] || null;
  }

  // Skip the partial first line, return the next one
  if (lines.length >= 2 && lines[1].length > 0) {
    return lines[1];
  }
  return null;
}

/**
 * Parse the integer ID from the first field of a TSV line.
 * @param {string} line
 * @returns {number}
 */
function parseID(line) {
  const first = line.split('\t')[0];
  return parseInt(first, 10);
}

// ===== Binary Search =====

/**
 * Search for a row by integer ID using binary search over HTTP Range requests.
 *
 * @param {number|string} targetID - the MUST ID to find
 * @returns {Promise<{found: boolean, raw: string}>}
 *   found=true  → raw contains the matching TSV line
 *   found=false → raw contains a descriptive dummy line
 */
async function searchByID(targetID) {
  const target = typeof targetID === 'string' ? parseInt(targetID, 10) : targetID;

  if (isNaN(target) || target < 1) {
    return {
      found: false,
      raw: `-1\tINVALID\tThe provided ID "${targetID}" is not a valid positive integer.\t-\t-\t-`
    };
  }

  let fileSize;
  try {
    fileSize = await getFileSize();
  } catch (e) {
    return {
      found: false,
      raw: `-1\tERROR\tCould not reach the data file: ${e.message}\t-\t-\t-`
    };
  }

  let low = 0;
  let high = fileSize;
  let iterations = 0;
  const MAX_ITER = 40; // safety limit
  const LINEAR_THRESHOLD = CHUNK_SIZE * 4; // switch to linear scan when range is small

  // --- Phase 1: Binary search to narrow the range ---
  while ((high - low) > LINEAR_THRESHOLD && iterations < MAX_ITER) {
    iterations++;
    const mid = Math.floor((low + high) / 2);

    const fetchEnd = Math.min(mid + CHUNK_SIZE - 1, fileSize - 1);
    const chunk = await fetchChunk(mid, fetchEnd);
    const line = extractFirstCompleteLine(chunk, mid === 0);

    if (!line) {
      high = mid;
      continue;
    }

    const rowID = parseID(line);

    if (rowID === target) {
      return { found: true, raw: line };
    } else if (rowID < target) {
      // Advance low past this line
      const lineStart = chunk.indexOf(line);
      low = mid + lineStart + line.length + 1;
    } else {
      // Target is before this line — move high to the start of this line
      const lineStart = chunk.indexOf(line);
      high = mid + lineStart;
    }
  }

  // --- Phase 2: Linear scan of the remaining small range ---
  const scanEnd = Math.min(high + CHUNK_SIZE, fileSize - 1);
  const remaining = await fetchChunk(low, scanEnd);
  const lines = remaining.split('\n');

  for (const line of lines) {
    if (!line || line.length < ID_PAD_LENGTH) continue;
    const rowID = parseID(line);
    if (rowID === target) {
      return { found: true, raw: line };
    }
    // Since file is sorted, stop early if we've passed the target
    if (rowID > target) break;
  }

  return {
    found: false,
    raw: `-1\tNOT FOUND\tNo record matches ID: ${padID(target)}\t-\t-\t-`
  };
}

// ===== Field Extractor =====

/**
 * Extract named fields from a raw TSV line.
 * @param {string} rawLine
 * @returns {object} e.g. { found, id, name, course, date, status, center }
 */
function extractFields(rawLine) {
  const parts = rawLine.split('\t');
  const obj = {};

  FIELD_NAMES.forEach((name, i) => {
    obj[name] = parts[i] || '-';
  });

  // Determine if this was a real result or a dummy
  obj.found = (parseInt(obj.id, 10) > 0);

  return obj;
}

// ===== Exports (module-compatible + global fallback) =====
// Works as ES module or plain <script>

if (typeof window !== 'undefined') {
  window.SearchEngine = { searchByID, extractFields, padID, FIELD_NAMES };
}

export { searchByID, extractFields, padID, FIELD_NAMES };
