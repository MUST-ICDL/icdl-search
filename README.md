# MUST students' ICDL Certificate Search Website

## 1. Project Description
This project is a fast, web application that enables MUST students to query their ICDL certificate status. 


## 2. How to Access the Website
If deployed to GitHub Pages, the website can be accessed securely from anywhere via your GitHub Pages URL:


👉 **[https://MUST-ICDL.github.io/icdl-search/](https://must-icdl.github.io/icdl-search/)**

Users can search for their certificate by entering their unique 9-digit padded ID. Results are bookmarkable since searches update the URL (e.g., `?id=000049965`).


## 3. Architecture & Technical Notes
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
