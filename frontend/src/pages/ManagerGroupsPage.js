import { useState, useEffect } from "react";
import { managerGroupsApi, usersApi, departmentsApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Users, Building2, Loader2 } from "lucide-react";

export default function ManagerGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [managers, setManagers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", member_ids: [], department_ids: [] });
  const [saving, setSaving] = useState(false);
  const [addMemberGroup, setAddMemberGroup] = useState(null);
  const [addDeptGroup, setAddDeptGroup] = useState(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDept, setSelectedDept] = useState("");

  const loadData = async () => {
    try {
      const [gRes, uRes, dRes] = await Promise.all([
        managerGroupsApi.list(),
        usersApi.list({ role: "manager" }),
        departmentsApi.list(),
      ]);
      setGroups(gRes.data || []);
      setManagers(uRes.data.users || []);
      setDepartments(dRes.data || []);
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
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this manager group?")) return;
    try {
      await managerGroupsApi.delete(id);
      toast.success("Group deleted");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
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
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleRemoveMember = async (groupId, userId) => {
    try {
      await managerGroupsApi.removeMember(groupId, userId);
      toast.success("Member removed");
      loadData();
    } catch {}
  };

  const handleAddDept = async () => {
    if (!selectedDept) return;
    try {
      await managerGroupsApi.addDepartment(addDeptGroup, { department_id: selectedDept });
      toast.success("Department added");
      setAddDeptGroup(null);
      setSelectedDept("");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleRemoveDept = async (groupId, deptId) => {
    try {
      await managerGroupsApi.removeDepartment(groupId, deptId);
      toast.success("Department removed");
      loadData();
    } catch {}
  };

  const getDeptName = (id) => departments.find(d => d.id === id)?.name || id;
  const getUserName = (id) => managers.find(m => m.id === id)?.full_name || id;

  return (
    <div data-testid="manager-groups-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manager Groups</h1>
          <p className="text-sm text-muted-foreground">{groups.length} groups</p>
        </div>
        <Button data-testid="create-group-btn" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create Group
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <Card className="border"><CardContent className="p-8 text-center text-muted-foreground">No manager groups yet. Create one to organize your management team.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => (
            <Card key={g.id} className="border" data-testid={`group-card-${g.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UserCog className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-medium">{g.name}</h3>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(g.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Members */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Users className="h-3 w-3" /> Members
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddMemberGroup(g.id)} data-testid={`add-member-${g.id}`}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(g.members || []).map(m => (
                      <Badge key={m.id || m.user_id} variant="secondary" className="text-xs gap-1">
                        {getUserName(m.user_id)}
                        <button onClick={() => handleRemoveMember(g.id, m.user_id)} className="text-muted-foreground hover:text-destructive ml-1">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                    {(!g.members || g.members.length === 0) && <span className="text-xs text-muted-foreground">No members</span>}
                  </div>
                </div>

                {/* Departments */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Departments
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddDeptGroup(g.id)} data-testid={`add-dept-${g.id}`}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(g.departments || []).map(d => (
                      <Badge key={d.id || d.department_id} variant="outline" className="text-xs gap-1">
                        {getDeptName(d.department_id)}
                        <button onClick={() => handleRemoveDept(g.id, d.department_id)} className="text-muted-foreground hover:text-destructive ml-1">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
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

      {/* Create Group */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="group-dialog">
          <DialogHeader><DialogTitle>Create Manager Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group Name</Label>
              <Input data-testid="group-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Floor Ops" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button data-testid="group-save-btn" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member */}
      <Dialog open={!!addMemberGroup} onOpenChange={() => setAddMemberGroup(null)}>
        <DialogContent data-testid="add-member-dialog">
          <DialogHeader><DialogTitle>Add Manager to Group</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger data-testid="member-select"><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>
                {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberGroup(null)}>Cancel</Button>
            <Button data-testid="add-member-save-btn" onClick={handleAddMember}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Department */}
      <Dialog open={!!addDeptGroup} onOpenChange={() => setAddDeptGroup(null)}>
        <DialogContent data-testid="add-dept-dialog">
          <DialogHeader><DialogTitle>Add Department to Group</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger data-testid="dept-select"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDeptGroup(null)}>Cancel</Button>
            <Button data-testid="add-dept-save-btn" onClick={handleAddDept}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
