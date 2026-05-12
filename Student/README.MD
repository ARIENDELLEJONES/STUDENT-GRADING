# Student Academic Portal
 
A modern, educational student portal for viewing grades and academic performance. Designed for deployment on **Vercel** with a **Google Apps Script** backend.
 
## Features
 
- **Student Login** — Secure login with Student ID and password
- **Academic Dashboard** — View all scores: Midterm Collective, Midterm Exam, Final Collective, Final Exam
- **Dark / Light Mode** — Toggle between themes; respects system preference and persists choice
- **Print Grades** — Print-optimized layout sized to 1/4 of A4 bond paper (148.5mm × 105mm)
- **Password Reset** — Students can request a password change through the portal
- **Responsive Design** — Works on desktop, tablet, and mobile
 
## Project Structure
 
```
├── index.html          # Main HTML page
├── css/
│   └── styles.css      # Styles with dark/light mode + print layout
├── js/
│   └── app.js          # Application logic (login, dashboard, print, theme)
├── gas/
│   └── Code.gs         # Google Apps Script backend (deploy as Web App)
├── vercel.json         # Vercel deployment configuration
└── README.md
```
 
## Setup
 
### 1. Deploy the Google Apps Script Backend
 
1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Copy the contents of `gas/Code.gs` into the script editor
4. Update the `SPREADSHEET_ID` constant if needed
5. Click **Deploy → New deployment**
6. Choose **Web app**
7. Set **Execute as**: *Me*
8. Set **Who has access**: *Anyone*
9. Click **Deploy** and copy the Web App URL
 
### 2. Configure the Frontend
 
1. Open `js/app.js`
2. Replace `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL` with the URL from step 1
 
### 3. Deploy to Vercel
 
1. Push this repo to GitHub
2. Go to [Vercel](https://vercel.com/) and import the repository
3. No build configuration needed — Vercel will serve the static files directly
4. Click **Deploy**
 
## Spreadsheet Structure (tblDatabase)
 
The backend expects a Google Sheet named `tblDatabase` with:
 
| Row | Content |
|-----|---------|
| 1   | (unused / title row) |
| 2   | Header row 2 (activity names) |
| 3   | Header row 3 (highest possible scores) |
| 4+  | Student data |
 
**Column mapping:**
- A (0): Student ID / Username
- B (1): Thai Name
- C (2): English Name
- D (3): Section
- E (4): Class Number
- F (5): Password
- G–U (6–20): Midterm Collective activities
- V–W (21–22): Midterm totals
- X–AB (23–27): Midterm Exam activities
- AC–AD (28–29): Midterm Exam totals
- AE–AF (30–31): Midterm Overall
- AG–AU (32–46): Final Collective Partial activities
- AV–AX (47–49): Final Collective Partial totals
- AY (50): Final Partial overall
- AZ–BI (51–60): Final Collective Final activities
- BJ–BL (61–63): Final Collective Final totals
- BM (64): Final Collective overall
- BN–BR (65–69): Final Exam activities
- BS–BU (70–72): Final Exam totals
- BV (73): Final Exam overall
- BW (74): Final Grade Classification
- BX (75): Password change request flag
- BY (76): Password change request date
 
## Print Layout
 
The print feature generates a compact grade report sized to **1/4 of A4 bond paper** (148.5mm × 105mm). Use your browser's print dialog:
- Select **Save as PDF** to download
- Or print directly to a printer
 
## License
 
ISC