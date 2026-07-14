const db = require("better-sqlite3")("C:/Users/Admin/AppData/Roaming/9router/db/data.sqlite");

const connections = db.prepare("SELECT * FROM providerConnections").all();
for (const c of connections) {
  const data = typeof c.data === "string" ? JSON.parse(c.data) : c.data;
  const baseUrl = data?.endpoint || data?.baseUrl || "";
  const display = c.display || data?.display || "";
  
  if (baseUrl.includes("nvidia") || display.toLowerCase().includes("nvidia") || 
      (data?.apiKey && data.apiKey.startsWith("nvapi"))) {
    console.log("=== NVIDIA CONNECTION ===");
    console.log("  id:", c.id);
    console.log("  provider:", c.provider);
    console.log("  display:", display);
    console.log("  type:", c.type);
    console.log("  full data:", JSON.stringify(data, null, 2));
    console.log("");
  }
}

// Also try apiKeys table
try {
  const keys = db.prepare("SELECT * FROM apiKeys").all();
  for (const k of keys) {
    console.log("apiKey:", JSON.stringify(k, null, 2));
  }
} catch(e) {}

// Also try to find any key starting with nvapi
try {
  const apikeys = db.prepare("SELECT * FROM providerConnections WHERE data LIKE '%nvapi%'").all();
  for (const a of apikeys) {
    console.log("Found nvapi key in:", a.id, a.provider);
    const data = JSON.parse(a.data);
    if (data.apiKey) console.log("  apiKey:", data.apiKey.substring(0, 40) + "...");
  }
} catch(e) {}

db.close();
