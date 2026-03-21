import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Plus, Edit2, Trash2, Users, Shield, RefreshCw, Building2 } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest, fetchWithAdminAuth, getAdminAuthHeader } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

interface EngineerCredential {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'engineer';
  company?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export default function EngineerManagement() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEngineer, setSelectedEngineer] = useState<EngineerCredential | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    role: "engineer" as 'admin' | 'engineer',
    company: "",
    isActive: true,
  });

  const { data: credentialsData, isLoading, refetch } = useQuery<{ engineers: EngineerCredential[]; lastUpdated: string }>({
    queryKey: ["/api/engineer-credentials"],
    queryFn: () => fetchWithAdminAuth("/api/engineer-credentials"),
  });

  const engineers = credentialsData?.engineers || [];

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/engineer-credentials", data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-credentials"] });
      toast({ title: "Engineer added successfully" });
      setAddDialogOpen(false);
      resetFormData();
    },
    onError: () => {
      toast({ title: "Failed to add engineer", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof formData) => {
      return apiRequest("PUT", `/api/engineer-credentials/${id}`, data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-credentials"] });
      toast({ title: "Engineer updated successfully" });
      setEditDialogOpen(false);
      setSelectedEngineer(null);
    },
    onError: () => {
      toast({ title: "Failed to update engineer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/engineer-credentials/${id}`, undefined, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-credentials"] });
      toast({ title: "Engineer deleted successfully" });
      setDeleteDialogOpen(false);
      setSelectedEngineer(null);
    },
    onError: () => {
      toast({ title: "Failed to delete engineer", variant: "destructive" });
    },
  });

  const initializeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/engineer-credentials/initialize", undefined, true);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-credentials"] });
      toast({ title: "Engineer credentials synced from master list" });
    },
    onError: () => {
      toast({ title: "Failed to initialize credentials", variant: "destructive" });
    },
  });

  const resetFormData = () => {
    setFormData({
      name: "",
      username: "",
      password: "",
      role: "engineer",
      company: "",
      isActive: true,
    });
  };

  const handleEdit = (engineer: EngineerCredential) => {
    setSelectedEngineer(engineer);
    setFormData({
      name: engineer.name,
      username: engineer.username,
      password: "",
      role: engineer.role,
      company: engineer.company || "",
      isActive: engineer.isActive,
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (engineer: EngineerCredential) => {
    setSelectedEngineer(engineer);
    setDeleteDialogOpen(true);
  };

  const filteredEngineers = engineers.filter(eng =>
    eng.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    eng.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (eng.company || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const inHouseEngineers = filteredEngineers.filter(e => !e.company);
  const outsourcedEngineers = filteredEngineers.filter(e => e.company);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md" data-testid="card-access-denied">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">Only administrators can manage engineer credentials.</p>
            <Link href="/">
              <Button data-testid="button-go-home">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <span className="font-semibold text-lg" data-testid="text-page-title">Engineer Management</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-main-title">Engineer Credentials</h1>
            <p className="text-muted-foreground text-sm">
              Manage login credentials for all engineers. Data stored in GitHub.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => initializeMutation.mutate()}
              disabled={initializeMutation.isPending}
              data-testid="button-sync-engineers"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${initializeMutation.isPending ? 'animate-spin' : ''}`} />
              Sync from Master List
            </Button>
            <Button onClick={() => { resetFormData(); setAddDialogOpen(true); }} data-testid="button-add-engineer">
              <Plus className="h-4 w-4 mr-2" />
              Add Engineer
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search by name, username, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
            data-testid="input-search-engineers"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card data-testid="stat-total-engineers">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 rounded-full bg-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{engineers.length}</p>
                  <p className="text-muted-foreground text-sm">Total Engineers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-in-house">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 rounded-full bg-green-500" />
                <div>
                  <p className="text-2xl font-bold">{engineers.filter(e => !e.company).length}</p>
                  <p className="text-muted-foreground text-sm">In-House Engineers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-outsourced">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 rounded-full bg-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{engineers.filter(e => e.company).length}</p>
                  <p className="text-muted-foreground text-sm">Outsourced Engineers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {inHouseEngineers.length > 0 && (
          <Card className="mb-6" data-testid="card-in-house-engineers">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                In-House Engineers ({inHouseEngineers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inHouseEngineers.map((eng) => (
                    <TableRow key={eng.id} data-testid={`row-engineer-${eng.id}`}>
                      <TableCell className="font-medium">{eng.name}</TableCell>
                      <TableCell>{eng.username}</TableCell>
                      <TableCell>
                        <Badge variant={eng.role === 'admin' ? 'default' : 'secondary'}>
                          {eng.role === 'admin' ? 'Admin' : 'Engineer'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={eng.isActive ? 'default' : 'outline'} className={eng.isActive ? 'bg-green-500/20 text-green-700 dark:text-green-300' : ''}>
                          {eng.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {eng.lastLogin ? new Date(eng.lastLogin).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(eng)} data-testid={`button-edit-${eng.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(eng)} data-testid={`button-delete-${eng.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {outsourcedEngineers.length > 0 && (
          <Card data-testid="card-outsourced-engineers">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Outsourced Engineers ({outsourcedEngineers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outsourcedEngineers.map((eng) => (
                    <TableRow key={eng.id} data-testid={`row-engineer-${eng.id}`}>
                      <TableCell className="font-medium">{eng.name}</TableCell>
                      <TableCell>{eng.username}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{eng.company}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={eng.isActive ? 'default' : 'outline'} className={eng.isActive ? 'bg-green-500/20 text-green-700 dark:text-green-300' : ''}>
                          {eng.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {eng.lastLogin ? new Date(eng.lastLogin).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(eng)} data-testid={`button-edit-${eng.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(eng)} data-testid={`button-delete-${eng.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {filteredEngineers.length === 0 && !isLoading && (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No engineers found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try a different search term" : "Click 'Sync from Master List' to initialize engineer credentials"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-engineer">
          <DialogHeader>
            <DialogTitle>Add Engineer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full name"
                data-testid="input-engineer-name"
              />
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Login username"
                data-testid="input-engineer-username"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Default: drb@123"
                data-testid="input-engineer-password"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={formData.role} onValueChange={(v: 'admin' | 'engineer') => setFormData({ ...formData, role: v })}>
                <SelectTrigger data-testid="select-engineer-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="engineer">Engineer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company (for outsourced)</Label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="e.g., Ampere, PAES, D.I.C.S"
                data-testid="input-engineer-company"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-engineer-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button onClick={() => addMutation.mutate(formData)} disabled={addMutation.isPending} data-testid="button-confirm-add">
              {addMutation.isPending ? "Adding..." : "Add Engineer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-engineer">
          <DialogHeader>
            <DialogTitle>Edit Engineer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                data-testid="input-edit-username"
              />
            </div>
            <div>
              <Label>New Password (leave blank to keep current)</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave blank to keep current"
                data-testid="input-edit-password"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={formData.role} onValueChange={(v: 'admin' | 'engineer') => setFormData({ ...formData, role: v })}>
                <SelectTrigger data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="engineer">Engineer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                data-testid="input-edit-company"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-edit-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={() => selectedEngineer && updateMutation.mutate({ id: selectedEngineer.id, ...formData })}
              disabled={updateMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-engineer">
          <DialogHeader>
            <DialogTitle>Delete Engineer</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{selectedEngineer?.name}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedEngineer && deleteMutation.mutate(selectedEngineer.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
