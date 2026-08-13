async function testDoubleSlash() {
  try {
    const res = await fetch("https://filedrop-ginb.onrender.com//api/files/qxQ7eW9zD5n7");
    console.log(`Status: ${res.status}`);
    console.log(await res.text());
  } catch (err: any) {
    console.error(err.message);
  }
}
testDoubleSlash();
