import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Upload,
  Image as ImageIcon,
  Cpu,
  ShieldCheck,
  FileText,
  Factory,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors server/routes.ts EquipmentDoc / StationDoc)
// ---------------------------------------------------------------------------

interface StationImage {
  url: string;
  caption?: string;
  uploadedAt: string;
}

interface StationDoc {
  id: string;
  name: string;
  status: string;
  electricalParts: string;
  process: string;
  inputs: string;
  outputs: string;
  images: StationImage[];
}

interface EquipmentDoc {
  projectName: string;
  synopsis: string;
  plcArchitecture: string;
  safetyLayout: string;
  hasMultipleStations: boolean;
  stations: StationDoc[];
  updatedAt: string;
  updatedBy?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "design_stage", label: "Design Stage" },
  { value: "electrical_design", label: "Electrical Design" },
  { value: "procurement_stage", label: "Procurement Stage" },
  { value: "waiting_for_materials", label: "Waiting for Materials" },
  { value: "mechanical_assembly", label: "Mechanical Assembly" },
  { value: "electrical_assembly", label: "Electrical Assembly" },
  { value: "installation_pending", label: "Installation Pending" },
  { value: "installation_in_progress", label: "Installation in Progress" },
  { value: "plc_power_up", label: "PLC Power Up" },
  { value: "io_check", label: "IO Check" },
  { value: "trials_stage", label: "Trials Stage" },
  { value: "fat", label: "F.A.T" },
  { value: "sat", label: "S.A.T" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "blocked", label: "Blocked" },
  { value: "dispatch_stage", label: "Dispatch Stage" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  blocked: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
};

function blankDoc(projectName: string): EquipmentDoc {
  return {
    projectName,
    synopsis: "",
    plcArchitecture: "",
    safetyLayout: "",
    hasMultipleStations: false,
    stations: [],
    updatedAt: new Date().toISOString(),
  };
}

