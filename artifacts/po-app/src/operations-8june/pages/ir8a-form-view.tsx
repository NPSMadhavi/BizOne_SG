import { jsPDF } from "jspdf";
import html2canvas from "../vendor/html2canvas.mjs";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type Ir8aOfficialFormData = {
  year: number;
  employerName: string;
  employerUen: string;
  employerAddress: string;
  employeeName: string;
  nric: string;
  designation: string;
  commencement: string | null;
  cessation: string | null;
  bank: string;
  grossSalary: number;
  bonus: number;
  directorsFees: number;
  fees: number;
  allowances: number;
  otherPayments: number;
  gross: number;
  employeeCpf: number;
  employerCpf: number;
  benefitsInKind: number;
  shareOption: number;
  retirementBenefits: number;
  incomeTaxBorne: number;
  signatoryName: string;
  signatoryDesignation: string;
  declarationDate: string;
  signature: string;
};

function money(value: number) {
  return value.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFormDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function splitEmployeeCpf(employeeCpf: number, ordinaryBase: number, additionalBase: number) {
  const base = ordinaryBase + additionalBase;
  if (employeeCpf <= 0 || additionalBase <= 0 || base <= 0) {
    return { ordinary: employeeCpf, additional: 0 };
  }
  const ordinary = Math.round(employeeCpf * (ordinaryBase / base) * 100) / 100;
  const additional = Math.round((employeeCpf - ordinary) * 100) / 100;
  return { ordinary, additional };
}

let printInProgress = false;

function ensurePrintStyle() {
  let style = document.getElementById("ir8a-print-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "ir8a-print-style";
    document.head.appendChild(style);
  }
  style.textContent = `
    #ir8a-print-root { display: none; }
    @media print {
      @page { size: A4 landscape; margin: 8mm; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
      body.ir8a-printing > *:not(#ir8a-print-root) { display: none !important; }
      #ir8a-print-root {
        display: flex !important;
        justify-content: center !important;
        width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
        position: static !important;
        overflow: visible !important;
        background: #fff !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
      #ir8a-print-root .ir8a-sheet {
        margin: 0 auto !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      #ir8a-print-root .ir8a-head {
        display: grid !important;
        grid-template-columns: minmax(0, 280px) minmax(0, 1fr) 210px !important;
        align-items: center !important;
      }
      #ir8a-print-root .ir8a-split,
      #ir8a-print-root .ir8a-declare {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
      }
      #ir8a-print-root .ir8a-split > * {
        border-right: 1px solid #D7E3F0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

const PRINT_MARGIN_MM = 8;

function printablePagePx() {
  const pxPerMm = 96 / 25.4;
  return {
    width: (297 - PRINT_MARGIN_MM * 2) * pxPerMm,
    height: (210 - PRINT_MARGIN_MM * 2) * pxPerMm,
  };
}

function layoutSheet(sheet: HTMLElement, widthPx = 1120) {
  sheet.style.width = `${widthPx}px`;
  sheet.style.maxWidth = "none";
  sheet.style.margin = "0 auto";
  sheet.style.boxSizing = "border-box";
  sheet.querySelectorAll<HTMLElement>(".ir8a-split, .ir8a-declare").forEach((section) => {
    section.style.display = "grid";
    section.style.gridTemplateColumns = "1fr 1fr";
  });
}

function fitSheetToOnePage(mount: HTMLElement, sheet: HTMLElement) {
  const page = printablePagePx();
  layoutSheet(sheet, page.width);
  const naturalHeight = sheet.scrollHeight;
  const scale = Math.min(1, page.height / naturalHeight);
  sheet.style.setProperty("zoom", String(scale));
  mount.style.display = "flex";
  mount.style.justifyContent = "center";
  mount.style.width = "100%";
  mount.style.height = `${naturalHeight * scale}px`;
  mount.style.margin = "0 auto";
  mount.style.overflow = "hidden";
}

function waitForForm() {
  return new Promise<HTMLElement | null>((resolve) => {
    let tries = 0;
    const tick = () => {
      const node = document.getElementById("ir8a-official-form");
      if (node && node.getBoundingClientRect().height > 40) {
        resolve(node);
        return;
      }
      if (tries++ > 40) {
        resolve(node);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

export function downloadIr8aForm(data: Ir8aOfficialFormData) {
  void captureFormPdf(data);
  return true;
}

async function captureFormPdf(data: Ir8aOfficialFormData) {
  const node = await waitForForm();
  if (!node) return;
  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-10000px";
  mount.style.top = "0";
  mount.style.width = "1120px";
  mount.style.background = "#ffffff";
  const sheet = node.cloneNode(true);
  if (!(sheet instanceof HTMLElement)) return;
  layoutSheet(sheet);
  mount.appendChild(sheet);
  document.body.appendChild(mount);
  try {
    const canvas = await html2canvas(sheet, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: sheet.scrollWidth,
      height: sheet.scrollHeight,
    });
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 4;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
    const safeName = (data.employeeName || "form").replace(/[^\w.-]+/g, "-");
    doc.save(`IR8A-${safeName}-YA${data.year}.pdf`);
  } finally {
    mount.remove();
  }
}

export function printIr8aForm() {
  const node = document.getElementById("ir8a-official-form");
  if (!node || printInProgress) return false;
  printInProgress = true;
  ensurePrintStyle();
  document.getElementById("ir8a-print-root")?.remove();
  const mount = document.createElement("div");
  mount.id = "ir8a-print-root";
  mount.appendChild(node.cloneNode(true));
  mount.style.position = "fixed";
  mount.style.left = "0";
  mount.style.top = "0";
  mount.style.display = "block";
  mount.style.visibility = "hidden";
  document.body.appendChild(mount);
  const sheet = mount.querySelector(".ir8a-sheet");
  if (sheet instanceof HTMLElement) fitSheetToOnePage(mount, sheet);
  mount.style.position = "";
  mount.style.left = "";
  mount.style.top = "";
  mount.style.display = "";
  mount.style.visibility = "";
  document.body.classList.add("ir8a-printing");
  const previousTitle = document.title;
  document.title = "FORM IR8A";
  const finish = () => {
    document.title = previousTitle;
    document.getElementById("ir8a-print-root")?.remove();
    document.body.classList.remove("ir8a-printing");
    printInProgress = false;
    window.removeEventListener("afterprint", finish);
  };
  window.addEventListener("afterprint", finish);
  window.print();
  return true;
}

function IrasMark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src="/iras-logo.png" alt="" className="h-20 w-20 shrink-0 object-contain" />
      <div className="min-w-0 text-[13px] font-semibold leading-snug tracking-[0.02em] text-[#6B7280]">
        <div>INLAND REVENUE</div>
        <div>AUTHORITY</div>
        <div>OF SINGAPORE</div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="bg-[#E7F1FC] px-4 py-2">
      <h3 className="text-[13px] font-bold tracking-wide text-[#2563EB]">{children}</h3>
    </div>
  );
}

function Particular({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_12px_minmax(0,1fr)] items-start gap-x-1 py-[3px] text-[13px] leading-5">
      <span className="text-[#64748B]">{label}</span>
      <span className="text-[#94A3B8]">:</span>
      <span className="font-medium text-[#111827]">{value || "—"}</span>
    </div>
  );
}

function AmountTable({
  title,
  leftHeader,
  rows,
}: {
  title: string;
  leftHeader: string;
  rows: { label: string; value: number; emphasize?: boolean }[];
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="px-4 py-2.5 text-left font-bold text-[#2563EB]">{leftHeader}</th>
            <th className="px-4 py-2.5 text-right font-bold text-[#2563EB]">Amount (S$)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={`border-b border-[#EEF2F7] ${row.emphasize ? "bg-[#E7F1FC]" : ""}`}>
              <td className={`px-4 py-2.5 text-[#111827] ${row.emphasize ? "font-bold" : ""}`}>{row.label}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums text-[#111827] ${row.emphasize ? "font-bold" : ""}`}>{money(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ir8aFormView({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Ir8aOfficialFormData | null;
}) {
  const incomeYearStart = data ? data.year - 1 : 0;
  const ordinaryBase = data ? data.gross - data.bonus : 0;
  const cpfSplit = data ? splitEmployeeCpf(data.employeeCpf, ordinaryBase, data.bonus) : { ordinary: 0, additional: 0 };
  const declaredOn = formatFormDate(data?.declarationDate) || formatFormDate(new Date().toISOString());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[min(1120px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-[#F4F7FB] p-0 [&>button]:hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] bg-white px-5 py-4 print:hidden">
          <div>
            <h2 className="text-xl font-bold text-[#1E3A5F]">IR8A Form</h2>
            <p className="text-sm text-[#64748B]">Year of Assessment {data?.year ?? ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-9 gap-2 border-[#2563EB] text-[#2563EB] hover:bg-[#EFF6FF]" onClick={() => printIr8aForm()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              type="button"
              className="h-9 gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
              onClick={() => data && downloadIr8aForm(data)}
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-[#64748B]" onClick={() => onOpenChange(false)} aria-label="Close IR8A form">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6">
          {data && (
            <article id="ir8a-official-form" className="ir8a-sheet mx-auto overflow-hidden rounded-xl border border-[#D7E3F0] bg-white shadow-sm">
              <header className="ir8a-head grid items-center gap-3 border-b border-[#D7E3F0] px-5 py-4 grid-cols-[minmax(0,280px)_minmax(0,1fr)_210px]">
                <IrasMark />
                <div className="min-w-0 overflow-hidden px-1 text-center">
                  <h1 className="text-[26px] font-bold leading-none tracking-wide text-[#1E3A5F]">FORM IR8A</h1>
                  <p className="mt-2 whitespace-nowrap text-[12px] font-semibold leading-5 text-[#1E293B]">
                    Return of Employee&apos;s Remuneration for the Year Ended 31 Dec {data.year}
                  </p>
                  <p className="mt-1 whitespace-nowrap text-[11px] italic leading-5 text-[#64748B]">
                    This form will be provided to the employee and submitted to IRAS.
                  </p>
                </div>
                <div className="relative z-10 min-w-0 overflow-hidden rounded-lg border border-[#D3E4F7] bg-[#E8F3FC] px-3 py-3 text-center">
                  <p className="text-[13px] font-medium text-[#64748B]">Year of Assessment</p>
                  <p className="mt-1 text-[30px] font-bold leading-none text-[#1E3A8A]">{data.year}</p>
                  <p className="mt-2 text-[11px] leading-4 text-[#64748B]">Income Year</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">
                    1 Jan {incomeYearStart} – 31 Dec {incomeYearStart}
                  </p>
                </div>
              </header>

              <div className="ir8a-split grid grid-cols-2">
                <section className="border-b border-r border-[#D7E3F0]">
                  <SectionTitle>A. EMPLOYER&apos;S PARTICULARS</SectionTitle>
                  <div className="px-4 py-3">
                    <Particular label="Employer Name" value={data.employerName} />
                    <Particular label="Employer Tax Reference No. (UEN)" value={data.employerUen} />
                    <Particular label="Address" value={data.employerAddress} />
                  </div>
                </section>
                <section className="border-b border-r border-[#D7E3F0]">
                  <SectionTitle>B. EMPLOYEE&apos;S PARTICULARS</SectionTitle>
                  <div className="px-4 py-3">
                    <Particular label="Name of Employee" value={data.employeeName} />
                    <Particular label="NRIC / FIN" value={data.nric} />
                    <Particular label="Designation" value={data.designation} />
                    <Particular label="Date of Commencement" value={formatFormDate(data.commencement) || "—"} />
                    <Particular label="Date of Cessation" value={formatFormDate(data.cessation) || "-"} />
                    <Particular label="Bank Salary Credited To" value={data.bank || "—"} />
                  </div>
                </section>
              </div>

              <div className="ir8a-split grid grid-cols-2">
                <div className="border-b border-r border-[#D7E3F0]">
                  <AmountTable
                    title="C. EMPLOYMENT INCOME (AS PER IR8A)"
                    leftHeader="Type of Income"
                    rows={[
                      { label: "1. Gross Salary, Wages and Other Employment Income", value: data.grossSalary },
                      { label: "2. Bonus", value: data.bonus },
                      { label: "3. Director's Fees", value: data.directorsFees },
                      { label: "4. Fees (including Commissions)", value: data.fees },
                      { label: "5. Allowances", value: data.allowances },
                      { label: "6. Other Payments", value: data.otherPayments },
                      { label: "Total (1 to 6) – Gross Employment Income", value: data.gross, emphasize: true },
                    ]}
                  />
                </div>
                <div className="border-b border-r border-[#D7E3F0]">
                  <AmountTable
                    title="D. CPF CONTRIBUTIONS"
                    leftHeader="Type"
                    rows={[
                      { label: "Employee's CPF Contribution (Ordinary Wage)", value: cpfSplit.ordinary },
                      { label: "Employee's CPF Contribution (Additional Wage)", value: cpfSplit.additional },
                      { label: "Total Employee's CPF Contribution", value: data.employeeCpf, emphasize: true },
                      { label: "Employer's CPF Contribution", value: data.employerCpf },
                    ]}
                  />
                  <div className="border-t border-[#D7E3F0]">
                    <AmountTable
                      title="E. OTHER INCOME / BENEFITS"
                      leftHeader="Type"
                      rows={[
                        { label: "Benefits-in-kind", value: data.benefitsInKind },
                        { label: "Share Option / Other Income", value: data.shareOption },
                        { label: "Retirement Benefits", value: data.retirementBenefits },
                        { label: "Income Tax Borne by Employer", value: data.incomeTaxBorne },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="ir8a-split grid grid-cols-2">
                <div className="border-b border-r border-[#D7E3F0]">
                  <AmountTable
                    title="F. EXEMPT / REMISSION INCOME"
                    leftHeader="Type"
                    rows={[
                      { label: "Exempt Income (e.g. overseas, foreign source income)", value: 0 },
                      { label: "Remission Income", value: 0 },
                    ]}
                  />
                </div>
                <section className="border-b border-r border-[#D7E3F0]">
                  <SectionTitle>G. ADDITIONAL INFORMATION (IF APPLICABLE)</SectionTitle>
                  <div className="px-4 py-3 text-[13px] text-[#64748B]">
                    <p>Any other relevant information to be reported to IRAS.</p>
                    <p className="mt-2 font-medium text-[#111827]">-</p>
                  </div>
                </section>
              </div>

              <section>
                <SectionTitle>H. EMPLOYER&apos;S DECLARATION</SectionTitle>
                <div className="px-4 py-3 text-[13px] text-[#334155]">
                  <p>I declare that the information given in this Form IR8A is true and correct to the best of my knowledge and belief.</p>
                  <div className="ir8a-declare mt-4 grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Particular label="Name" value={data.signatoryName || "—"} />
                      <Particular label="Designation" value={data.signatoryDesignation || "—"} />
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[110px_12px_minmax(0,1fr)] items-center gap-x-1 text-[13px]">
                        <span className="text-[#64748B]">Signature</span>
                        <span className="text-[#94A3B8]">:</span>
                        {data.signature ? (
                          <img src={data.signature} alt="Employer signature" className="h-10 max-w-[180px] object-contain" />
                        ) : (
                          <span className="mb-1 block h-6 border-b border-[#94A3B8]" />
                        )}
                      </div>
                      <Particular label="Date" value={declaredOn} />
                    </div>
                  </div>
                </div>
              </section>
            </article>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
