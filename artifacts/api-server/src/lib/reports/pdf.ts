import puppeteer from "puppeteer";
import type { ReportTemplateJson } from "./types.js";

async function launchBrowser() {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  try {
    return await puppeteer.launch(launchOptions);
  } catch {
    return await puppeteer.launch({ ...launchOptions, channel: "chrome" as const });
  }
}

export async function htmlToPdf(html: string, template: ReportTemplateJson): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdfBytes = await page.pdf({
      format: template.page?.size === "Letter" ? "Letter" : "A4",
      landscape: template.page?.orientation === "landscape",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfBytes);
  } finally {
    if (browser) await browser.close();
  }
}
