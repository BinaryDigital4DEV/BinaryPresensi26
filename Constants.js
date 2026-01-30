/**
 * File: Constants.gs
 */
const SPREADSHEET_ID = "1O2gU3Vg82ToEX8rCrhVMW8L5Eml5Wl9XzLA-zvXjF_Y"; 

const TABS = {
  VARIABLES: "VARIABLES",
  EVENTS: "EVENTS",
  ATTENDANCE: "ATTENDANCE",
  PERMISSIONS: "PERMISSIONS",
  OVERTIME: "OVERTIME",
  FILE_MGMT: "FILE_MANAGEMENT" // Tab Baru
};

function getDb() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("MASUKKAN_ID")) {
    throw new Error("ID Spreadsheet belum diisi di file Constants.gs");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}