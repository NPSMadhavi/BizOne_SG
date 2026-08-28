import os
import re

directories = [
    "artifacts/po-app/src/pages/quotations",
    "artifacts/po-app/src/pages/sales-orders",
    "artifacts/po-app/src/pages/invoices",
    "artifacts/po-app/src/pages/credit-notes",
    "artifacts/po-app/src/pages/debit-notes",
    "artifacts/po-app/src/pages/delivery-orders",
    "artifacts/po-app/src/pages/proforma-invoices",
]

for d in directories:
    for f in ["new.tsx", "edit.tsx"]:
        path = os.path.join(d, f)
        if not os.path.exists(path):
            continue
            
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
            
        if "grid-cols-3" in content and "customerNote" in content:
            continue
            
        start_str = '<FormField control={form.control} name="customerNote"'
        start_idx = content.find(start_str)
        if start_idx == -1:
            print(f"Start not found in {path}")
            continue
            
        # Find the end of termsAndConditions
        tc_str = '<FormField control={form.control} name="termsAndConditions"'
        tc_idx = content.find(tc_str, start_idx)
        if tc_idx == -1:
            print(f"TC not found in {path}")
            continue
            
        # find the end of the termsAndConditions FormField which is `)} />`
        end_str = ')} />'
        end_idx = content.find(end_str, tc_idx)
        if end_idx == -1:
            print(f"End not found in {path}")
            continue
        
        end_idx += len(end_str)
        
        block = content[start_idx:end_idx]
        new_block = '<div className="grid grid-cols-1 md:grid-cols-3 gap-4">\n                ' + block.replace('\n', '\n                ') + '\n              </div>'
        
        new_content = content[:start_idx] + new_block + content[end_idx:]
        
        with open(path, "w", encoding="utf-8") as file:
            file.write(new_content)
        print(f"Successfully updated {path}")
