import fs from "fs";

async function run() {
  try {
    const res = await fetch("https://file-drop-free.vercel.app/file/qxQ7eW9zD5n7");
    const html = await res.text();
    fs.writeFileSync("vercel-html.txt", html);
    console.log("Done");
  } catch (err: any) {
    console.error(err);
  }
}
run();
