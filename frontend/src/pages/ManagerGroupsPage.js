import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { managerGroupsApi, usersApi, departmentsApi, nominationsApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Users, Building2, Loader2, Check, X, Award } from "lucide-react";

export default function ManagerGroupsPage() {
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showNominate, setShowNominate] = useState(false);
  const [form, setForm] = useState({ name: "", member_ids: [], department_ids: [] });
  const [nomForm, setNomForm] = useState({ nominee_id: "", group_id: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [addMemberGroup, setAddMemberGroup] = useState(null);
  const [addDeptGroup, setAddDeptGroup] = useState(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDept, setSelectedDept] = useState("");

  const isAdmin = user?.system_role === "admin";

  const loadData = async () => {
    try {
      const [gRes, uRes, dRes, nRes, allRes] = await Promise.all([
        managerGroupsApi.list(),
        usersApi.list({ role: "manager" }),
        departmentsApi.list(),
        nominationsApi.list().catch(() => ({ data: [] })),
        usersApi.list({ limit: 200 }),
      ]);
      setGroups(gRes.data || []);
      setManagers(uRes.data.users || []);
      setDepartments(dRes.data || []);
      setNominations(nRes.data || []);
      setAllUsers(allRes.data.users || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await managerGroupsApi.create(form);
      toast.success("Group created");
      setShowCreate(false);
      setForm({ name: "", member_ids: [], department_ids: [] });
      loadData();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    setSaving(false);
  };

  const handleDelete = (id) => setConfirmDelete({ id, label: "manager group" });

  const doDelete = async () => {
    try {
      await managerGroupsApi.delete(confirmDelete.id);
      toast.success("Group deleted");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUser) return;
    try {
      await managerGroupsApi.addMember(addMemberGroup, { user_id: selectedUser });
      toast.success("Member added");
      setAddMemberGroup(null);
      setSelectedUser("");
      loadData();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const handleRemoveMember = async (groupId, userId) => {
    try { await managerGroupsApi.removeMember(groupId, userId); toast.success("Member removed"); loadData(); } catch {}
  };

  const handleAddDept = async () => {
    if (!selectedDept) return;
    try {
      await managerGroupsApi.addDepartment(addDeptGroup, { department_id: selectedDept });
      toast.success("Department added");
      setAddDeptGroup(null);
      setSelectedDept("");
      loadData();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const handleRemoveDept = async (groupId, deptId) => {
    try { await managerGroupsApi.removeDepartment(groupId, deptId); toast.success("Department removed"); loadData(); } catch {}
  };

  const handleNominate = async () => {
    setSaving(true);
    try {
      await nominationsApi.create(nomForm);
      toast.success("Nomination submitted");
      setShowNominate(false);
      setNomForm({ nominee_id: "", group_id: "", reason: "" });
      loadData();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    setSaving(false);
  };

  const handleReviewNomination = async (id, status) => {
    try {
      await nominationsApi.review(id, { status });
      toast.success(`Nomination ${status}`);
      loadData();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const getDeptName = (id) => departments.find(d => d.id === id)?.name || id;
  const getUserName = (id) => [...managers, ...allUsers].find(m => m.id === id)?.full_name || id;

  const statusColor = (s) => {
    if (s === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  };

  return (
    <div data-testid="manager-groups-page" className="space-y-6 dispatch-stagger">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manager Groups</h1>
          <p className="text-sm text-muted-foreground">{groups.length} groups, {nominations.filter(n => n.status === "pending").length} pending nominations</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button data-testid="nominate-btn" variant="outline" size="sm" onClick={() => setShowNominate(true)}>
            <Award className="h-4 w-4 mr-1" /> Nominate
          </Button>
          {isAdmin && (
            <Button data-testid="create-group-btn" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Group
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="groups" className="space-y-4">
        <TabsList>
          <TabsTrigger value="groups" data-testid="tab-groups">Groups</TabsTrigger>
          <TabsTrigger value="nominations" data-testid="tab-nominations">
            Nominations {nominations.filter(n => n.status === "pending").length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] h-4 px-1">{nominations.filter(n => n.status === "pending").length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <Card className="border"><CardContent className="p-8 text-center text-muted-foreground">No manager groups yet.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {groups.map(g => (
                <Card key={g.id} className="border" data-testid={`group-card-${g.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><UserCog className="h-5 w-5 text-primary" /></div>
                        <h3 className="font-medium">{g.name}</h3>
                      </div>
                      {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(g.id)}><Trash2 className="h-3 w-3" /></Button>}
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Users className="h-3 w-3" /> Members</span>
                        {isAdmin && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddMemberGroup(g.id)} data-testid={`add-member-${g.id}`}><Plus className="h-3 w-3 mr-1" /> Add</Button>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(g.members || []).map(m => (
                          <Badge key={m.id || m.user_id} variant="secondary" className="text-xs gap-1">
                            {getUserName(m.user_id)}
                            {isAdmin && <button onClick={() => handleRemoveMember(g.id, m.user_id)} className="text-muted-foreground hover:text-destructive ml-1"><Trash2 className="h-2.5 w-2.5" /></button>}
                          </Badge>
                        ))}
                        {(!g.members || g.members.length === 0) && <span className="text-xs text-muted-foreground">No members</span>}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Building2 className="h-3 w-3" /> Departments</span>
                        {isAdmin && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddDeptGroup(g.id)} data-testid={`add-dept-${g.id}`}><Plus className="h-3 w-3 mr-1" /> Add</Button>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(g.departments || []).map(d => (
                          <Badge key={d.id || d.department_id} variant="outline" className="text-xs gap-1">
                            {getDeptName(d.department_id)}
                            {isAdmin && <button onClick={() => handleRemoveDept(g.id, d.department_id)} className="text-muted-foreground hover:text-destructive ml-1"><Trash2 className="h-2.5 w-2.5" /></button>}
                          </Badge>
                        ))}
                        {(!g.departments || g.departments.length === 0) && <span className="text-xs text-muted-foreground">No departments</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="nominations">
          <Card className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nominee</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Nominated By</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {nominations.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />No nominations yet
                  </TableCell></TableRow>
                ) : (
                  nominations.map(n => (
                    <TableRow key={n.id} data-testid={`nomination-row-${n.id}`}>
                      <TableCell className="font-medium">{n.nominee_name}</TableCell>
                      <TableCell>{n.group_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.nominator_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{n.reason || "—"}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColor(n.status)}`}>{n.status}</Badge></TableCell>
                      {isAdmin && (
                        <TableCell>
                          {n.status === "pending" && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleReviewNomination(n.id, "approved")} data-testid={`approve-nom-${n.id}`}><Check className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleReviewNomination(n.id, "rejected")} data-testid={`reject-nom-${n.id}`}><X className="h-3 w-3" /></Button>
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
        </TabsContent>
      </Tabs>

      {/* Create Group Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="group-dialog">
          <DialogHeader><DialogTitle>Create Manager Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Group Name</Label><Input data-testid="group-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Floor Ops" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button data-testid="group-save-btn" onClick={handleCreate} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nominate Dialog */}
      <Dialog open={showNominate} onOpenChange={setShowNominate}>
        <DialogContent data-testid="nominate-dialog">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Nominate Manager</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Employee to Nominate</Label>
              <Select value={nomForm.nominee_id} onValueChange={v => setNomForm({...nomForm, nominee_id: v})}>
                <SelectTrigger data-testid="nom-employee-select"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{allUsers.filter(u => u.system_role === "employee").map(u => <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Target Group</Label>
              <Select value={nomForm.group_id} onValueChange={v => setNomForm({...nomForm, group_id: v})}>
                <SelectTrigger data-testid="nom-group-select"><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Reason</Label>
              <Textarea data-testid="nom-reason-input" value={nomForm.reason} onChange={e => setNomForm({...nomForm, reason: e.target.value})} placeholder="Why this employee should be a manager..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNominate(false)}>Cancel</Button>
            <Button data-testid="nom-save-btn" onClick={handleNominate} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Nomination"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!addMemberGroup} onOpenChange={() => setAddMemberGroup(null)}>
        <DialogContent data-testid="add-member-dialog">
          <DialogHeader><DialogTitle>Add Manager to Group</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger data-testid="member-select"><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>{managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberGroup(null)}>Cancel</Button>
            <Button data-testid="add-member-save-btn" onClick={handleAddMember}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Department Dialog */}
      <Dialog open={!!addDeptGroup} onOpenChange={() => setAddDeptGroup(null)}>
        <DialogContent data-testid="add-dept-dialog">
          <DialogHeader><DialogTitle>Add Department to Group</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger data-testid="dept-select"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDeptGroup(null)}>Cancel</Button>
            <Button data-testid="add-dept-save-btn" onClick={handleAddDept}>Add</Button>
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
