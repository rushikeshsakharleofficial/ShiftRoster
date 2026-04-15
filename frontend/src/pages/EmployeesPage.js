import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, departmentsApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, UserPlus, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

export default function EmployeesPage() {
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", system_role: "employee", employee_level: "L1", department_id: "", employment_type: "full_time" });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (deptFilter) params.department_id = deptFilter;
      const [usersRes, deptsRes] = await Promise.all([usersApi.list(params), departmentsApi.list()]);
      setEmployees(usersRes.data.users || []);
      setTotal(usersRes.data.total || 0);
      setDepartments(deptsRes.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [search, roleFilter, deptFilter]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await usersApi.create(form);
      toast.success("Employee created");
      setShowCreate(false);
      setForm({ email: "", password: "", full_name: "", phone: "", system_role: "employee", employee_level: "L1", department_id: "", employment_type: "full_time" });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const { password, email, ...updateData } = form;
      await usersApi.update(showEdit, updateData);
      toast.success("Employee updated");
      setShowEdit(null);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = (id) => setConfirmDelete({ id, label: "employee" });

  const doDelete = async () => {
    try {
      await usersApi.delete(confirmDelete.id);
      toast.success("Employee deleted");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleLevelChange = async (userId, direction) => {
    const levels = ["L1", "L2", "L3"];
    const emp = employees.find(e => e.id === userId);
    if (!emp) return;
    const idx = levels.indexOf(emp.employee_level);
    const newLevel = direction === "up" ? levels[idx + 1] : levels[idx - 1];
    if (!newLevel) return;
    try {
      await usersApi.changeLevel(userId, { level: newLevel, reason: "Admin action" });
      toast.success(`Level changed to ${newLevel}`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const getDeptName = (id) => departments.find(d => d.id === id)?.name || "—";
  const getDeptColor = (id) => departments.find(d => d.id === id)?.color_hex || "#6366F1";

  const levelColor = (l) => {
    if (l === "L3") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (l === "L2") return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  const roleColor = (r) => {
    if (r === "admin") return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    if (r === "manager") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <div data-testid="employees-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">{total} team members</p>
        </div>
        <Button data-testid="create-employee-btn" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="employee-search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]" data-testid="role-filter">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[160px]" data-testid="dept-filter">
            <SelectValue placeholder="All Depts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
            ) : (
              employees.map(emp => (
                <TableRow key={emp.id} data-testid={`employee-row-${emp.id}`}>
                  <TableCell className="font-medium">{emp.full_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{emp.email}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${roleColor(emp.system_role)}`}>{emp.system_role}</Badge></TableCell>
                  <TableCell>
                    {emp.employee_level ? (
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[10px] ${levelColor(emp.employee_level)}`}>{emp.employee_level}</Badge>
                        {(user?.system_role === "admin" || user?.system_role === "manager") && emp.system_role === "employee" && (
                          <div className="flex flex-col">
                            <button onClick={() => handleLevelChange(emp.id, "up")} className="text-muted-foreground hover:text-foreground" data-testid={`level-up-${emp.id}`}>
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleLevelChange(emp.id, "down")} className="text-muted-foreground hover:text-foreground" data-testid={`level-down-${emp.id}`}>
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {emp.department_id ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: getDeptColor(emp.department_id) }} />
                        <span className="text-sm">{getDeptName(emp.department_id)}</span>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {emp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`employee-actions-${emp.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setForm({ ...emp, password: "" }); setShowEdit(emp.id); }}>
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        {user?.system_role === "admin" && (
                          <DropdownMenuItem onClick={() => handleDelete(emp.id)} className="text-destructive">
                            <Trash2 className="h-3 w-3 mr-2" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate || !!showEdit} onOpenChange={() => { setShowCreate(false); setShowEdit(null); }}>
        <DialogContent data-testid="employee-dialog">
          <DialogHeader>
            <DialogTitle>{showEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input data-testid="emp-name-input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input data-testid="emp-email-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={!!showEdit} />
              </div>
            </div>
            {!showEdit && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input data-testid="emp-password-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.system_role} onValueChange={v => setForm({...form, system_role: v})}>
                  <SelectTrigger data-testid="emp-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    {user?.system_role === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {form.system_role === "employee" && (
                <div className="space-y-1.5">
                  <Label>Level</Label>
                  <Select value={form.employee_level || "L1"} onValueChange={v => setForm({...form, employee_level: v})}>
                    <SelectTrigger data-testid="emp-level-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L1">L1 - Basic</SelectItem>
                      <SelectItem value="L2">L2 - Standard</SelectItem>
                      <SelectItem value="L3">L3 - Senior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department_id || "none"} onValueChange={v => setForm({...form, department_id: v === "none" ? "" : v})}>
                  <SelectTrigger data-testid="emp-dept-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Employment Type</Label>
                <Select value={form.employment_type} onValueChange={v => setForm({...form, employment_type: v})}>
                  <SelectTrigger data-testid="emp-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input data-testid="emp-phone-input" value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setShowEdit(null); }}>Cancel</Button>
            <Button data-testid="emp-save-btn" onClick={showEdit ? handleUpdate : handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (showEdit ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
