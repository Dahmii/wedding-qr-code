// Main application state
let parsedData = [];
let selectedColumns = { first: null, last: null };
let generatedQRCodes = [];

// DOM elements
const fileInput = document.getElementById("fileInput");
const parseInfo = document.getElementById("parseInfo");
const rowCount = document.getElementById("rowCount");
const firstSelect = document.getElementById("firstSelect");
const lastSelect = document.getElementById("lastSelect");
const generateBtn = document.getElementById("generateBtn");
const errorMsg = document.getElementById("errorMsg");
const progressSection = document.getElementById("progressSection");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const resultSection = document.getElementById("resultSection");
const previewGrid = document.getElementById("previewGrid");
const downloadBtn = document.getElementById("downloadBtn");

// Initialize event listeners
fileInput.addEventListener("change", handleFileUpload);
generateBtn.addEventListener("click", generateQRCodes);
downloadBtn.addEventListener("click", downloadZip);
firstSelect.addEventListener("change", updateColumnSelection);
lastSelect.addEventListener("change", updateColumnSelection);

/**
 * Handle file upload and parsing
 */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  hideError();
  hideSection(parseInfo);
  hideSection(progressSection);
  hideSection(resultSection);

  try {
    const fileExtension = file.name.toLowerCase().split(".").pop();

    if (fileExtension === "csv") {
      await parseCSVFile(file);
    } else if (fileExtension === "xlsx" || fileExtension === "xls") {
      await parseExcelFile(file);
    } else {
      throw new Error("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
    }

    if (parsedData.length === 0) {
      throw new Error("No data found in the uploaded file");
    }

    setupColumnMapping();
    showSection(parseInfo);
  } catch (error) {
    showError(error.message);
  }
}

/**
 * Parse CSV file using PapaParse
 */
function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        if (results.errors.length > 0) {
          reject(new Error("Error parsing CSV: " + results.errors[0].message));
        } else {
          parsedData = results.data;
          resolve();
        }
      },
      error: function (error) {
        reject(new Error("Failed to parse CSV file: " + error.message));
      },
    });
  });
}

/**
 * Parse Excel file using SheetJS
 */
async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        parsedData = jsonData;
        resolve();
      } catch (error) {
        reject(new Error("Failed to parse Excel file: " + error.message));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}
``;

/**
 * Setup column mapping interface
 */
function setupColumnMapping() {
  if (parsedData.length === 0) return;

  const columns = Object.keys(parsedData[0]);
  rowCount.textContent = `Found ${
    parsedData.length
  } rows with columns: ${columns.join(", ")}`;

  // Clear existing options
  firstSelect.innerHTML = '<option value="">-- Select Column --</option>';
  lastSelect.innerHTML =
    '<option value="">-- Select Column (Optional) --</option>';

  // Add column options
  columns.forEach((col) => {
    const option1 = new Option(col, col);
    const option2 = new Option(col, col);
    firstSelect.appendChild(option1);
    lastSelect.appendChild(option2);
  });

  // Try to auto-detect name columns
  autoDetectColumns(columns);
}

/**
 * Auto-detect name columns based on common patterns
 */
function autoDetectColumns(columns) {
  const fullNamePatterns = /^(full\s?name|name|fullname)$/i;
  const firstNamePatterns = /^(first\s?name|first|fname|given\s?name)$/i;
  const lastNamePatterns = /^(last\s?name|last|lname|surname|family\s?name)$/i;

  let detectedFirst = null;
  let detectedLast = null;

  columns.forEach((col) => {
    if (fullNamePatterns.test(col)) {
      detectedFirst = col;
    } else if (firstNamePatterns.test(col)) {
      detectedFirst = col;
    } else if (lastNamePatterns.test(col)) {
      detectedLast = col;
    }
  });

  if (detectedFirst) {
    firstSelect.value = detectedFirst;
    selectedColumns.first = detectedFirst;
  }
  if (detectedLast) {
    lastSelect.value = detectedLast;
    selectedColumns.last = detectedLast;
  }

  updateGenerateButton();
}

/**
 * Update column selection
 */
function updateColumnSelection() {
  selectedColumns.first = firstSelect.value || null;
  selectedColumns.last = lastSelect.value || null;
  updateGenerateButton();
}

/**
 * Update generate button state
 */
function updateGenerateButton() {
  generateBtn.disabled = !selectedColumns.first;
}

/**
 * Extract names from data based on selected columns
 */
