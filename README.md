# MUST students' ICDL Certificate Search Website

## 1. Project Description
This project is a fast, web application that enables MUST students to query their ICDL certificate status. 


## 2. How to Access the Website
If deployed to GitHub Pages, the website can be accessed securely from anywhere via your GitHub Pages URL:


👉 **[https://MUST-ICDL.github.io/icdl-search/](https://must-icdl.github.io/icdl-search/)**

**Test live after upload:** [https://must-icdl.github.io/icdl-search/search.html?id=000049965](https://must-icdl.github.io/icdl-search/search.html?id=000049965)

Users can search for their certificate by entering their unique 9-digit padded ID. Results are bookmarkable since searches update the URL (e.g., `?id=000049965`).


## 3. How to Test Locally
Because the browser needs to fetch the TSV data file, simply opening `search.html` directly via `file://` protocol will not work (due to CORS restrictions).

To run a local HTTPS test server:
```bash
python3 ./private/https_server.py
```
Then access: **https://localhost:8443/search.html**


## 4. How to Update Data
The search engine relies on `data/data.tsv` being strictly zero-padded (9-digit) IDs and numerically sorted.

1. Place your raw certificate export as `data/Cert_isPresent.txt`
2. Run the processing script:
   ```bash
   python3 private/process_certs.py
   ```
   This outputs the properly formatted `data/data.tsv` file.


## 5. Architecture & Technical Notes
- **Data File Schema:**
  - `ID`: 9-digit zero-padded string (e.g., `000054321`)
  - `Name`: Candidate First and Last Name
  - `EGT`: MUST ID reference
  - `Last_Date`: Date of the last exam (DD/MM/YYYY)
  - `Status`: Indicates whether the certificate was officially `Found` or `Not Found` (mapped to visual badges).

- **Browser Storage:**
  - The application utilizes local cookies (expiring in 30 days) to remember the last searched MUST ID, providing a more frictionless experience for returning users.

- **Design System:**
  - Utilizes CSS variables and a flexbox-based responsive grid ensuring compatibility and visual appeal across desktop environments down to mobile viewports.
