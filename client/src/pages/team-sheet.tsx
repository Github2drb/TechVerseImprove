import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamSheet() {
  const sharePointUrl = "https://3dcadglobal-my.sharepoint.com/:x:/g/personal/rameshbabu_d_3dcad-global_com/EeKNvRpu-l1EnPEMeoBHi60BqNxSjxcthBpLTzZ4dYDlYg?e=ZmPJ3y";

  return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6 md:py-12">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Team Excel Sheet</h1>
            <p className="text-muted-foreground">Access and update the shared team spreadsheet with project data and resources.</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-back-to-dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        <Card className="border-2" data-testid="sharepoint-container">
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-96 text-center">
            <div className="space-y-4">
              <div className="text-6xl">📊</div>
              <h2 className="text-xl font-semibold">Open Team Excel Sheet</h2>
              <p className="text-muted-foreground max-w-md">
                The SharePoint Excel sheet will open in a new window where you can view and update the team data directly.
              </p>
              <div className="flex gap-3 justify-center pt-4">
                <a
                  href={sharePointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="gap-2" data-testid="button-open-sharepoint">
                    <ExternalLink className="h-4 w-4" />
                    Open Excel Sheet
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
