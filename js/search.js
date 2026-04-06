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

async function getFileSize() {
  // We use a GET request with Range: bytes=0-0 to prevent the CDN from returning
  // the gzip-compressed total file size in Content-Length. 
  // The uncompressed total size will be explicitly given in Content-Range (e.g. "bytes 0-0/342638")
  const resp = await fetch(DATA_FILE_PATH, { headers: { 'Range': 'bytes=0-0' } });
  
  const contentRange = resp.headers.get('Content-Range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  // Fallback if the server ignores the Range request
  const len = resp.headers.get('Content-Length');
  if (!len) throw new Error('Server did not return Content-Length or Content-Range.');
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
  const MAX_ITER = 50; // safety limit
  const LINEAR_THRESHOLD = CHUNK_SIZE * 8; // switch to linear scan when range is small

  // --- Phase 1: Binary search to narrow the byte range ---
  while ((high - low) > LINEAR_THRESHOLD && iterations < MAX_ITER) {
    iterations++;
    const mid = Math.floor((low + high) / 2);

    const fetchEnd = Math.min(mid + CHUNK_SIZE - 1, fileSize - 1);
    const chunk = await fetchChunk(mid, fetchEnd);

    // Find the newline that ends the partial line we landed in
    const newlinePos = chunk.indexOf('\n');
    if (newlinePos === -1 || newlinePos + 1 >= chunk.length) {
      // No complete line in this chunk — shrink from above
      high = mid;
      continue;
    }

    // The next complete line starts right after the newline
    const lineAfterNewline = chunk.substring(newlinePos + 1).split('\n')[0];
    if (!lineAfterNewline || lineAfterNewline.length < 3) {
      high = mid;
      continue;
    }

    const rowID = parseID(lineAfterNewline);

    // Skip non-numeric lines (e.g. header row)
    if (isNaN(rowID)) {
      low = mid + newlinePos + 1 + lineAfterNewline.length + 1;
      continue;
    }

    if (rowID === target) {
      return { found: true, raw: lineAfterNewline };
    } else if (rowID < target) {
      // Target is after this line — advance low past it
      low = mid + newlinePos + 1 + lineAfterNewline.length + 1;
    } else {
      // Target is before this line — set high to the byte where this line starts
      // (which is mid + newlinePos + 1), so the target line is still in [low, high)
      high = mid + newlinePos + 1;
    }
  }

  // --- Phase 2: Linear scan of the remaining small range ---
  // Fetch a generous window to ensure we don't miss the target
  const scanStart = Math.max(0, low - 1);
  const scanEnd = Math.min(high + CHUNK_SIZE * 2, fileSize - 1);
  const remaining = await fetchChunk(scanStart, scanEnd);
  const lines = remaining.split('\n');

  for (const line of lines) {
    if (!line || line.length < 3) continue;
    const rowID = parseID(line);
    if (isNaN(rowID)) continue; // skip header
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
