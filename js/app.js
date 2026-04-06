/**
 * app.js — UI controller, URL parameter handler, and cookie manager.
 *
 * This module wires up the search form, parses URL query params,
 * manages the last-search cookie, and renders results.
 */

import { searchByID, extractFields, padID } from './search.js';

// ===== DOM References =====
const searchForm = document.getElementById('searchForm');
const idInput = document.getElementById('idInput');
const searchBtn = document.getElementById('searchBtn');
const formError = document.getElementById('formError');
const spinnerWrapper = document.getElementById('loadingSpinner');
const resultSection = document.getElementById('resultsSection');
const cookieHint = document.getElementById('cookieHint');

// ===== Cookie Helpers =====

const COOKIE_NAME = 'lastSearch';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

/**
 * Save the last searched ID to a cookie.
 * @param {string} id
 */
function saveLastSearch(id) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

/**
 * Load the last searched ID from cookie.
 * @returns {string|null}
 */
function loadLastSearch() {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ===== URL Parameter Parser =====

/**
 * Parse the current URL query string.
 * @returns {object} e.g. { id: "00000042", highlight: "course" }
 */
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// ===== UI Helpers =====

function showLoading() {
  spinnerWrapper.classList.add('visible');
  resultSection.classList.remove('visible');
}

function hideLoading() {
  spinnerWrapper.classList.remove('visible');
}

function clearResults() {
  resultSection.classList.remove('visible');
  resultSection.innerHTML = '';
}

function showFormError(message) {
  formError.textContent = message;
  formError.classList.add('visible');
  idInput.classList.add('input--error');
}

function clearFormError() {
  formError.classList.remove('visible');
  idInput.classList.remove('input--error');
}

/**
 * Render a successful search result.
 * @param {object} fields — from extractFields()
 * @param {string|null} highlightField — optional field key to highlight
 */
function renderResult(fields, highlightField) {
  const statusClass = fields.status === 'Found' ? 'badge--pass'
    : fields.status === 'Not Found' ? 'badge--fail'
      : 'badge--pending';

  const makeField = (label, value, key) => {
    const hlClass = (highlightField && key === highlightField) ? ' highlight' : '';
    if (key === 'status') {
      return `
        <div class="result-field">
          <span class="result-field__label">${label}</span>
          <span class="badge ${statusClass}">${value}</span>
        </div>`;
    }
    return `
      <div class="result-field">
        <span class="result-field__label">${label}</span>
        <span class="result-field__value${hlClass}">${value}</span>
      </div>`;
  };

  resultSection.innerHTML = `
    <div class="result-card">
      <div class="result-card__header">
        <span class="result-card__id">ID #${fields.id}</span>
        <span class="badge ${statusClass}">${fields.status}</span>
      </div>
      <div class="result-card__body">
        ${makeField('Candidate Name', fields.name, 'name')}
        ${makeField('EGT', fields.EGT, 'EGT')}
        ${makeField('Last Exam Date', fields.Last_Date, 'Last_Date')}
        ${makeField('Status', fields.status, 'status')}
      </div>
    </div>`;

  resultSection.classList.add('visible');
}

/**
 * Render a "not found" error inside the results section.
 * @param {object} fields — from extractFields() for dummy row
 */
function renderNotFound(fields) {
  resultSection.innerHTML = `
    <div class="result-card">
      <div class="error-box">
        <div class="error-box__icon">🔍</div>
        <h3 class="error-box__title">Certificate Not Found</h3>
        <p class="error-box__text">${fields.EGT || 'No record matches the provided ID.'}
        <br>Please double-check the MUST ID and try again only if you attended ICDL exams at MUST between 2014 and 2022 and got 75% or higher in each ICDL module.</p>
      </div>
    </div>`;

  resultSection.classList.add('visible');
}

// ===== Main Search Flow =====

/**
 * Execute a full search: validate → show spinner → search → render.
 * @param {string} rawID — user-supplied ID string
 * @param {string|null} highlightField
 */
async function executeSearch(rawID, highlightField) {
  clearFormError();
  clearResults();

  // Validate
  const trimmed = rawID.trim();
  if (!trimmed) {
    showFormError('Please enter a MUST ID.');
    return;
  }
  if (!/^\d+$/.test(trimmed)) {
    showFormError('ID must be a positive number (digits only).');
    return;
  }

  const paddedID = padID(trimmed);

  // Update the URL without reload (for bookmarking)
  const newURL = `search.html?id=${paddedID}${highlightField ? '&highlight=' + highlightField : ''}`;
  window.history.replaceState(null, '', newURL);

  // Search
  showLoading();
  searchBtn.disabled = true;

  try {
    const result = await searchByID(paddedID);
    const fields = extractFields(result.raw);

    hideLoading();

    if (fields.found) {
      renderResult(fields, highlightField);
      saveLastSearch(paddedID);
    } else {
      renderNotFound(fields);
    }
  } catch (err) {
    hideLoading();
    renderNotFound({ EGT: 'An unexpected error occurred: ' + err.message });
  } finally {
    searchBtn.disabled = false;
  }
}

// ===== Event Listeners =====

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  executeSearch(idInput.value, null);
});

// Clear error on typing
idInput.addEventListener('input', clearFormError);

// ===== Initialisation on Page Load =====

document.addEventListener('DOMContentLoaded', () => {
  const params = parseURLParams();

  if (params.id) {
    // URL has an id param — auto-search
    idInput.value = params.id;
    executeSearch(params.id, params.highlight || null);
  } else {
    // No URL param — check cookie
    const lastID = loadLastSearch();
    if (lastID) {
      idInput.value = lastID;
      if (cookieHint) {
        cookieHint.textContent = `Last searched ID: ${lastID}`;
        cookieHint.style.display = 'flex';
      }
    }
  }

  // Footer year (if present on this page)
  const footerYear = document.getElementById('footerYear');
  if (footerYear) footerYear.textContent = new Date().getFullYear();
});
