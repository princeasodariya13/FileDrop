async function run() {
  try {
    const res = await fetch("https://file-drop-free.vercel.app/api/files/qxQ7eW9zD5n7");
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Body: ${text}`);
  } catch (err: any) {
    console.error(err.message);
  }
}
run();
