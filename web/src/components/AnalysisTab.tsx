import React, { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getApiBaseUrl } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface PdfTask {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  result?: {
    summary: string;
    extractedTextPath: string;
    pageCount: number;
    fileSize: number;
    metadata: {
      inferredTimestamp?: string;
      analysisScores?: Record<string, number>;
    };
  };
}

const API_BASE_URL = getApiBaseUrl();

const AnalysisTab = () => {
  const [tasks, setTasks] = useState<PdfTask[]>([]);
  const [indexNames, setIndexNames] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const response = await fetch(`${API_BASE_URL}/status`);
    if (response.ok) {
      const data = await response.json();
      setTasks(data.tasks);
      // Collect all unique index names
      const allScores = data.tasks.flatMap((t: PdfTask) => Object.keys(t.result?.metadata?.analysisScores || {}));
      const uniqueScores = Array.from(new Set(allScores)) as string[];
      setIndexNames(uniqueScores);
      if (uniqueScores.length > 0 && !activeIndex) {
        setActiveIndex(uniqueScores[0] as string);
      }
    }
  };

  // Prepare chart data for the active index
  const getChartData = (indexName: string) => {
    // Only include tasks with a value for this index
    const filtered = tasks.filter(t => t.result?.metadata?.analysisScores && t.result.metadata.analysisScores[indexName] !== undefined);
    // Sort by inferredTimestamp or createdAt
    filtered.sort((a, b) => {
      const aTime = new Date(a.result?.metadata?.inferredTimestamp || a.createdAt).getTime();
      const bTime = new Date(b.result?.metadata?.inferredTimestamp || b.createdAt).getTime();
      return aTime - bTime;
    });
    return {
      labels: filtered.map(t => t.result?.metadata?.inferredTimestamp ? new Date(t.result.metadata.inferredTimestamp).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()),
      datasets: [
        {
          label: indexName.charAt(0).toUpperCase() + indexName.slice(1),
          data: filtered.map(t => t.result!.metadata.analysisScores![indexName]),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
        }
      ]
    };
  };

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Analysis Time Series</h3>
      {indexNames.length === 0 ? (
        <div className="text-slate-500">No analysis indices found.</div>
      ) : (
        <Tabs value={activeIndex || undefined} onValueChange={setActiveIndex} className="w-full">
          <TabsList className="mb-4">
            {indexNames.map(name => (
              <TabsTrigger key={name} value={name} className="capitalize">
                {name.replace(/_/g, ' ')}
              </TabsTrigger>
            ))}
          </TabsList>
          {indexNames.map(name => (
            <TabsContent key={name} value={name} className="space-y-6">
              <div className="bg-white rounded-lg shadow p-4 max-h-[400px]">
                <Line
                  data={getChartData(name)}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: false },
                      tooltip: { enabled: true }
                    },
                    scales: {
                      y: { min: 0, max: 1, title: { display: true, text: 'Score' } },
                      x: { title: { display: true, text: 'Date' } }
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tasks.filter(t => t.result?.metadata?.analysisScores && t.result.metadata.analysisScores[name] !== undefined)
                  .sort((a, b) => {
                    const aTime = new Date(a.result?.metadata?.inferredTimestamp || a.createdAt).getTime();
                    const bTime = new Date(b.result?.metadata?.inferredTimestamp || b.createdAt).getTime();
                    return aTime - bTime;
                  })
                  .map(task => (
                  <Card key={task.id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {task.status}
                      </Badge>
                      <span className="font-medium text-slate-900 truncate">{task.filename}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Date: {task.result?.metadata?.inferredTimestamp ? new Date(task.result.metadata.inferredTimestamp).toLocaleString() : new Date(task.createdAt).toLocaleString()}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{name.replace(/_/g, ' ')}:</span> {((task.result!.metadata.analysisScores![name] ?? 0) * 100).toFixed(0)}%
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default AnalysisTab;
