import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectTemplateFieldKeys, resolveFieldPath, resolveFieldValue } from "./field-resolver.ts";

describe("report field resolver", () => {
  it("resolves invoice.invoice_number from runtime data, not from the template", () => {
    const data = {
      invoice: { invoice_number: "INV-1001", total: "S$118.00" },
      customer: { name: "ABC Technologies" },
      company: { name: "BizOne Pvt Ltd" },
      items: [],
    };
    assert.equal(resolveFieldPath(data, "invoice.invoice_number"), "INV-1001");
    assert.equal(resolveFieldPath(data, "customer.name"), "ABC Technologies");
    assert.equal(resolveFieldPath(data, "company.name"), "BizOne Pvt Ltd");
    assert.equal(resolveFieldValue(data as any, "invoice.invoice_number"), "INV-1001");
  });

  it("maps snake_case field keys onto camelCase company values", () => {
    const data = { company: { taxNumber: "GST-9", registrationNumber: "REG-1" } };
    assert.equal(resolveFieldPath(data, "company.tax_number"), "GST-9");
    assert.equal(resolveFieldPath(data, "company.registration_number"), "REG-1");
  });

  it("collects field keys from the layout without storing live values", () => {
    const keys = collectTemplateFieldKeys({
      elements: [
        { field: "invoice.invoice_number" },
        { field: "customer.name" },
        { columns: [{ field: "item.product_name" }, { field: "item.amount" }] },
      ],
    });
    assert.deepEqual(keys.sort(), ["customer.name", "invoice.invoice_number", "item.amount", "item.product_name"]);
    assert.equal(keys.includes("INV-1001"), false);
  });
});
