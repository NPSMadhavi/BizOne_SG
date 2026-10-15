import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeAssignedPermissions, modulesRequiredForApi } from "./module-access.ts";

describe("assigned module permissions", () => {
  it("does not keep role modules the admin did not assign", () => {
    const merged = mergeAssignedPermissions(
      ["quotations:view", "quotations:create", "invoices:view", "point_of_sale:view"],
      ["point_of_sale", "dashboard"],
      false,
    );
    assert.equal(merged.includes("quotations:view"), false);
    assert.equal(merged.includes("point_of_sale:view"), true);
    assert.equal(merged.includes("dashboard:create"), true);
  });

  it("leaves administrator role permissions unchanged", () => {
    const role = ["invoices:view", "user_management:delete"];
    assert.deepEqual(mergeAssignedPermissions(role, ["dashboard"], true), role);
  });

  it("allows a sales user with POS to read stock, and blocks invoices", () => {
    const stock = modulesRequiredForApi("/api/stock-items", "GET");
    const invoices = modulesRequiredForApi("/api/invoices", "GET");
    const pos = modulesRequiredForApi("/api/pos-sales", "POST");
    assert.equal(stock?.includes("point_of_sale"), true);
    assert.equal(stock?.includes("pos_retail"), true);
    assert.equal(invoices?.includes("invoices"), true);
    assert.equal(invoices?.includes("point_of_sale"), false);
    assert.equal(pos?.includes("point_of_sale"), true);
    assert.equal(pos?.includes("pos_electronics"), true);
    const posRead = modulesRequiredForApi("/api/pos-sales", "GET");
    assert.equal(posRead?.includes("pos_reports"), true);
    assert.equal(pos?.includes("pos_reports"), false);
  });

  it("does not restrict settings reads used by POS", () => {
    assert.equal(modulesRequiredForApi("/api/settings", "GET"), null);
    assert.deepEqual(modulesRequiredForApi("/api/settings", "PUT"), ["settings"]);
  });
});
