import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { swapApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, Loader2, ArrowLeftRight } from "lucide-react";

export default function SwapRequestsPage() {
  const { user } = useAuth();
  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const canManage = user?.system_role === "admin" || user?.system_role === "manager";

  const loadData = async () => {
    try {
      const { data } = await swapApi.list();
      setSwaps(data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleReview = async (id, status) => {
    try {
      await swapApi.review(id, { status });
      toast.success(`Swap ${status}`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const statusColor = (s) => {
    if (s === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  };

  return (
    <div data-testid="swap-requests-page" className="space-y-6 dispatch-stagger">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Swap Requests</h1>
        <p className="text-sm text-muted-foreground">{swaps.length} requests</p>
      </div>

      <Card className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requester</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Date</TableHead>
              {canManage && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : swaps.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No swap requests
              </TableCell></TableRow>
            ) : (
              swaps.map(s => (
                <TableRow key={s.id} data-testid={`swap-row-${s.id}`}>
                  <TableCell className="font-medium">{s.requester_name || "—"}</TableCell>
                  <TableCell>{s.target_name || "Open"}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColor(s.status)}`}>{s.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{s.notes || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      {s.status === "pending" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleReview(s.id, "approved")} data-testid={`approve-swap-${s.id}`}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleReview(s.id, "rejected")} data-testid={`reject-swap-${s.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
