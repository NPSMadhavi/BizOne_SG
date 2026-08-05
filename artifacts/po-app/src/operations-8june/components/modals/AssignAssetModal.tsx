import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { FormModalShell, ModalCancelButton, ModalSaveButton, ModalSectionHeader, modalFormClass } from "@/operations-8june/components/forms/FormModalShell";
import { IdCard } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, parseApiResponse } from "@/operations-8june/lib/queryClient";
import { Asset, Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";

interface AssignAssetModalProps {
  open: boolean;
  onClose: () => void;
  preSelectedAssetId?: number | null;
}

export default function AssignAssetModal({ open, onClose, preSelectedAssetId }: AssignAssetModalProps) {
  const { toast } = useToast();
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [assignmentDate, setAssignmentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>("");
  
  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    select: (data) => data.filter(asset => asset.status === 'available'),
    enabled: open,
  });
  
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: open,
  });

  useEffect(() => {
    if (open && preSelectedAssetId) {
      setSelectedAssetId(preSelectedAssetId.toString());
    }
  }, [open, preSelectedAssetId]);
  
  const assignAssetMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/asset-assignments", data);
      const json = await res.json();
      return parseApiResponse(json);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      await queryClient.refetchQueries({ queryKey: ["/api/dashboard"] });
      
      toast({
        title: "Asset assigned successfully",
        description: "The asset has been assigned to the employee.",
      });
      
      handleClose();
    },
    onError: (error: Error) => {
      console.error("❌ Asset assignment failed:", error);
      toast({
        title: "Failed to assign asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = () => {
    if (assignAssetMutation.isPending) return;

    if (!selectedAssetId || !selectedEmployeeId) {
      toast({
        title: "Missing required fields",
        description: "Please select both an asset and an employee.",
        variant: "destructive",
      });
      return;
    }
    
    assignAssetMutation.mutate({
      assetId: parseInt(selectedAssetId),
      employeeId: parseInt(selectedEmployeeId),
      dateAssigned: assignmentDate,
      notes: notes.trim() ? notes : undefined,
    });
  };
  
  const handleClose = () => {
    setSelectedAssetId("");
    setSelectedEmployeeId("");
    setAssignmentDate(new Date().toISOString().split('T')[0]);
    setNotes("");
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <FormModalShell
        title="Assign asset"
        onClose={handleClose}
        maxWidth="max-w-lg"
        footer={
          <>
            <ModalCancelButton onClick={handleClose} />
            <ModalSaveButton
              type="button"
              onClick={handleSubmit}
              disabled={!selectedAssetId || !selectedEmployeeId}
              loading={assignAssetMutation.isPending}
              label="Assign Asset"
              loadingLabel="Assigning..."
            />
          </>
        }
      >
        <div className={modalFormClass}>
          <ModalSectionHeader icon={IdCard} title="Assignment Details" />
          <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset">Asset</Label>
            <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
              <SelectTrigger id="asset">
                <SelectValue placeholder="Select an asset" />
              </SelectTrigger>
              <SelectContent>
                {assets.length > 0 ? (
                  assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id.toString()}>
                      {asset.type} - {asset.tag} ({asset.serial})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No available assets</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="employee">Employee</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger id="employee">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.length > 0 ? (
                  employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id.toString()}>
                      {employee.name} ({employee.department})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No employees found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date">Assignment Date</Label>
            <SyncBridgeDatePicker
              value={assignmentDate}
              onChange={setAssignmentDate}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Enter any additional notes here..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          </div>
        </div>
      </FormModalShell>
    </Dialog>
  );
}
