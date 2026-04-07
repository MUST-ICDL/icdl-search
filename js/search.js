/**
 * search.js — Search engine loaded entirely in-memory.
 *
 * The data file must be sorted by zero-padded integer ID (first column).
 * Each row is: ID\tField2\tField3\t...\tFieldN
 */

// ===== Configuration =====
const DATA_FILE_PATH = 'data/data.tsv';
const ID_PAD_LENGTH = 9;        // zero-pad width

// Field names in order of appearance
const FIELD_NAMES = ['id', 'name', 'EGT', 'Last_Date', 'status'];

let cachedLines = null;

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
 * Download the data file and cache it as an array of lines.
 */
async function loadData() {
  if (cachedLines !== null) {
    return cachedLines;
  }
  
  // Use fetch to download the entire file once
  const resp = await fetch(DATA_FILE_PATH);
  if (!resp.ok) {
    throw new Error(`Server returned ${resp.status}`);
  }
  
  const text = await resp.text();
  // Split into lines, handle both LF and CRLF, filter out empty ones
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  // Remove header if the first line doesn't start with a number
  if (lines.length > 0) {
    const firstId = parseInt(lines[0].split('\t')[0], 10);
    if (isNaN(firstId)) {
      lines.shift();
    }
  }
  
  cachedLines = lines;
  return cachedLines;
}

// ===== Binary Search =====

/**
 * Search for a row by integer ID using binary search over the loaded array.
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

  let lines;
  try {
    lines = await loadData();
  } catch (e) {
    return {
      found: false,
      raw: `-1\tERROR\tCould not reach the data file: ${e.message}\t-\t-\t-`
    };
  }

  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const line = lines[mid];
    const firstTab = line.indexOf('\t');
    const idStr = firstTab === -1 ? line : line.substring(0, firstTab);
    const rowID = parseInt(idStr, 10);

    if (isNaN(rowID)) {
      // Should not happen as we filtered lines, but fallback to linear scan if it does
      break;
    }

    if (rowID === target) {
      return { found: true, raw: line };
    } else if (rowID < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Fallback linear scan just in case the array wasn't perfectly sorted
  // or we broke out of the binary search loop
  const scanStart = Math.max(0, low - 50);
  const scanEnd = Math.min(lines.length - 1, high + 50);
  
  for (let i = scanStart; i <= scanEnd; i++) {
    const line = lines[i];
    const firstTab = line.indexOf('\t');
    const idStr = firstTab === -1 ? line : line.substring(0, firstTab);
    const rowID = parseInt(idStr, 10);
    
    if (rowID === target) {
      return { found: true, raw: line };
    }
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
 * @returns {object} e.g. { found, id, name, last_date, status }
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