function extractNames() {
  const names = [];

  parsedData.forEach((row) => {
    let firstName = "";
    let lastName = "";

    if (selectedColumns.first) {
      const fullValue = row[selectedColumns.first];
      if (fullValue && typeof fullValue === "string") {
        const trimmed = fullValue.trim();
        if (selectedColumns.last && row[selectedColumns.last]) {
          // Use separate columns
          firstName = trimmed;
          lastName = row[selectedColumns.last].toString().trim();
        } else {
          // Split full name on first space
          const parts = trimmed.split(/\s+/);
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ") || "";
        }
      }
    }

    if (firstName) {
      names.push({ firstName, lastName });
    }
  });

  return names;
}

/**
 * Generate QR codes for all names
 */
async function generateQRCodes() {
  try {
    const names = extractNames();
    if (names.length === 0) {
      throw new Error("No valid names found in the selected columns");
    }

    showSection(progressSection);
    hideSection(parseInfo);
    generatedQRCodes = [];

    progressBar.style.width = "0%";
    progressText.textContent = `0 / ${names.length}`;

    // Generate QR codes with progress tracking
    for (let i = 0; i < names.length; i++) {
      const { firstName, lastName } = names[i];

      try {
        const qrData = await generateSingleQRCode(firstName, lastName);
        generatedQRCodes.push({
          firstName,
          lastName,
          qrDataUrl: qrData,
          filename: `${sanitizeFilename(firstName)}_${sanitizeFilename(
            lastName
          )}.png`,
        });

        // Update progress
        const progress = ((i + 1) / names.length) * 100;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${i + 1} / ${names.length}`;

        // Allow UI to update
        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } catch (error) {
        console.warn(
          `Failed to generate QR for ${firstName} ${lastName}:`,
          error
        );
      }
    }

    if (generatedQRCodes.length === 0) {
      throw new Error("Failed to generate any QR codes");
    }

    showPreview();
    hideSection(progressSection);
    showSection(resultSection);
  } catch (error) {
    showError(error.message);
    hideSection(progressSection);
  }
}

/**
 * Generate a single QR code
 */
async function generateSingleQRCode(firstName, lastName) {
  const encodedFirst = encodeURIComponent(firstName);
  const encodedLast = encodeURIComponent(lastName);
  const url = `https://invite-wedding.netlify.app/welcome.html?first=${encodedFirst}&last=${encodedLast}`;

  // Create a canvas element to generate the QR code
  const canvas = document.createElement("canvas");

  try {
    await QRCode.toCanvas(canvas, url, {
      width: 200,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return canvas.toDataURL("image/png");
  } catch (error) {
    throw new Error(`QR generation failed: ${error.message}`);
  }
}

/**
 * Show preview of first 5 QR codes
 */
function showPreview() {
  previewGrid.innerHTML = "";
  const previewCount = Math.min(5, generatedQRCodes.length);

  for (let i = 0; i < previewCount; i++) {
    const qr = generatedQRCodes[i];
    const previewItem = document.createElement("div");
    previewItem.className = "preview-item";

    const img = document.createElement("img");
    img.src = qr.qrDataUrl;
    img.alt = `QR code for ${qr.firstName} ${qr.lastName}`;

    const nameLabel = document.createElement("div");
    nameLabel.className = "name-label";
    nameLabel.textContent = `${qr.firstName} ${qr.lastName}`;

    previewItem.appendChild(img);
    previewItem.appendChild(nameLabel);
    previewGrid.appendChild(previewItem);
  }
}

/**
 * Download ZIP file containing all QR codes and welcome page
 */
async function downloadZip() {
  try {
    const zip = new JSZip();
    const qrFolder = zip.folder("qr_codes");

    // Add each QR code to the zip
    generatedQRCodes.forEach((qr) => {
      const imageData = qr.qrDataUrl.replace(/^data:image\/png;base64,/, "");
      qrFolder.file(qr.filename, imageData, { base64: true });
    });

    // Add welcome.html file
    const welcomeHTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Welcome</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0f0f0;margin:0}h1{color:#333;font-size:2rem}</style></head><body><h1 id="greet"></h1><script>const p=new URLSearchParams(location.search);const first=p.get('first')||'Guest';const last=p.get('last')||'';document.getElementById('greet').textContent=\`Welcome, \${first} \${last}!\`;</script></body></html>`;

    zip.file("welcome.html", welcomeHTML);

    // Generate and download the zip
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    saveAs(zipBlob, `qr_codes_${timestamp}.zip`);
  } catch (error) {
    showError("Failed to create ZIP file: " + error.message);
  }
}

/**
 * Utility functions
 */
function sanitizeFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function showSection(element) {
  element.classList.remove("hidden");
}

function hideSection(element) {
  element.classList.add("hidden");
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

function hideError() {
  errorMsg.classList.add("hidden");
}
