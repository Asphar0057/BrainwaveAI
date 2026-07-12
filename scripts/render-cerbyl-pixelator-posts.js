const { chromium } = require("playwright");
const path = require("path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "marketing", "cerbyl-pixelator-post.html");
const fileUrl = `file://${htmlPath}`;

const variants = [
  {
    name: "instagram",
    width: 1080,
    height: 1350,
    output: path.join(root, "marketing", "cerbyl-pixelator-instagram.png"),
  },
  {
    name: "linkedin",
    width: 1200,
    height: 627,
    output: path.join(root, "marketing", "cerbyl-pixelator-linkedin.png"),
  },
];

(async () => {
  const browser = await chromium.launch();

  for (const variant of variants) {
    const page = await browser.newPage({
      viewport: { width: variant.width, height: variant.height },
      deviceScaleFactor: 1,
    });

    await page.goto(`${fileUrl}?variant=${variant.name}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: variant.output, fullPage: false });
    await page.close();
    console.log(`wrote ${variant.output}`);
  }

  await browser.close();
})();
