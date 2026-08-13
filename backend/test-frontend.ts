async function run() {
  try {
    const res = await fetch("https://file-drop-free.vercel.app/file/qxQ7eW9zD5n7");
    console.log(`HTTP Status: ${res.status}`);
    const text = await res.text();
    if (text.includes("This file is no longer available")) {
      console.log("Text 'This file is no longer available' FOUND in HTML.");
    } else {
      console.log("Text NOT FOUND. HTML snippet:");
      console.log(text.slice(0, 500));
    }
  } catch (err: any) {
    console.error(err.message);
  }
}
run();
