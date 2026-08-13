async function run() {
  const fileId = "qxQ7eW9zD5n7";
  console.log("=== API REQUEST ===");
  try {
    const res = await fetch(`https://filedrop-ginb.onrender.com/api/files/${fileId}`);
    console.log(`HTTP Status: ${res.status}`);
    console.log(`Response Body: ${await res.text()}`);
  } catch (err: any) {
    console.error("API Request Failed:", err.message);
  }
}
run();
