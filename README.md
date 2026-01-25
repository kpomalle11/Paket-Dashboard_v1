# Paket Corporation Production Dashboard

Professional manufacturing efficiency dashboard for Paket Corporation's Chicago contract packaging facility.

## 📊 Dashboard Overview

This dashboard provides real-time insights into:
- **Overall Efficiency Metrics** (Target: ≥85%)
- **Line Performance Analysis** (25 production lines)
- **SKU Performance Tracking** (91 SKUs)
- **Operator Efficiency** (11 operators)
- **Historical Trends** (Oct 2025 - Jan 2026)
- **Root Cause Analysis** with actionable recommendations

**Last Updated:** January 25, 2026 at 4:57 PM CST

---

## 🚀 Quick Start - GitHub Pages Hosting

### Step 1: Create GitHub Repository
1. Go to [GitHub](https://github.com) and log in
2. Click the **"+"** icon (top right) → **"New repository"**
3. Repository name: `paket-dashboard` (or your choice)
4. Choose **Public** or **Private** (Private requires GitHub Pro for Pages)
5. Click **"Create repository"**

### Step 2: Upload Files
1. In your new repository, click **"uploading an existing file"**
2. Drag and drop ALL files from this folder:
   - `index.html`
   - `data/paket_data.js`
   - `README.md`
   - `.gitignore`
3. Commit with message: "Initial dashboard deployment"

### Step 3: Enable GitHub Pages
1. Go to **Settings** (in your repository)
2. Scroll to **Pages** (left sidebar)
3. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**
5. Wait 1-2 minutes for deployment

### Step 4: Access Your Dashboard
Your dashboard will be live at:
```
https://[your-username].github.io/paket-dashboard/
```

---

## 📁 Repository Structure

```
paket-dashboard/
├── index.html              # Main dashboard file
├── data/
│   └── paket_data.js       # Production data (91 SKUs, 25 lines)
├── README.md               # This file
└── .gitignore             # Git ignore rules
```

---

## 🔄 How to Update the Dashboard

### Updating Production Data

1. **Export new data** from shift_Report_v5.xlsx
2. **Process data** using the Python analysis scripts
3. **Update** `data/paket_data.js` with new metrics
4. **Commit changes** to GitHub:
   ```bash
   git add data/paket_data.js
   git commit -m "Updated data: [date]"
   git push
   ```
5. Dashboard auto-updates within 1-2 minutes

### Updating the "Last Updated" Timestamp

Edit `index.html`, line ~9:
```html
<div class="updated">📅 Last Updated: [NEW DATE]</div>
```

---

## 📊 Dashboard Tabs Explained

### 1. Overview
- Monthly efficiency trends vs 85% goal
- Line performance rankings
- Data source information
- Lost minutes analysis

### 2. Weekly Detail  
- Daily performance breakdown (Jan 19-25, 2026)
- Total labor count per day
- SKU performance for the week
- Units produced daily

### 3. Operators
- All 11 operators ranked by efficiency
- Run counts and performance vs goal
- Identifies top performers

### 4. Insights
- Root cause analysis (material shortages, pump failures, etc.)
- Success patterns (TRUFRE series excellence)
- Actionable improvement recommendations

### 5. Manager View
- Strategic recommendations
- SKU rationalization guidance
- High-volume winner analysis
- Downtime SKU identification

### 6. Historical Analysis ⭐ **NEW**
- **SKU Lookup**: All 91 SKUs with detailed metrics
  - Total runs, efficiency range
  - Speed range (CPM)
  - Average manning
  - Primary lines used
  - "Art of the possible" calculations
  
- **Line Lookup**: All 25 production lines
  - Historical performance
  - Speed capabilities
  - Top SKUs run
  - Efficiency trends
  
- **Top/Bottom 10 Tables**: Best and worst performers
- **Historical vs Current**: Improving and declining SKUs/lines

---

## 🔧 Customization Options

### Custom Domain
To use `dashboard.paket.com`:
1. Add CNAME file with your domain
2. Configure DNS with your domain provider
3. Update GitHub Pages settings

### Private Dashboard
- Requires GitHub Pro ($4/month)
- Repository Settings → Change to Private
- GitHub Pages still works
- Only authorized users can access

### Automated Updates
Set up GitHub Actions to:
- Pull new data from Excel files
- Process automatically
- Update dashboard weekly

---

## 📈 Key Metrics & Definitions

| Metric | Definition | Target |
|--------|------------|--------|
| **Efficiency** | (Actual Output / Expected Output) × 100% | ≥85% |
| **Lost Minutes** | Downtime due to issues (material, equipment, etc.) | Minimize |
| **CPM** | Cycles Per Minute (machine speed) | Varies by SKU |
| **Manning** | Number of workers assigned to production run | Varies by line |

---

## 🛠️ Technical Details

- **Framework**: Pure HTML5 + JavaScript (no backend required)
- **Charts**: Chart.js 4.x
- **Data Format**: JavaScript object notation (JSON)
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile Responsive**: Yes
- **File Size**: ~150KB total

---

## 📞 Support & Maintenance

**Dashboard Created:** January 25, 2026  
**Data Period:** October 2025 - January 2026  
**Total Runs Analyzed:** 471  
**Production Lines:** 25  
**SKUs Tracked:** 91  

For questions or issues with the dashboard, refer to this README or check the commit history for changes.

---

## 🔐 Security Notes

⚠️ **Important**: This dashboard contains production data. If sensitive:
- Use a **Private** GitHub repository
- Restrict access to authorized personnel only
- Do not share the GitHub Pages URL publicly
- Consider adding password protection via GitHub Actions

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 25, 2026 | Initial release with all 91 SKUs and 25 lines |

---

**🎯 Goal: Achieve ≥85% efficiency across all production lines**

Made with data-driven insights for Paket Corporation