function newStation(index: number): StationDoc {
  return {
    id: `station-${Date.now()}-${index}`,
    name: `Station ${index + 1}`,
    status: "not_started",
    electricalParts: "",
    process: "",
    inputs: "",
    outputs: "",
    images: [],
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix — backend expects raw base64
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Top-level station card (NEVER define components inside other components —
// see 04_BUG_PATTERNS.md BUG-02)
// ---------------------------------------------------------------------------

function StationCard({
  station,
  index,
  onChange,
  onDelete,
  onUploadImage,
  uploading,
}: {
  station: StationDoc;
  index: number;
  onChange: (id: string, patch: Partial<StationDoc>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  uploading: boolean;
}) {
  return (
    <Card data-testid={`card-station-${index}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex-1 flex items-center gap-3">
          <Factory className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={station.name}
            onChange={(e) => onChange(station.id, { name: e.target.value })}
            className="font-semibold max-w-xs"
            data-testid={`input-station-name-${index}`}
          />
          <Badge className={`${STATUS_COLOR[station.status] ?? STATUS_COLOR.not_started} text-xs`}>
            {STATUS_LABEL[station.status] ?? station.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={station.status}
            onValueChange={(v) => onChange(station.id, { status: v })}
          >
            <SelectTrigger className="w-44" data-testid={`select-station-status-${index}`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(station.id)}
            data-testid={`button-delete-station-${index}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Electrical &amp; Electronic Parts
            </label>
            <Textarea
              rows={4}
              placeholder="PLC I/O modules, VFDs, sensors, contactors, safety relays, HMI, network switches..."
              value={station.electricalParts}
              onChange={(e) => onChange(station.id, { electricalParts: e.target.value })}
              data-testid={`textarea-electrical-parts-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Process</label>
            <Textarea
              rows={4}
              placeholder="What happens at this station, sequence of operations..."
              value={station.process}
              onChange={(e) => onChange(station.id, { process: e.target.value })}
              data-testid={`textarea-process-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Inputs</label>
            <Textarea
              rows={3}
              placeholder="Sensors, switches, signals coming into this station..."
              value={station.inputs}
              onChange={(e) => onChange(station.id, { inputs: e.target.value })}
              data-testid={`textarea-inputs-${index}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Outputs</label>
            <Textarea
              rows={3}
              placeholder="Actuators, drives, alarms, signals this station produces..."
              value={station.outputs}
              onChange={(e) => onChange(station.id, { outputs: e.target.value })}
              data-testid={`textarea-outputs-${index}`}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <ImageIcon className="h-4 w-4" /> Station Images
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(station.id, file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border hover:bg-accent">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload Image"}
              </span>
            </label>
          </div>
          {station.images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {station.images.map((img, i) => (
                <a
                  key={img.url + i}
                  href={img.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border rounded-md overflow-hidden aspect-video bg-muted"
                >
                  <img src={img.url} alt={img.caption || station.name} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProjectDeepDive() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [doc, setDoc] = useState<EquipmentDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploadingStationId, setUploadingStationId] = useState<string | null>(null);

  const { data: projectNames = [], isLoading: loadingProjects } = useQuery<string[]>({
    queryKey: ["/api/project-names"],
    queryFn: async () => {
      const r = await fetch("/api/project-names");
      if (!r.ok) throw new Error("Failed to load project list");
      return r.json();
    },
  });

  const { data: fetchedDoc, isLoading: loadingDoc } = useQuery<EquipmentDoc>({
    queryKey: ["/api/equipment-docs", selectedProject],
    queryFn: async () => {
      const r = await fetch(`/api/equipment-docs/${encodeURIComponent(selectedProject)}`);
      if (!r.ok) throw new Error("Failed to load equipment doc");
      return r.json();
    },
    enabled: !!selectedProject,
    staleTime: 0,
  });

  useEffect(() => {
    if (fetchedDoc) {
      setDoc(fetchedDoc);
      setDirty(false);
    } else if (!selectedProject) {
      setDoc(null);
    }
  }, [fetchedDoc, selectedProject]);

  const saveMutation = useMutation({
    mutationFn: async (payload: EquipmentDoc) =>
      apiRequest("POST", `/api/equipment-docs/${encodeURIComponent(payload.projectName)}`, payload, true),
    onSuccess: (saved: any) => {
      setDoc(saved);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-docs", selectedProject] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Save failed", variant: "destructive" }),
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (vars: { stationId: string; file: File }) => {
      const base64 = await fileToBase64(vars.file);
      return apiRequest(
        "POST",
        `/api/equipment-docs/${encodeURIComponent(selectedProject)}/image`,
        { stationId: vars.stationId, filename: vars.file.name, base64 },
        true
      );
    },
    onSuccess: (result: any, vars) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const updated: EquipmentDoc = {
          ...prev,
          stations: prev.stations.map((s) =>
            s.id === vars.stationId
              ? { ...s, images: [...s.images, { url: result.url, uploadedAt: result.uploadedAt }] }
              : s
          ),
        };
        // persist immediately so the uploaded image isn't lost if the user navigates away
        queueMicrotask(() => saveMutation.mutate(updated));
        return updated;
      });
      setUploadingStationId(null);
    },
    onError: (e: any) => {
      setUploadingStationId(null);
      toast({ title: e?.message || "Image upload failed", variant: "destructive" });
    },
  });

  function handleSelectProject(name: string) {
    setSelectedProject(name);
    setDoc(name ? blankDoc(name) : null);
    setDirty(false);
  }

  function updateDoc(patch: Partial<EquipmentDoc>) {
    setDoc((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  function updateStation(id: string, patch: Partial<StationDoc>) {
    setDoc((prev) =>
      prev
        ? { ...prev, stations: prev.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
        : prev
    );
    setDirty(true);
  }

  function addStation() {
    setDoc((prev) => {
      if (!prev) return prev;
      const station = newStation(prev.stations.length);
      return { ...prev, hasMultipleStations: true, stations: [...prev.stations, station] };
    });
    setDirty(true);
  }

  function deleteStation(id: string) {
    setDoc((prev) =>
      prev ? { ...prev, stations: prev.stations.filter((s) => s.id !== id) } : prev
    );
    setDirty(true);
  }

  function handleUploadImage(stationId: string, file: File) {
    setUploadingStationId(stationId);
    uploadImageMutation.mutate({ stationId, file });
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Project Deep Dive</h1>
          <p className="text-sm text-muted-foreground">
            Macro-level equipment documentation — synopsis, PLC architecture, safety layout and
            per-station breakdown for each project.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <label className="text-sm font-medium mb-1 block">Select Project</label>
            <Select value={selectedProject} onValueChange={handleSelectProject}>
              <SelectTrigger className="max-w-md" data-testid="select-project-filter">
                <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Choose a project"} />
              </SelectTrigger>
              <SelectContent>
                {projectNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!selectedProject && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Select a project above to view or create its equipment documentation.
            </CardContent>
          </Card>
        )}

        {selectedProject && loadingDoc && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading...</CardContent>
          </Card>
        )}

        {selectedProject && doc && !loadingDoc && (
          <>
            <div className="flex items-center justify-between sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
              <div className="text-sm text-muted-foreground">
                {doc.updatedAt && `Last updated ${new Date(doc.updatedAt).toLocaleString()}`}
              </div>
              <Button
                onClick={() => saveMutation.mutate(doc)}
                disabled={!dirty || saveMutation.isPending}
                data-testid="button-save-doc"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" /> Synopsis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="What is this equipment? Purpose, scope, key process it performs..."
                  value={doc.synopsis}
                  onChange={(e) => updateDoc({ synopsis: e.target.value })}
                  data-testid="textarea-synopsis"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4" /> PLC Architecture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="PLC make/model, CPU, rack layout, remote I/O, network topology (Ethernet/IP, Profinet...), redundancy..."
                  value={doc.plcArchitecture}
                  onChange={(e) => updateDoc({ plcArchitecture: e.target.value })}
                  data-testid="textarea-plc-architecture"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" /> Safety Layout &amp; Architecture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="Safety PLC/relays, e-stops, light curtains, interlocks, category/SIL/PL rating, safety network..."
                  value={doc.safetyLayout}
                  onChange={(e) => updateDoc({ safetyLayout: e.target.value })}
                  data-testid="textarea-safety-layout"
                />
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Stations {doc.stations.length > 0 && `(${doc.stations.length})`}
              </h2>
              <Button variant="outline" onClick={addStation} data-testid="button-add-station">
                <Plus className="h-4 w-4 mr-2" /> Add Station
              </Button>
            </div>

            {doc.stations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  This equipment has no stations yet. Click "Add Station" if the equipment is
                  broken into multiple stations, otherwise leave empty for single-unit equipment.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {doc.stations.map((station, i) => (
                  <StationCard
                    key={station.id}
                    station={station}
                    index={i}
                    onChange={updateStation}
                    onDelete={deleteStation}
                    onUploadImage={handleUploadImage}
                    uploading={uploadingStationId === station.id}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-end pb-10">
              <Button
                onClick={() => saveMutation.mutate(doc)}
                disabled={!dirty || saveMutation.isPending}
                data-testid="button-save-doc-bottom"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
