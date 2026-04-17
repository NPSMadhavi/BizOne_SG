import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface CurrencyMismatchDialogProps {
  open: boolean;
  entityName: string;
  entityType: "vendor" | "customer";
  defaultCurrency: string;
  selectedCurrency: string;
  onContinue: () => void;
  onRevert: () => void;
}

export function CurrencyMismatchDialog({
  open,
  entityName,
  entityType,
  defaultCurrency,
  selectedCurrency,
  onContinue,
  onRevert,
}: CurrencyMismatchDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Currency Mismatch Detected</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">{entityName}</strong> has{" "}
                <strong className="text-foreground">{defaultCurrency}</strong> set as their default{" "}
                {entityType} currency, but you've selected{" "}
                <strong className="text-foreground">{selectedCurrency}</strong> for this document.
              </p>
              <p>Would you like to save this document in {selectedCurrency}, or revert to the {entityType}'s default currency?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onRevert} className="sm:order-1">
            Use {defaultCurrency} (Default)
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue} className="sm:order-2">
            Continue with {selectedCurrency}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
