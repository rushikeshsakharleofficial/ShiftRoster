import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { iamApi, usersApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BookOpen, Plus, Pencil, Trash2, Users, Shield, Lock,
  ChevronDown, ChevronUp, Search, X, Check, Loader2
} from "lucide-react";

const RESOURCES = [
  "users", "shifts", "leave", "attendance", "reports",
  "chat", "departments", "announcements", "audit_logs", "settings",
];
const ACTIONS = ["read", "create", "update", "delete", "approve", "export"];

const RESOURCE_LABELS = {
  users: "Users", shifts: "Shifts", leave: "Leave", attendance: "Attendance",
  reports: "Reports", chat: "Chat", departments: "Departments",
  announcements: "Announcements", audit_logs: "Audit Logs", settings: "Settings",
};

// ── Permission Matrix ──────────────────────────────────────────────────────
function PermissionMatrix({ permissions, onChange, readOnly }) {
  const hasPerm = (resource, action) =>
    permissions.some((p) => p.resource === resource && p.action === action);

  const toggle = (resource, action) => {
    if (readOnly) return;
    if (hasPerm(resource, action)) {
      onChange(permissions.filter((p) => !(p.resource === resource && p.action === action)));
    } else {
      onChange([...permissions, { resource, action }]);
    }
  };

  const toggleRow = (resource) => {
    if (readOnly) return;
    const allSet = ACTIONS.every((a) => hasPerm(resource, a));
    if (allSet) {
      onChange(permissions.filter((p) => p.resource !== resource));
    } else {
      const existing = permissions.filter((p) => p.resource !== resource);
      onChange([...existing, ...ACTIONS.map((a) => ({ resource, action: a }))]);
    }
  };

  const toggleCol = (action) => {
    if (readOnly) return;
    const allSet = RESOURCES.every((r) => hasPerm(r, action));
    if (allSet) {
      onChange(permissions.filter((p) => p.action !== action));
    } else {
      const existing = permissions.filter((p) => p.action !== action);
      onChange([...existing, ...RESOURCES.map((r) => ({ resource: r, action }))]);
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Resource</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-2 py-2 font-medium text-center">
                <button
                  type="button"
                  onClick={() => toggleCol(a)}
                  className={`capitalize ${readOnly ? "cursor-default" : "hover:text-primary cursor-pointer"} text-muted-foreground`}
                >
                  {a}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((r, i) => (
            <tr key={r} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              <td className="px-3 py-1.5 font-medium">
                <button
                  type="button"
                  onClick={() => toggleRow(r)}
                  className={`text-left ${readOnly ? "cursor-default" : "hover:text-primary cursor-pointer"}`}
                >
                  {RESOURCE_LABELS[r]}
                </button>
              </td>
              {ACTIONS.map((a) => (
                <td key={a} className="px-2 py-1.5 text-center">
                  <Checkbox
                    checked={hasPerm(r, a)}
                    onCheckedChange={() => toggle(r, a)}
                    disabled={readOnly}
                    className="h-3.5 w-3.5"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Group Editor Dialog ────────────────────────────────────────────────────
function GroupDialog({ open, onClose, group, onSaved }) {
  const isEdit = !!group;
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [permissions, setPermissions] = useState(group?.permissions || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(group?.name || "");
      setDescription(group?.description || "");
      setPermissions(group?.permissions || []);
    }
  }, [open, group]);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (!permissions.length) { toast.error("Select at least one permission"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await iamApi.updateGroup(group.id, { name, description, permissions });
      } else {
        await iamApi.createGroup({ name, description, permissions });
      }
      toast.success(isEdit ? "Rule updated" : "Rule created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rule Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shift Supervisor" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What can this role do?" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <p className="text-xs text-muted-foreground">Click a resource or action header to toggle the entire row/column.</p>
            <PermissionMatrix permissions={permissions} onChange={setPermissions} readOnly={false} />
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>{permissions.length}</strong> permission{permissions.length !== 1 ? "s" : ""} selected
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign Users Dialog ────────────────────────────────────────────────────
function AssignUsersDialog({ open, onClose, group }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [assigned, setAssigned] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const [usersRes, groupUsers] = await Promise.all([
        usersApi.list({ limit: 200 }),
        iamApi.getUserGroups && Promise.resolve([]),
      ]);
      const all = usersRes.data?.users || usersRes.data || [];
      setUsers(all.filter((u) => u.system_role !== "admin"));
    } catch {
      toast.error("Failed to load users");
    }
  }, []);

  useEffect(() => {
    if (open && group) load();
  }, [open, group, load]);

  const toggle = (userId) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    let ok = 0, fail = 0;
    for (const uid of assigned) {
      try {
        const cur = await iamApi.getUserGroups(uid);
        const curIds = (cur.data || []).map((g) => g.id);
        const newIds = curIds.includes(group.id) ? curIds : [...curIds, group.id];
        await iamApi.assignGroups(uid, newIds);
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    if (ok) toast.success(`Assigned to ${ok} user${ok !== 1 ? "s" : ""}`);
    if (fail) toast.error(`Failed for ${fail} user${fail !== 1 ? "s" : ""}`);
    onClose();
  };

  const filtered = users.filter(
    (u) => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign "{group?.name}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors"
              >
                <Checkbox checked={assigned.has(u.id)} className="h-3.5 w-3.5" readOnly />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.system_role} · {u.email}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{assigned.size} selected</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !assigned.size}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Group Row ──────────────────────────────────────────────────────────────
function GroupRow({ group, isAdmin, onEdit, onDelete, onAssign }) {
  const [expanded, setExpanded] = useState(false);
  const permCount = group.permissions?.length || 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-accent/30 transition-colors">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {group.is_global ? <Lock className="h-4 w-4 text-primary" /> : <Shield className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{group.name}</span>
            {group.is_global && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Built-in</Badge>}
          </div>
          {group.description && (
            <p className="text-xs text-muted-foreground truncate">{group.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{permCount} perms</span>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAssign(group)} title="Assign to users">
            <Users className="h-3.5 w-3.5" />
          </Button>
          {!["Read Only", "Full Access"].includes(group.name) && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(group)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {isAdmin && !group.is_global && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(group)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border p-3 bg-background">
          <PermissionMatrix permissions={group.permissions || []} onChange={() => {}} readOnly />
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AccessRuleBook() {
  const { user } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const isAdminOrMgr = ["admin", "manager"].includes(user?.system_role);

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [assignGroup, setAssignGroup] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await iamApi.listGroups();
      setGroups(res.data || []);
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete "${group.name}"? This removes it from all users.`)) return;
    try {
      await iamApi.deleteGroup(group.id);
      toast.success("Rule deleted");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  if (!isAdminOrMgr) return null;

  const globalGroups = groups.filter((g) => g.is_global);
  const customGroups = groups.filter((g) => !g.is_global);

  return (
    <Card className="border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Access Rule Book
            </CardTitle>
            <CardDescription>
              Define permission rules and assign them to users. Managers can only grant permissions they hold.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Built-in templates */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Built-in Templates</p>
              {globalGroups.map((g) => (
                <GroupRow
                  key={g.id}
                  group={g}
                  isAdmin={isAdmin}
                  onEdit={setEditGroup}
                  onDelete={handleDelete}
                  onAssign={setAssignGroup}
                />
              ))}
            </div>

            {/* Custom rules */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Custom Rules {customGroups.length > 0 && `(${customGroups.length})`}
              </p>
              {customGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No custom rules yet. Click <strong>New Rule</strong> to create one.
                </p>
              ) : (
                customGroups.map((g) => (
                  <GroupRow
                    key={g.id}
                    group={g}
                    isAdmin={isAdmin}
                    onEdit={setEditGroup}
                    onDelete={handleDelete}
                    onAssign={setAssignGroup}
                  />
                ))
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Dialogs */}
      <GroupDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        group={null}
        onSaved={load}
      />
      <GroupDialog
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        group={editGroup}
        onSaved={load}
      />
      <AssignUsersDialog
        open={!!assignGroup}
        onClose={() => setAssignGroup(null)}
        group={assignGroup}
      />
    </Card>
  );
}
